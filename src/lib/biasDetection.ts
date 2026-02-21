// Bias Detection Engine

/** Fallback balance when computing "big move" threshold (3%) when account_balance is missing. */
const DEFAULT_ACCOUNT_BALANCE_FOR_PCT = 10_000;

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
    if (prev.pnl && Math.abs(prev.pnl) > (prev.account_balance ?? DEFAULT_ACCOUNT_BALANCE_FOR_PCT) * 0.03) {
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

    if (prev.pnl && prev.pnl < 0) {
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
    if (sorted[i].pnl && sorted[i].pnl! < 0) {
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
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim());

  const findCol = (names: string[]) => {
    for (const name of names) {
      const idx = headers.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const timestampIdx = findCol(['timestamp', 'date', 'time', 'datetime']);
  const actionIdx = findCol(['action', 'buy/sell', 'side', 'type', 'direction']);
  const assetIdx = findCol(['asset', 'symbol', 'ticker', 'instrument', 'stock']);
  const quantityIdx = findCol(['quantity', 'qty', 'amount', 'shares', 'size']);
  const entryPriceIdx = findCol(['entry_price', 'entry price', 'price', 'open_price', 'open']);
  const exitPriceIdx = findCol(['exit_price', 'exit price', 'close_price', 'close']);
  const pnlIdx = findCol(['pnl', 'p/l', 'profit', 'profit_loss', 'profit/loss', 'pl']);
  const balanceIdx = findCol(['account_balance', 'balance', 'account']);
  const notesIdx = findCol(['notes', 'comment', 'comments']);

  if (timestampIdx === -1 || actionIdx === -1 || assetIdx === -1) return [];

  const trades: Trade[] = [];

  const parseOptionalNumber = (raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const cleaned = raw.trim();
    if (cleaned === '') return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < 3) continue;

    const actionRaw = cols[actionIdx]?.toLowerCase();
    let action: 'buy' | 'sell' | null = null;
    if (actionRaw === 'buy' || actionRaw === 'b') action = 'buy';
    if (actionRaw === 'sell' || actionRaw === 's') action = 'sell';
    if (!action) continue;

    const asset = cols[assetIdx]?.trim();
    if (!asset) continue;

    const quantity = quantityIdx !== -1 ? Number(cols[quantityIdx]) : 0;
    const entryPrice = entryPriceIdx !== -1 ? Number(cols[entryPriceIdx]) : 0;
    if (!Number.isFinite(quantity) || !Number.isFinite(entryPrice) || quantity <= 0 || entryPrice <= 0) continue;

    trades.push({
      timestamp: cols[timestampIdx] || new Date().toISOString(),
      action,
      asset,
      quantity,
      entry_price: entryPrice,
      exit_price: exitPriceIdx !== -1 ? parseOptionalNumber(cols[exitPriceIdx]) : undefined,
      pnl: pnlIdx !== -1 ? parseOptionalNumber(cols[pnlIdx]) : undefined,
      account_balance: balanceIdx !== -1 ? parseOptionalNumber(cols[balanceIdx]) : undefined,
      notes: notesIdx !== -1 ? cols[notesIdx] : undefined,
    });
  }

  return trades;
}
