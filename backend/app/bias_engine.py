"""
Polars-based bias detection engine for the National Bank Bias Detector.
CSV spec: Timestamp, Buy/Sell, Asset, Quantity, Price, P/L, Balance.
Modular so Sentiment Analysis can be added later via run_analysis() or a separate pipeline.
"""
from __future__ import annotations

import io
import polars as pl
from typing import Any

# Column names after normalization
COL_TIMESTAMP = "timestamp"
COL_ACTION = "action"
COL_ASSET = "asset"
COL_QUANTITY = "quantity"
COL_PRICE = "price"
COL_PNL = "pnl"
COL_BALANCE = "balance"

# Headers we accept (case-insensitive) -> internal name
CSV_HEADER_MAP = {
    "timestamp": COL_TIMESTAMP,
    "date": COL_TIMESTAMP,
    "time": COL_TIMESTAMP,
    "datetime": COL_TIMESTAMP,
    "buy/sell": COL_ACTION,
    "action": COL_ACTION,
    "side": COL_ACTION,
    "type": COL_ACTION,
    "asset": COL_ASSET,
    "symbol": COL_ASSET,
    "ticker": COL_ASSET,
    "quantity": COL_QUANTITY,
    "qty": COL_QUANTITY,
    "amount": COL_QUANTITY,
    "shares": COL_QUANTITY,
    "price": COL_PRICE,
    "entry_price": COL_PRICE,
    "p/l": COL_PNL,
    "pl": COL_PNL,
    "pnl": COL_PNL,
    "profit": COL_PNL,
    "balance": COL_BALANCE,
    "account_balance": COL_BALANCE,
}

# Cap rows returned in /analyze response to avoid huge JSON and frontend DOM crash
TRADES_RESPONSE_CAP = 10_000


def parse_csv_to_dataframe(csv_bytes: bytes) -> pl.DataFrame:
    """Parse CSV bytes into a normalized Polars DataFrame. Expects headers: Timestamp, Buy/Sell, Asset, Quantity, Price, P/L, Balance."""
    df = pl.read_csv(io.BytesIO(csv_bytes), infer_schema_length=1000)
    # Normalize column names (lowercase, strip)
    rename = {}
    for c in df.columns:
        key = c.strip().lower()
        if key in CSV_HEADER_MAP:
            rename[c] = CSV_HEADER_MAP[key]
    df = df.rename(rename)

    required = {COL_TIMESTAMP, COL_ACTION, COL_ASSET, COL_QUANTITY, COL_PRICE}
    if not required.issubset(df.columns):
        missing = required - set(df.columns)
        raise ValueError(f"Missing required columns: {missing}")

    # Ensure timestamp is datetime
    df = df.with_columns(pl.col(COL_TIMESTAMP).str.to_datetime(time_zone=None))
    # Normalize action to buy/sell
    action_col = pl.col(COL_ACTION).cast(pl.Utf8).str.to_lowercase()
    df = df.with_columns(
        pl.when(action_col.is_in(["buy", "b"]))
        .then(pl.lit("buy"))
        .otherwise(pl.lit("sell"))
        .alias(COL_ACTION)
    )
    # Numerics
    for col in (COL_QUANTITY, COL_PRICE, COL_PNL, COL_BALANCE):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Float64, strict=False))
    # Sort by time for all detectors
    df = df.sort(COL_TIMESTAMP)
    return df


def preprocess_trades(df: pl.DataFrame) -> tuple[pl.DataFrame, dict[str, Any]]:
    """
    Clean and preprocess the trades DataFrame: drop invalid rows, remove outliers (IQR),
    and deduplicate. Returns (cleaned_df, stats_dict) for transparency.
    """
    stats: dict[str, Any] = {"rows_before": df.height, "dropped_invalid": 0, "dropped_outliers": 0, "dropped_duplicates": 0}
    if df.height == 0:
        return df, stats

    # 1. Drop rows with null/invalid required columns
    valid_ts = pl.col(COL_TIMESTAMP).is_not_null()
    valid_action = pl.col(COL_ACTION).is_in(["buy", "sell"])
    valid_asset = pl.col(COL_ASSET).is_not_null() & (pl.col(COL_ASSET).str.strip_chars() != "")
    valid_qty = pl.col(COL_QUANTITY).is_not_null() & pl.col(COL_QUANTITY).is_finite() & (pl.col(COL_QUANTITY) > 0)
    valid_price = pl.col(COL_PRICE).is_not_null() & pl.col(COL_PRICE).is_finite() & (pl.col(COL_PRICE) > 0)

    df = df.filter(valid_ts & valid_action & valid_asset & valid_qty & valid_price)
    if df.height == 0:
        stats["rows_after"] = 0
        return df, stats

    # 2. Reasonable timestamp range (e.g. 1990–2030)
    try:
        min_ts = 631152000  # 1990-01-01
        max_ts = 1893456000  # 2030-01-01
        df = df.filter((pl.col(COL_TIMESTAMP).dt.epoch(time_unit="s") >= min_ts) & (pl.col(COL_TIMESTAMP).dt.epoch(time_unit="s") <= max_ts))
    except Exception:
        pass
    stats["dropped_invalid"] = stats["rows_before"] - df.height

    # 3. Remove numeric outliers (IQR) for P/L and Balance
    for col in [COL_PNL, COL_BALANCE]:
        if col not in df.columns or df.height < 10:
            continue
        s = df.select(pl.col(col)).to_series()
        s_clean = s.drop_nulls()
        if s_clean.len() < 10:
            continue
        q1_val = s_clean.quantile(0.25)
        q3_val = s_clean.quantile(0.75)
        if q1_val is None or q3_val is None:
            continue
        q1 = float(q1_val) if hasattr(q1_val, "__float__") else q1_val
        q3 = float(q3_val) if hasattr(q3_val, "__float__") else q3_val
        iqr = q3 - q1
        if iqr <= 0:
            continue
        low = q1 - 1.5 * iqr
        high = q3 + 1.5 * iqr
        before = df.height
        df = df.filter(
            pl.when(pl.col(col).is_null())
            .then(pl.lit(True))
            .otherwise((pl.col(col) >= low) & (pl.col(col) <= high))
        )
        stats["dropped_outliers"] += before - df.height

    # 4. Drop duplicate rows (same timestamp, asset, action, quantity, price)
    before = df.height
    df = df.unique(subset=[COL_TIMESTAMP, COL_ASSET, COL_ACTION, COL_QUANTITY, COL_PRICE])
    stats["dropped_duplicates"] = before - df.height
    stats["rows_after"] = df.height

    df = df.sort(COL_TIMESTAMP)
    return df, stats


def detect_overtrading(df: pl.DataFrame) -> tuple[dict[str, Any] | None, list[int]]:
    """
    Flag users if trade frequency exceeds 5 trades/hour or if they trade >10% of balance per ticket.
    Returns (bias_result_or_none, list of biased row indices).
    """
    if df.height < 2:
        return None, []

    n = df.height
    # Trades per hour: group by hour, count
    df_with_hour = df.with_columns(
        pl.col(COL_TIMESTAMP).dt.truncate("1h").alias("_hour")
    )
    hourly = df_with_hour.group_by("_hour").len()
    max_per_hour = hourly["len"].max()
    overtrading_by_freq = max_per_hour > 5

    # >10% of balance per ticket: notional = quantity * price; flag if notional > 0.1 * balance
    biased_indices: list[int] = []
    if COL_BALANCE in df.columns:
        notional = pl.col(COL_QUANTITY) * pl.col(COL_PRICE)
        pct_balance = notional / pl.col(COL_BALANCE).replace(0.0, None)
        df_with_pct = df.with_columns(pct_balance.alias("_pct_bal")).with_columns(
            pl.int_range(0, n).alias("_row_idx")
        )
        biased_indices = (
            df_with_pct.filter((pl.col("_pct_bal") > 0.1) & pl.col("_pct_bal").is_finite())
            .select("_row_idx")
            .to_series()
            .to_list()
        )
    if overtrading_by_freq:
        df_idx = df_with_hour.with_columns(pl.int_range(0, n).alias("_row_idx"))
        freq_indices = (
            df_idx.join(hourly.filter(pl.col("len") > 5).select("_hour"), on="_hour", how="inner")
            .select("_row_idx")
            .to_series()
            .to_list()
        )
        biased_indices = list(set(biased_indices) | set(freq_indices))

    # Score relative to dataset: compare max_per_hour to mean trades per hour in this dataset
    mean_per_hour = hourly["len"].mean()
    if mean_per_hour is None or mean_per_hour <= 0:
        mean_per_hour = 1.0
    # How extreme is max vs typical? ratio > 1 means clustering; score scales with ratio
    freq_ratio = max_per_hour / max(mean_per_hour, 0.5)
    score = 0.0
    if freq_ratio > 1.0:
        score += min(50, (freq_ratio - 1.0) * 25)  # ratio 3 -> 50, ratio 5 -> 100
    # Balance component: what share of trades exceeded 10% of balance?
    pct_over_balance = len(biased_indices) / max(n, 1)
    score += min(50, pct_over_balance * 250)  # 20% of trades -> 50
    score = min(100, score)
    if score < 15:
        return None, []

    severity = "critical" if score > 75 else "high" if score > 50 else "medium" if score > 25 else "low"
    result = {
        "type": "overtrading",
        "severity": severity,
        "title": "Overtrading Detected",
        "description": f"Trade frequency reached {int(max_per_hour)} trades per hour (threshold 5). "
        + (f"{len(biased_indices)} trade(s) exceeded 10% of balance per ticket." if biased_indices else ""),
        "details": {
            "max_trades_per_hour": int(max_per_hour),
            "mean_trades_per_hour": round(float(mean_per_hour), 2),
            "biased_trade_count": len(biased_indices),
        },
        "score": round(score),
    }
    return result, biased_indices


def detect_loss_aversion(df: pl.DataFrame) -> tuple[dict[str, Any] | None, list[int]]:
    """
    Compare duration of losing vs winning trades and average size of losses.
    Duration proxy: time since previous trade (holding period proxy).
    Returns (bias_result_or_none, list of biased row indices - e.g. losing trades held longer).
    """
    if COL_PNL not in df.columns or df.height < 3:
        return None, []

    # Duration = time since previous trade (seconds)
    df = df.with_columns(
        pl.col(COL_TIMESTAMP).diff().dt.total_seconds().alias("_duration_sec")
    )
    wins = df.filter(pl.col(COL_PNL) > 0)
    losses = df.filter(pl.col(COL_PNL) < 0)
    if wins.height == 0 or losses.height == 0:
        return None, []

    wins_valid = wins.filter(pl.col("_duration_sec").is_finite())
    losses_valid = losses.filter(pl.col("_duration_sec").is_finite())
    if wins_valid.height == 0 or losses_valid.height == 0:
        return None, []
    avg_duration_win = wins_valid.select(pl.col("_duration_sec").mean()).item()
    avg_duration_loss = losses_valid.select(pl.col("_duration_sec").mean()).item()
    avg_loss = losses.select(pl.col(COL_PNL).abs().mean()).item()
    avg_win = wins.select(pl.col(COL_PNL).mean()).item()
    loss_win_ratio = avg_loss / avg_win if avg_win and avg_win != 0 else 0
    # Loss aversion: hold losers longer (higher avg duration for losses) and/or larger avg loss
    duration_ratio = avg_duration_loss / avg_duration_win if avg_duration_win and avg_duration_win > 0 else 0

    # Score relative to severity: need substantial deviation from 1.0 to approach 100
    score = 0.0
    if duration_ratio > 1.1:
        score += min(50, (duration_ratio - 1) * 40)  # ratio 2.25 -> 50
    if loss_win_ratio > 1.1:
        score += min(50, (loss_win_ratio - 1) * 25)  # ratio 3 -> 50
    score = min(100, score)
    if score < 15:
        return None, []

    # Biased indices: losing trades that have duration above median loss duration (holding losers)
    median_loss_duration = losses.select(pl.col("_duration_sec").median()).item()
    df_idx = df.with_columns(pl.int_range(0, df.height).alias("_row_idx"))
    biased = df_idx.filter(
        (pl.col(COL_PNL) < 0)
        & (pl.col("_duration_sec") >= median_loss_duration)
        & pl.col("_duration_sec").is_finite()
    )
    biased_indices = biased.select("_row_idx").to_series().to_list()

    severity = "critical" if score > 70 else "high" if score > 45 else "medium" if score > 25 else "low"
    result = {
        "type": "loss_aversion",
        "severity": severity,
        "title": "Loss Aversion Bias",
        "description": f"Losing trades are held longer (avg {avg_duration_loss/60:.1f} min) than winners (avg {avg_duration_win/60:.1f} min). "
        f"Average loss ${avg_loss:.2f} vs average win ${avg_win:.2f} (ratio {loss_win_ratio:.2f}).",
        "details": {
            "avg_duration_win_min": round(avg_duration_win / 60, 2),
            "avg_duration_loss_min": round(avg_duration_loss / 60, 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "loss_win_ratio": round(loss_win_ratio, 2),
        },
        "score": round(score),
    }
    return result, biased_indices


def detect_revenge_trading(df: pl.DataFrame) -> tuple[dict[str, Any] | None, list[int]]:
    """
    Flag trades opened within 30 minutes of a loss where quantity > 1.5x the previous trade.
    Returns (bias_result_or_none, list of biased row indices).
    """
    if df.height < 2:
        return None, []

    n = df.height
    thirty_min_sec = 30 * 60
    ts_sec = pl.col(COL_TIMESTAMP).dt.epoch(time_unit="s")
    prev_pnl = pl.col(COL_PNL).shift(1) if COL_PNL in df.columns else pl.lit(None)
    df = df.with_columns(
        ts_sec.alias("_ts"),
        pl.col(COL_QUANTITY).shift(1).alias("_prev_qty"),
        prev_pnl.alias("_prev_pnl"),
    )
    # Time since previous trade
    df = df.with_columns((pl.col("_ts") - pl.col("_ts").shift(1)).alias("_dt_sec"))
    # Revenge: _prev_pnl < 0 and _dt_sec <= 30*60 and quantity > 1.5 * _prev_qty
    revenge_mask = (
        (pl.col("_prev_pnl") < 0)
        & (pl.col("_dt_sec") <= thirty_min_sec)
        & (pl.col("_dt_sec") > 0)
        & (pl.col(COL_QUANTITY) > 1.5 * pl.col("_prev_qty").fill_null(0))
    )
    df_idx = df.with_columns(pl.int_range(0, n).alias("_row_idx"))
    biased_indices = df_idx.filter(revenge_mask).select("_row_idx").to_series().to_list()

    count = len(biased_indices)
    # Score from entire dataset: revenge as a share of total trades (not raw count)
    revenge_rate = count / max(n, 1)
    score = min(100, revenge_rate * 400) if count else 0  # 25% of trades revenge -> 100; 5% -> 20
    if score < 15:
        return None, []

    severity = "critical" if score > 70 else "high" if score > 45 else "medium" if score > 25 else "low"
    result = {
        "type": "revenge_trading",
        "severity": severity,
        "title": "Revenge Trading Pattern",
        "description": f"{count} trade(s) opened within 30 minutes of a loss with quantity >1.5× the previous trade.",
        "details": {
            "revenge_trade_count": count,
            "revenge_rate_pct": round(revenge_rate * 100, 2),
            "total_trades": n,
        },
        "score": round(score),
    }
    return result, biased_indices


def detect_disposition_effect(df: pl.DataFrame) -> tuple[dict[str, Any] | None, list[int]]:
    """
    Approximate disposition effect using per-trade return proxy:
    return ~= pnl / (quantity * price).
    Flags when losing trades move materially further than winners before exit.
    """
    if COL_PNL not in df.columns or df.height < 8:
        return None, []

    n = df.height
    notional_expr = (pl.col(COL_QUANTITY) * pl.col(COL_PRICE)).abs().replace(0.0, None)
    df_ret = df.with_columns((pl.col(COL_PNL) / notional_expr).alias("_ret"))

    wins = df_ret.filter((pl.col(COL_PNL) > 0) & pl.col("_ret").is_finite())
    losses = df_ret.filter((pl.col(COL_PNL) < 0) & pl.col("_ret").is_finite())
    if wins.height < 3 or losses.height < 3:
        return None, []

    avg_win_move = wins.select(pl.col("_ret").abs().mean()).item()
    avg_loss_move = losses.select(pl.col("_ret").abs().mean()).item()
    if avg_win_move is None or avg_loss_move is None or avg_win_move <= 0:
        return None, []

    move_ratio = float(avg_loss_move) / float(avg_win_move)
    if move_ratio <= 1.2:
        return None, []

    loss_share = losses.height / max(n, 1)
    score = min(100, max(0.0, (move_ratio - 1.0) * 55) + min(35, loss_share * 35))
    if score < 15:
        return None, []

    # Biased rows: losses whose return magnitude is larger than typical winner move.
    df_idx = df_ret.with_columns(pl.int_range(0, n).alias("_row_idx"))
    biased_indices = (
        df_idx.filter((pl.col(COL_PNL) < 0) & (pl.col("_ret").abs() >= float(avg_win_move)))
        .select("_row_idx")
        .to_series()
        .to_list()
    )

    severity = "critical" if score > 75 else "high" if score > 50 else "medium" if score > 25 else "low"
    result = {
        "type": "disposition_effect",
        "severity": severity,
        "title": "Disposition Effect",
        "description": (
            f"Losing trades moved {move_ratio:.2f}x further than winners before exit "
            f"(avg loser move {float(avg_loss_move) * 100:.2f}% vs winner move {float(avg_win_move) * 100:.2f}%)."
        ),
        "details": {
            "avg_winner_move_pct": round(float(avg_win_move) * 100, 2),
            "avg_loser_move_pct": round(float(avg_loss_move) * 100, 2),
            "loser_to_winner_move_ratio": round(move_ratio, 2),
            "flagged_trade_count": len(biased_indices),
            "strategy_primary": "Define take-profit and stop-loss before entry and do not move either in-flight.",
            "strategy_secondary": "Use partial scaling rules so winners are not exited immediately on first green tick.",
        },
        "score": round(score),
    }
    return result, biased_indices


def detect_anchoring_bias(df: pl.DataFrame) -> tuple[dict[str, Any] | None, list[int]]:
    """
    Detect anchoring when the same asset is repeatedly traded at very similar price levels
    (low coefficient of variation), suggesting fixed-price fixation.
    """
    if df.height < 10:
        return None, []

    n = df.height
    grouped = (
        df.group_by(COL_ASSET)
        .agg(
            pl.len().alias("_count"),
            pl.col(COL_PRICE).mean().alias("_mean_price"),
            pl.col(COL_PRICE).std().fill_null(0.0).alias("_std_price"),
        )
        .filter((pl.col("_count") >= 4) & (pl.col("_mean_price") > 0))
        .with_columns((pl.col("_std_price") / pl.col("_mean_price")).alias("_cv"))
    )
    if grouped.height == 0:
        return None, []

    anchored_assets_df = grouped.filter(pl.col("_cv") <= 0.06)
    if anchored_assets_df.height == 0:
        return None, []

    anchored_assets = anchored_assets_df.select(COL_ASSET).to_series().to_list()
    anchored_trade_count = df.filter(pl.col(COL_ASSET).is_in(anchored_assets)).height
    anchored_share = anchored_trade_count / max(n, 1)
    avg_cv = anchored_assets_df.select(pl.col("_cv").mean()).item() or 0.0
    tightness = max(0.0, (0.08 - float(avg_cv)) / 0.08)
    score = min(100, anchored_share * 70 + tightness * 20 + anchored_assets_df.height * 6)
    if score < 15:
        return None, []

    df_idx = df.with_columns(pl.int_range(0, n).alias("_row_idx"))
    biased_indices = (
        df_idx.filter(pl.col(COL_ASSET).is_in(anchored_assets))
        .select("_row_idx")
        .to_series()
        .to_list()
    )

    severity = "critical" if score > 75 else "high" if score > 50 else "medium" if score > 25 else "low"
    result = {
        "type": "anchoring",
        "severity": severity,
        "title": "Anchoring Bias",
        "description": (
            f"You repeatedly entered {anchored_assets_df.height} asset(s) around near-identical levels "
            f"(avg price-variation CV {float(avg_cv) * 100:.2f}%), suggesting anchor fixation."
        ),
        "details": {
            "anchored_asset_count": anchored_assets_df.height,
            "anchored_trade_count": anchored_trade_count,
            "anchored_trade_share_pct": round(anchored_share * 100, 2),
            "anchored_assets": ", ".join(str(asset) for asset in anchored_assets[:6]),
            "strategy_primary": "Use scenario-based entry zones instead of one anchor price.",
            "strategy_secondary": "Require a fresh confirmation checklist when price revisits old levels.",
        },
        "score": round(score),
    }
    return result, biased_indices


def detect_confirmation_bias(df: pl.DataFrame) -> tuple[dict[str, Any] | None, list[int]]:
    """
    Detect directional confirmation bias by asset:
    repeatedly taking one side (buy or sell) despite mixed outcomes.
    """
    if df.height < 10:
        return None, []

    n = df.height
    by_asset = (
        df.group_by(COL_ASSET)
        .agg(
            pl.len().alias("_count"),
            (pl.col(COL_ACTION) == "buy").sum().alias("_buy_count"),
            (pl.col(COL_ACTION) == "sell").sum().alias("_sell_count"),
        )
        .filter(pl.col("_count") >= 4)
        .with_columns(
            pl.max_horizontal(pl.col("_buy_count"), pl.col("_sell_count")).alias("_dominant_count"),
            pl.when(pl.col("_buy_count") >= pl.col("_sell_count"))
            .then(pl.lit("buy"))
            .otherwise(pl.lit("sell"))
            .alias("_dominant_side"),
        )
        .with_columns((pl.col("_dominant_count") / pl.col("_count")).alias("_dominant_ratio"))
    )
    if by_asset.height == 0:
        return None, []

    biased_assets_df = by_asset.filter(pl.col("_dominant_ratio") >= 0.82)
    if biased_assets_df.height == 0:
        return None, []

    df_idx = df.with_columns(pl.int_range(0, n).alias("_row_idx"))
    joined = df_idx.join(
        biased_assets_df.select([COL_ASSET, "_dominant_side"]),
        on=COL_ASSET,
        how="inner",
    )
    biased_indices = (
        joined.filter(pl.col(COL_ACTION) == pl.col("_dominant_side"))
        .select("_row_idx")
        .to_series()
        .to_list()
    )

    biased_trade_share = len(biased_indices) / max(n, 1)
    avg_ratio = float(biased_assets_df.select(pl.col("_dominant_ratio").mean()).item() or 0.0)
    score = min(100, biased_trade_share * 65 + max(0.0, avg_ratio - 0.7) * 100 + biased_assets_df.height * 5)
    if score < 15:
        return None, []

    severity = "critical" if score > 75 else "high" if score > 50 else "medium" if score > 25 else "low"
    result = {
        "type": "confirmation_bias",
        "severity": severity,
        "title": "Confirmation Bias",
        "description": (
            f"{biased_assets_df.height} asset(s) show persistent one-sided directionality "
            f"(avg dominant-side ratio {avg_ratio * 100:.1f}%), indicating thesis-only execution."
        ),
        "details": {
            "biased_asset_count": biased_assets_df.height,
            "biased_trade_count": len(biased_indices),
            "biased_trade_share_pct": round(biased_trade_share * 100, 2),
            "avg_dominant_side_ratio_pct": round(avg_ratio * 100, 2),
            "strategy_primary": "Add a mandatory disconfirming-evidence checklist before each entry.",
            "strategy_secondary": "Block same-side re-entries unless market structure changed from prior setup.",
        },
        "score": round(score),
    }
    return result, biased_indices


def run_analysis(df: pl.DataFrame) -> dict[str, Any]:
    """
    Single entry point: preprocess CSV, then run all bias detectors and return biases, trade_flags, bias_score, and trades.
    Designed so a future run_sentiment() or sentiment module can be composed here.
    """
    df, preprocess_stats = preprocess_trades(df)
    if df.height == 0:
        return {
            "biases": [],
            "trade_flags": {
                "overtrading": [],
                "loss_aversion": [],
                "revenge_trading": [],
                "disposition_effect": [],
                "anchoring": [],
                "confirmation_bias": [],
            },
            "bias_score": 0,
            "trades": [],
            "total_trades": 0,
            "hour_counts": [0] * 24,
            "preprocess": preprocess_stats,
        }

    total_trades = df.height

    select_exprs = [
        pl.col(COL_TIMESTAMP).dt.strftime("%Y-%m-%dT%H:%M:%S").alias("timestamp"),
        pl.col(COL_ACTION).alias("buy_sell"),
        pl.col(COL_ASSET).alias("asset"),
        pl.col(COL_QUANTITY).alias("quantity"),
        pl.col(COL_PRICE).alias("price"),
    ]
    if COL_PNL in df.columns:
        select_exprs.append(pl.col(COL_PNL).alias("p_l"))
    else:
        select_exprs.append(pl.lit(None).cast(pl.Float64).alias("p_l"))
    if COL_BALANCE in df.columns:
        select_exprs.append(pl.col(COL_BALANCE).alias("balance"))
    else:
        select_exprs.append(pl.lit(None).cast(pl.Float64).alias("balance"))
    # Hour counts for heatmap (from full dataset, before capping)
    hour_counts = [0] * 24
    for row in df.with_columns(pl.col(COL_TIMESTAMP).dt.hour().alias("h")).group_by("h").agg(pl.len().alias("c")).iter_rows():
        hour_counts[row[0]] = row[1]
    trades_out = df.select(select_exprs).head(TRADES_RESPONSE_CAP).to_dicts()

    ot_result, ot_indices = detect_overtrading(df)
    la_result, la_indices = detect_loss_aversion(df)
    rv_result, rv_indices = detect_revenge_trading(df)
    dp_result, dp_indices = detect_disposition_effect(df)
    an_result, an_indices = detect_anchoring_bias(df)
    cf_result, cf_indices = detect_confirmation_bias(df)

    biases = []
    if ot_result:
        biases.append(ot_result)
    if la_result:
        biases.append(la_result)
    if rv_result:
        biases.append(rv_result)
    if dp_result:
        biases.append(dp_result)
    if an_result:
        biases.append(an_result)
    if cf_result:
        biases.append(cf_result)
    biases.sort(key=lambda b: b["score"], reverse=True)

    # Aggregate bias score 0-100 (median so one severe bias doesn't force overall to 100)
    scores = [b["score"] for b in biases]
    if not scores:
        bias_score = 0
    else:
        sorted_scores = sorted(scores)
        n = len(sorted_scores)
        bias_score = sorted_scores[n // 2] if n % 2 else (sorted_scores[n // 2 - 1] + sorted_scores[n // 2]) / 2
    bias_score = round(min(100, max(0, bias_score)))

    trade_flags = {
        "overtrading": ot_indices,
        "loss_aversion": la_indices,
        "revenge_trading": rv_indices,
        "disposition_effect": dp_indices,
        "anchoring": an_indices,
        "confirmation_bias": cf_indices,
    }

    return {
        "biases": biases,
        "trade_flags": trade_flags,
        "bias_score": bias_score,
        "trades": trades_out,
        "total_trades": total_trades,
        "hour_counts": hour_counts,
        "preprocess": preprocess_stats,
    }
