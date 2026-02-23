// Bias Detection Engine

/** Fallback balance when computing "big move" threshold (3%) when account_balance is missing. */
const DEFAULT_ACCOUNT_BALANCE_FOR_PCT = 10_000;
const CSV_SPLIT_REGEX = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;

const parseNumeric = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const cleaned = raw.trim();
  if (cleaned === '') return undefined;
  const normalized = cleaned
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/[$,%\s]/g, '')
    .replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const splitCsvRow = (row: string): string[] =>
  row.split(CSV_SPLIT_REGEX).map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"').trim();
    }
    return trimmed;
  });

const normalizeAction = (raw: string | undefined): 'buy' | 'sell' | null => {
  const value = raw?.trim().toLowerCase();
  if (value === 'buy' || value === 'b' || value === 'bot' || value === 'long' || value === 'cover') return 'buy';
  if (value === 'sell' || value === 's' || value === 'sld' || value === 'short') return 'sell';
  return null;
};

export interface Trade {
  id?: string;
  timestamp: string;
  action: 'buy' | 'sell';
  asset: string;
  quantity: number;
  entry_price: number;
  exit_price?: number;
  pnl?: number;
  account_balance?: number;
  notes?: string;
}

export interface BiasResult {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  details: Record<string, any>;
  score: number; // 0-100
}

export function detectOvertrading(trades: Trade[]): BiasResult | null {
  if (trades.length < 5) return null;

  const sorted = [...trades].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Check trades per hour clustering
  const hourBuckets: Record<string, number> = {};
  sorted.forEach(t => {
    const hour = new Date(t.timestamp).toISOString().slice(0, 13);
    hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
  });

  const maxTradesPerHour = Math.max(...Object.values(hourBuckets));
  const avgTradesPerHour = trades.length / Object.keys(hourBuckets).length;

  // Check trades after large losses/wins
  let tradesAfterBigMove = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const baselineBalance = Math.max(1, Math.abs(prev.account_balance ?? DEFAULT_ACCOUNT_BALANCE_FOR_PCT));
    if (prev.pnl != null && Number.isFinite(prev.pnl) && Math.abs(prev.pnl) > baselineBalance * 0.03) {
      const timeDiff = new Date(sorted[i].timestamp).getTime() - new Date(prev.timestamp).getTime();
      if (timeDiff < 3600000) tradesAfterBigMove++;
    }
  }

  // Frequent position switching
  let positionSwitches = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].action !== sorted[i - 1].action && sorted[i].asset === sorted[i - 1].asset) {
      positionSwitches++;
    }
  }

  const score = Math.min(100, (maxTradesPerHour * 15) + (tradesAfterBigMove * 20) + (positionSwitches / trades.length * 50));

  if (score < 20) return null;

  const severity = score > 75 ? 'critical' : score > 50 ? 'high' : score > 30 ? 'medium' : 'low';

  return {
    type: 'overtrading',
    severity,
    title: 'Overtrading Detected',
    description: `You executed up to ${maxTradesPerHour} trades in a single hour with ${tradesAfterBigMove} trades immediately following large P/L movements. This suggests impulsive trading behavior.`,
    details: {
      maxTradesPerHour,
      avgTradesPerHour: Math.round(avgTradesPerHour * 10) / 10,
      tradesAfterBigMove,
      positionSwitches,
    },
    score: Math.round(score),
  };
}

export function detectLossAversion(trades: Trade[]): BiasResult | null {
  const closedTrades = trades.filter(t => t.pnl !== null && t.pnl !== undefined);
  if (closedTrades.length < 5) return null;

  const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl || 0) < 0);

  if (wins.length === 0 || losses.length === 0) return null;

  const avgWin = wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length);
  if (avgWin <= 0) return null;

  // Check if avg loss > avg win (holding losers, cutting winners)
  const lossWinRatio = avgLoss / avgWin;

  // Check holding times if we can infer them
  const winRate = wins.length / closedTrades.length;

  const score = Math.min(100, (lossWinRatio > 1 ? (lossWinRatio - 1) * 40 : 0) + (winRate > 0.6 ? 0 : (0.6 - winRate) * 80));

  if (score < 15) return null;

  const severity = score > 70 ? 'critical' : score > 45 ? 'high' : score > 25 ? 'medium' : 'low';

  return {
    type: 'loss_aversion',
    severity,
    title: 'Loss Aversion Bias',
    description: `Your average loss ($${avgLoss.toFixed(2)}) is ${lossWinRatio.toFixed(1)}x your average win ($${avgWin.toFixed(2)}). This suggests you may be letting losers run and cutting winners short.`,
    details: {
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      lossWinRatio: Math.round(lossWinRatio * 100) / 100,
      winRate: Math.round(winRate * 100),
      totalWins: wins.length,
      totalLosses: losses.length,
    },
    score: Math.round(score),
  };
}

export function detectRevengeTrading(trades: Trade[]): BiasResult | null {
  if (trades.length < 5) return null;

  const sorted = [...trades].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let revengeInstances = 0;
  let increasedRiskAfterLoss = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (prev.pnl != null && prev.pnl < 0) {
      const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
      if (timeDiff < 1800000) { // within 30 min
        revengeInstances++;
        if (curr.quantity * curr.entry_price > prev.quantity * prev.entry_price * 1.2) {
          increasedRiskAfterLoss++;
        }
      }
    }
  }

  // Check for loss streaks followed by big bets
  let consecutiveLosses = 0;
  let bigBetsAfterStreaks = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].pnl != null && sorted[i].pnl < 0) {
      consecutiveLosses++;
    } else {
      if (consecutiveLosses >= 3 && i < sorted.length - 1) {
        const nextTrade = sorted[i + 1];
        if (nextTrade && nextTrade.quantity * nextTrade.entry_price > sorted[i].quantity * sorted[i].entry_price * 1.5) {
          bigBetsAfterStreaks++;
        }
      }
      consecutiveLosses = 0;
    }
  }

  const score = Math.min(100, (revengeInstances * 15) + (increasedRiskAfterLoss * 25) + (bigBetsAfterStreaks * 30));

  if (score < 15) return null;

  const severity = score > 70 ? 'critical' : score > 45 ? 'high' : score > 25 ? 'medium' : 'low';

  return {
    type: 'revenge_trading',
    severity,
    title: 'Revenge Trading Pattern',
    description: `${revengeInstances} trades were placed within 30 minutes of a loss, with ${increasedRiskAfterLoss} involving increased position sizes. This impulsive behavior risks compounding losses.`,
    details: {
      revengeInstances,
      increasedRiskAfterLoss,
      bigBetsAfterStreaks,
    },
    score: Math.round(score),
  };
}

export function detectOverconfidenceBias(trades: Trade[]): BiasResult | null {
  const closedTrades = trades.filter((t) => t.pnl !== null && t.pnl !== undefined);
  if (trades.length < 8 || closedTrades.length < 5) return null;

  const sorted = [...trades].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let upsizeAfterWin = 0;
  let rapidUpsizeAfterWin = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (prev.pnl == null || prev.pnl <= 0) continue;

    const prevNotional = Math.abs(prev.quantity * prev.entry_price);
    const currNotional = Math.abs(curr.quantity * curr.entry_price);
    if (!Number.isFinite(prevNotional) || !Number.isFinite(currNotional) || prevNotional <= 0 || currNotional <= 0) continue;

    if (currNotional >= prevNotional * 1.35) {
      upsizeAfterWin++;
    }

    const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    if (timeDiff > 0 && timeDiff <= 45 * 60 * 1000 && currNotional >= prevNotional * 1.2) {
      rapidUpsizeAfterWin++;
    }
  }

  const winRate = closedTrades.filter((t) => (t.pnl || 0) > 0).length / closedTrades.length;
  const score = Math.min(100, (upsizeAfterWin * 14) + (rapidUpsizeAfterWin * 12) + Math.max(0, (winRate - 0.55) * 100));
  if (score < 15) return null;

  const severity = score > 75 ? 'critical' : score > 50 ? 'high' : score > 30 ? 'medium' : 'low';

  return {
    type: 'overconfidence',
    severity,
    title: 'Overconfidence Bias',
    description: `${upsizeAfterWin} trade(s) were materially upsized after wins, including ${rapidUpsizeAfterWin} rapid re-entries within 45 minutes. This may indicate confidence drift after recent success.`,
    details: {
      upsizeAfterWin,
      rapidUpsizeAfterWin,
      winRate: Math.round(winRate * 100),
      closedTrades: closedTrades.length,
    },
    score: Math.round(score),
  };
}

export function detectConcentrationBias(trades: Trade[]): BiasResult | null {
  if (trades.length < 10) return null;

  const assetCounts: Record<string, number> = {};
  const assetNotional: Record<string, number> = {};
  trades.forEach((t) => {
    assetCounts[t.asset] = (assetCounts[t.asset] || 0) + 1;
    assetNotional[t.asset] = (assetNotional[t.asset] || 0) + Math.abs(t.quantity * t.entry_price);
  });

  const rankedAssets = Object.entries(assetCounts).sort((a, b) => b[1] - a[1]);
  if (rankedAssets.length === 0) return null;

  const topAsset = rankedAssets[0][0];
  const topAssetTrades = rankedAssets[0][1];
  const secondAssetTrades = rankedAssets[1]?.[1] ?? 0;
  const topShare = topAssetTrades / trades.length;
  const topTwoShare = (topAssetTrades + secondAssetTrades) / trades.length;

  if (topShare < 0.45 && topTwoShare < 0.75) return null;

  const uniqueAssets = rankedAssets.length;
  const diversityPenalty = uniqueAssets <= 3 ? (4 - uniqueAssets) * 8 : 0;
  const score = Math.min(
    100,
    Math.max(0, ((topShare - 0.4) * 130) + ((topTwoShare - 0.65) * 90) + diversityPenalty),
  );
  if (score < 15) return null;

  const topNotional = assetNotional[topAsset] || 0;
  const totalNotional = Math.max(1, Object.values(assetNotional).reduce((sum, value) => sum + value, 0));
  const topNotionalShare = topNotional / totalNotional;
  const severity = score > 75 ? 'critical' : score > 50 ? 'high' : score > 30 ? 'medium' : 'low';

  return {
    type: 'concentration_bias',
    severity,
    title: 'Concentration Bias',
    description: `${(topShare * 100).toFixed(1)}% of trades are concentrated in ${topAsset}${topTwoShare >= 0.75 ? `, and top-2 assets account for ${(topTwoShare * 100).toFixed(1)}% of activity` : ''}. This concentration can increase idiosyncratic risk.`,
    details: {
      topAsset,
      topAssetTrades,
      topAssetSharePct: Math.round(topShare * 100),
      topTwoSharePct: Math.round(topTwoShare * 100),
      topNotionalSharePct: Math.round(topNotionalShare * 100),
      uniqueAssets,
    },
    score: Math.round(score),
  };
}

export function detectDispositionEffect(trades: Trade[]): BiasResult | null {
  const closedTrades = trades.filter(t => t.pnl !== null && t.pnl !== undefined && t.exit_price);
  if (closedTrades.length < 5) return null;

  // Disposition effect: selling winners too quickly, holding losers too long
  // Approximate by comparing price movements
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl || 0) < 0);

  if (wins.length < 2 || losses.length < 2) return null;

  const avgWinPctMove = wins.reduce((s, t) => s + Math.abs(((t.exit_price || t.entry_price) - t.entry_price) / t.entry_price), 0) / wins.length;
  const avgLossPctMove = losses.reduce((s, t) => s + Math.abs(((t.exit_price || t.entry_price) - t.entry_price) / t.entry_price), 0) / losses.length;

  const ratio = avgLossPctMove / avgWinPctMove;
  if (ratio < 1.3) return null;

  const score = Math.min(100, (ratio - 1) * 50);
  const severity = score > 60 ? 'high' : score > 35 ? 'medium' : 'low';

  return {
    type: 'disposition_effect',
    severity,
    title: 'Disposition Effect',
    description: `Your losing trades move ${(ratio).toFixed(1)}x further than your winners before closing, suggesting you hold losers too long while selling winners prematurely.`,
    details: {
      avgWinPctMove: (avgWinPctMove * 100).toFixed(2),
      avgLossPctMove: (avgLossPctMove * 100).toFixed(2),
      ratio: ratio.toFixed(2),
      strategyPrimary: 'Predefine both take-profit and stop-loss before entry and keep them fixed during the trade.',
      strategySecondary: 'Scale out winners using fixed rules instead of closing full size on the first positive move.',
    },
    score: Math.round(score),
  };
}

export function detectAnchoringBias(trades: Trade[]): BiasResult | null {
  if (trades.length < 10) return null;

  // Check if user repeatedly trades the same assets at similar price points
  const assetPrices: Record<string, number[]> = {};
  trades.forEach(t => {
    if (!assetPrices[t.asset]) assetPrices[t.asset] = [];
    assetPrices[t.asset].push(t.entry_price);
  });

  let anchoredAssets = 0;
  Object.entries(assetPrices).forEach(([, prices]) => {
    if (prices.length < 3) return;
    const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
    const variance = prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / prices.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv < 0.05) anchoredAssets++;
  });

  if (anchoredAssets === 0) return null;

  const score = Math.min(100, anchoredAssets * 30);
  const severity = score > 60 ? 'high' : score > 30 ? 'medium' : 'low';

  return {
    type: 'anchoring',
    severity,
    title: 'Anchoring Bias',
    description: `You appear anchored to specific price levels in ${anchoredAssets} asset(s), repeatedly entering at nearly identical prices regardless of market conditions.`,
    details: {
      anchoredAssets,
      strategyPrimary: 'Define entry zones with confirmation triggers, not a single anchor price.',
      strategySecondary: 'Require a fresh checklist before re-entering near previously traded levels.',
    },
    score: Math.round(score),
  };
}

export function detectConfirmationBias(trades: Trade[]): BiasResult | null {
  if (trades.length < 10) return null;

  // Check if user always trades the same direction on the same asset
  const assetDirections: Record<string, { buys: number; sells: number }> = {};
  trades.forEach(t => {
    if (!assetDirections[t.asset]) assetDirections[t.asset] = { buys: 0, sells: 0 };
    if (t.action === 'buy') assetDirections[t.asset].buys++;
    else assetDirections[t.asset].sells++;
  });

  let biasedAssets = 0;
  Object.values(assetDirections).forEach(({ buys, sells }) => {
    const total = buys + sells;
    if (total < 3) return;
    const ratio = Math.max(buys, sells) / total;
    if (ratio > 0.85) biasedAssets++;
  });

  if (biasedAssets === 0) return null;

  const score = Math.min(100, biasedAssets * 25);
  const severity = score > 50 ? 'high' : score > 25 ? 'medium' : 'low';

  return {
    type: 'confirmation_bias',
    severity,
    title: 'Confirmation Bias',
    description: `You show a strong directional preference in ${biasedAssets} asset(s), consistently trading one direction despite mixed market signals.`,
    details: {
      biasedAssets,
      assetDirections,
      strategyPrimary: 'Write one disconfirming reason before every trade and size down if you cannot.',
      strategySecondary: 'Block same-side re-entries unless market structure has clearly changed.',
    },
    score: Math.round(score),
  };
}

export function runFullAnalysis(trades: Trade[]): BiasResult[] {
  const results: BiasResult[] = [];

  const detectors = [
    detectOvertrading,
    detectLossAversion,
    detectRevengeTrading,
    detectOverconfidenceBias,
    detectConcentrationBias,
    detectDispositionEffect,
    detectAnchoringBias,
    detectConfirmationBias,
  ];

  detectors.forEach(detector => {
    const result = detector(trades);
    if (result) results.push(result);
  });

  return results.sort((a, b) => b.score - a.score);
}

export function calculateRiskProfile(trades: Trade[], biases: BiasResult[]) {
  const overtradingScore = biases.find(b => b.type === 'overtrading')?.score || 0;
  const lossAversionScore = biases.find(b => b.type === 'loss_aversion')?.score || 0;
  const revengeTradingScore = biases.find(b => b.type === 'revenge_trading')?.score || 0;

  const disciplineScore = Math.max(0, 100 - (overtradingScore * 0.4 + revengeTradingScore * 0.6));
  const emotionalControlScore = Math.max(0, 100 - (revengeTradingScore * 0.5 + lossAversionScore * 0.5));
  const overallScore = Math.max(0, 100 - biases.reduce((s, b) => s + b.score, 0) / Math.max(biases.length, 1));

  return {
    overallScore: Math.round(overallScore),
    overtradingScore: Math.round(overtradingScore),
    lossAversionScore: Math.round(lossAversionScore),
    revengeTradingScore: Math.round(revengeTradingScore),
    disciplineScore: Math.round(disciplineScore),
    emotionalControlScore: Math.round(emotionalControlScore),
  };
}

export function parseCSV(csvText: string): Trade[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvRow(lines[0]).map((h) => h.toLowerCase().trim());

  const findCol = (names: string[]) => {
    for (const name of names) {
      const idx = headers.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const timestampIdx = findCol(['timestamp', 'date', 'time', 'datetime']);
  const actionIdx = findCol(['action', 'buy/sell', 'buy_sell', 'buy-sell', 'side', 'type', 'direction']);
  const assetIdx = findCol(['asset', 'symbol', 'ticker', 'instrument', 'stock']);
  const quantityIdx = findCol(['quantity', 'qty', 'amount', 'shares', 'size']);
  const entryPriceIdx = findCol(['entry_price', 'entry price', 'price', 'open_price', 'open', 'entry']);
  const exitPriceIdx = findCol(['exit_price', 'exit price', 'close_price', 'close']);
  const pnlIdx = findCol(['pnl', 'p/l', 'profit', 'profit_loss', 'profit/loss', 'realized_pnl', 'realized p/l', 'p&l', 'pl']);
  const balanceIdx = findCol(['account_balance', 'balance', 'account', 'account value']);
  const notesIdx = findCol(['notes', 'comment', 'comments']);

  if (timestampIdx === -1 || actionIdx === -1 || assetIdx === -1) return [];

  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    if (cols.length < 3) continue;

    const action = normalizeAction(cols[actionIdx]);
    if (!action) continue;

    const asset = cols[assetIdx]?.trim();
    if (!asset) continue;

    const quantity = quantityIdx !== -1 ? parseNumeric(cols[quantityIdx]) ?? 0 : 0;
    const entryPrice = entryPriceIdx !== -1 ? parseNumeric(cols[entryPriceIdx]) ?? 0 : 0;
    if (!Number.isFinite(quantity) || !Number.isFinite(entryPrice) || quantity <= 0 || entryPrice <= 0) continue;

    trades.push({
      timestamp: cols[timestampIdx] || new Date().toISOString(),
      action,
      asset,
      quantity,
      entry_price: entryPrice,
      exit_price: exitPriceIdx !== -1 ? parseNumeric(cols[exitPriceIdx]) : undefined,
      pnl: pnlIdx !== -1 ? parseNumeric(cols[pnlIdx]) : undefined,
      account_balance: balanceIdx !== -1 ? parseNumeric(cols[balanceIdx]) : undefined,
      notes: notesIdx !== -1 ? cols[notesIdx] : undefined,
    });
  }

  return trades;
}
