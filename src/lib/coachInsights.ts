export type InsightTrade = {
  timestamp: string;
  asset?: string | null;
  action?: string | null;
  quantity?: number | null;
  entry_price?: number | null;
  pnl?: number | null;
  notes?: string | null;
};

export type InsightBias = {
  analysis_type?: string | null;
  severity?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
};

export type InsightSuggestion = {
  title: string;
  recommendation: string;
};

export type TimelinePoint = {
  date: string;
  dailyPnl: number;
  cumulativePnl: number;
  tradeCount: number;
};

export type HeatmapPoint = {
  day: number;
  hour: number;
  count: number;
};

export type AssetMixPoint = {
  asset: string;
  trades: number;
  pnl: number;
};

export type CoachInsights = {
  biasSummaries: string[];
  suggestions: InsightSuggestion[];
  journalingPrompts: string[];
  timeline: TimelinePoint[];
  heatmap: HeatmapPoint[];
  assetMix: AssetMixPoint[];
  stats: {
    totalTrades: number;
    totalPnl: number;
    winRate: number;
    avgTradesPerDay: number;
    revengeTradeCount: number;
    highVolatilityFollowUps: number;
  };
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const toFiniteNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (timestamp: string): string | null => {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
};

const computeRevengeTradeCount = (sortedTrades: InsightTrade[]): number => {
  let count = 0;
  for (let i = 1; i < sortedTrades.length; i += 1) {
    const previous = sortedTrades[i - 1];
    const current = sortedTrades[i];
    const previousPnl = toFiniteNumber(previous.pnl);
    if (previousPnl >= 0) continue;

    const previousTs = new Date(previous.timestamp).getTime();
    const currentTs = new Date(current.timestamp).getTime();
    if (!Number.isFinite(previousTs) || !Number.isFinite(currentTs)) continue;

    if (currentTs - previousTs <= 30 * 60 * 1000) count += 1;
  }
  return count;
};

const computeHighVolatilityFollowUps = (sortedTrades: InsightTrade[]): number => {
  const absPnls = sortedTrades.map((trade) => Math.abs(toFiniteNumber(trade.pnl))).filter((value) => value > 0);
  if (absPnls.length < 6) return 0;

  const threshold = quantile(absPnls, 0.75);
  if (threshold <= 0) return 0;

  let followUps = 0;
  for (let i = 1; i < sortedTrades.length; i += 1) {
    const previous = sortedTrades[i - 1];
    const current = sortedTrades[i];
    const prevAbsPnl = Math.abs(toFiniteNumber(previous.pnl));
    if (prevAbsPnl < threshold) continue;

    const previousTs = new Date(previous.timestamp).getTime();
    const currentTs = new Date(current.timestamp).getTime();
    if (!Number.isFinite(previousTs) || !Number.isFinite(currentTs)) continue;

    if (currentTs - previousTs <= 20 * 60 * 1000) followUps += 1;
  }
  return followUps;
};

const computeTimeline = (trades: InsightTrade[]): TimelinePoint[] => {
  const buckets = new Map<string, { dailyPnl: number; tradeCount: number }>();
  trades.forEach((trade) => {
    const date = toIsoDate(trade.timestamp);
    if (!date) return;
    const bucket = buckets.get(date) || { dailyPnl: 0, tradeCount: 0 };
    bucket.dailyPnl += toFiniteNumber(trade.pnl);
    bucket.tradeCount += 1;
    buckets.set(date, bucket);
  });

  let cumulativePnl = 0;
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => {
      cumulativePnl += bucket.dailyPnl;
      return {
        date,
        dailyPnl: Math.round(bucket.dailyPnl * 100) / 100,
        cumulativePnl: Math.round(cumulativePnl * 100) / 100,
        tradeCount: bucket.tradeCount,
      };
    });
};

const computeHeatmap = (trades: InsightTrade[]): HeatmapPoint[] => {
  const buckets = new Map<string, number>();

  trades.forEach((trade) => {
    const parsed = new Date(trade.timestamp);
    if (Number.isNaN(parsed.getTime())) return;
    const key = `${parsed.getDay()}-${parsed.getHours()}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });

  const data: HeatmapPoint[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${day}-${hour}`;
      data.push({ day, hour, count: buckets.get(key) || 0 });
    }
  }

  return data;
};

const computeAssetMix = (trades: InsightTrade[]): AssetMixPoint[] => {
  const buckets = new Map<string, { trades: number; pnl: number }>();

  trades.forEach((trade) => {
    const asset = (trade.asset || 'Unknown').trim() || 'Unknown';
    const bucket = buckets.get(asset) || { trades: 0, pnl: 0 };
    bucket.trades += 1;
    bucket.pnl += toFiniteNumber(trade.pnl);
    buckets.set(asset, bucket);
  });

  return Array.from(buckets.entries())
    .map(([asset, bucket]) => ({
      asset,
      trades: bucket.trades,
      pnl: Math.round(bucket.pnl * 100) / 100,
    }))
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 6);
};

const computeSuggestions = (
  avgTradesPerDay: number,
  avgWin: number,
  avgLoss: number,
  revengeTradeCount: number,
): InsightSuggestion[] => {
  const limit = Math.max(3, Math.round(Math.max(avgTradesPerDay, 4) * 0.75));
  const coolingMinutes = revengeTradeCount >= 3 ? 45 : 20;

  const stopLossRecommendation =
    avgLoss > avgWin && avgWin > 0
      ? `Average loss is larger than average win (${avgLoss.toFixed(2)} vs ${avgWin.toFixed(2)}). Use hard stop-loss rules before entry and do not widen stops intraday.`
      : 'Set a fixed stop-loss on every trade (for example 1R max risk) and avoid discretionary widening once in position.';

  return [
    {
      title: 'Daily trade limits',
      recommendation: `Set a hard cap of ${limit} trades per day. Stop opening new positions after that limit unless you complete a written post-trade review first.`,
    },
    {
      title: 'Stop-loss discipline',
      recommendation: stopLossRecommendation,
    },
    {
      title: 'Cooling-off periods',
      recommendation: `After a losing trade, enforce a ${coolingMinutes}-minute cooling-off period before the next order. Use this time to check thesis, risk, and market regime.`,
    },
    {
      title: 'Journaling prompts',
      recommendation: 'Capture pre-trade emotion, rule adherence, and post-trade review quality on every high-impact trade.',
    },
  ];
};

const computeJournalingPrompts = (biases: InsightBias[]): string[] => {
  const hasOvertrading = biases.some((bias) => {
    const type = (bias.analysis_type || '').toLowerCase();
    const title = (bias.title || '').toLowerCase();
    return type.includes('overtrading') || title.includes('overtrading');
  });

  const hasLossAversion = biases.some((bias) => {
    const type = (bias.analysis_type || '').toLowerCase();
    const title = (bias.title || '').toLowerCase();
    return type.includes('loss') || title.includes('loss aversion');
  });

  const hasRevenge = biases.some((bias) => {
    const type = (bias.analysis_type || '').toLowerCase();
    const title = (bias.title || '').toLowerCase();
    return type.includes('revenge') || title.includes('revenge');
  });

  const prompts = [
    'What specific setup criteria were present before I entered this trade?',
    'What emotion (calm, anxious, frustrated, confident) dominated my decision-making today?',
  ];

  if (hasOvertrading) {
    prompts.push('Did I take trades outside my A+ setup criteria due to FOMO or urgency?');
  }
  if (hasLossAversion) {
    prompts.push('Did I follow my original stop-loss, or did I move it because I did not want to take the loss?');
  }
  if (hasRevenge) {
    prompts.push('After losses, did I reduce size and wait, or did I try to win it back immediately?');
  }

  return prompts.slice(0, 4);
};

const computeBiasSummaries = (
  biases: InsightBias[],
  highVolatilityFollowUps: number,
): string[] => {
  const summaries: string[] = [];

  const sortedBiases = [...biases].sort((a, b) => {
    const left = SEVERITY_RANK[(a.severity || '').toLowerCase()] || 0;
    const right = SEVERITY_RANK[(b.severity || '').toLowerCase()] || 0;
    return right - left;
  });

  sortedBiases.slice(0, 3).forEach((bias) => {
    const title = (bias.title || bias.analysis_type || 'Bias signal').trim();
    const severity = (bias.severity || 'unknown').toLowerCase();
    const description = (bias.description || '').trim();
    if (description) {
      summaries.push(`${title} (${severity}): ${description}`);
    } else {
      summaries.push(`${title} (${severity}) detected in recent activity.`);
    }
  });

  const hasOvertradingBias = sortedBiases.some((bias) => {
    const type = (bias.analysis_type || '').toLowerCase();
    const title = (bias.title || '').toLowerCase();
    return type.includes('overtrading') || title.includes('overtrading');
  });

  if (hasOvertradingBias || highVolatilityFollowUps >= 2) {
    summaries.unshift('You may be overtrading during high-volatility periods.');
  }

  if (summaries.length === 0) {
    summaries.push('No major bias flags yet, but continue monitoring consistency across sessions.');
  }

  return summaries.slice(0, 4);
};

export function buildCoachInsights(trades: InsightTrade[], biases: InsightBias[]): CoachInsights {
  const validTrades = [...trades]
    .filter((trade) => !Number.isNaN(new Date(trade.timestamp).getTime()))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const totalTrades = validTrades.length;
  const totalPnl = validTrades.reduce((sum, trade) => sum + toFiniteNumber(trade.pnl), 0);
  const closedTrades = validTrades.filter((trade) => trade.pnl != null && trade.pnl !== '');
  const wins = closedTrades.filter((trade) => toFiniteNumber(trade.pnl) > 0);
  const losses = closedTrades.filter((trade) => toFiniteNumber(trade.pnl) < 0);
  const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;

  const avgWin = wins.length > 0 ? wins.reduce((sum, trade) => sum + toFiniteNumber(trade.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length > 0
    ? Math.abs(losses.reduce((sum, trade) => sum + toFiniteNumber(trade.pnl), 0) / losses.length)
    : 0;

  const tradeDates = new Set(validTrades.map((trade) => toIsoDate(trade.timestamp)).filter(Boolean));
  const avgTradesPerDay = tradeDates.size > 0 ? Number((totalTrades / tradeDates.size).toFixed(1)) : 0;
  const revengeTradeCount = computeRevengeTradeCount(validTrades);
  const highVolatilityFollowUps = computeHighVolatilityFollowUps(validTrades);

  return {
    biasSummaries: computeBiasSummaries(biases, highVolatilityFollowUps),
    suggestions: computeSuggestions(avgTradesPerDay, avgWin, avgLoss, revengeTradeCount),
    journalingPrompts: computeJournalingPrompts(biases),
    timeline: computeTimeline(validTrades),
    heatmap: computeHeatmap(validTrades),
    assetMix: computeAssetMix(validTrades),
    stats: {
      totalTrades,
      totalPnl: Math.round(totalPnl * 100) / 100,
      winRate,
      avgTradesPerDay,
      revengeTradeCount,
      highVolatilityFollowUps,
    },
  };
}

export const insightDayName = (day: number) => DAY_NAMES[day] || String(day);
