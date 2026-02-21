import type { InsightTrade } from '@/lib/coachInsights';

export type PortfolioAllocationPoint = {
  name: string;
  value: number;
  count: number;
};

export type PortfolioRecommendation = {
  title: string;
  detail: string;
  severity: 'high' | 'medium';
};

export type PortfolioInsights = {
  allocationData: PortfolioAllocationPoint[];
  totalValue: number;
  assetCount: number;
  topAssetName: string;
  topAssetPct: number;
  recommendations: PortfolioRecommendation[];
};

const toFiniteNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function buildPortfolioInsights(trades: InsightTrade[]): PortfolioInsights {
  const assetPositions: Record<string, { value: number; count: number }> = {};

  trades.forEach((trade) => {
    const asset = (trade.asset || 'Unknown').trim() || 'Unknown';
    if (!assetPositions[asset]) {
      assetPositions[asset] = { value: 0, count: 0 };
    }
    assetPositions[asset].value += Math.abs(toFiniteNumber(trade.quantity) * toFiniteNumber(trade.entry_price));
    assetPositions[asset].count += 1;
  });

  const allocationData = Object.entries(assetPositions)
    .map(([name, bucket]) => ({
      name,
      value: Math.round(bucket.value * 100) / 100,
      count: bucket.count,
    }))
    .sort((a, b) => b.value - a.value);

  const totalValue = allocationData.reduce((sum, row) => sum + row.value, 0);
  const topAssetName = allocationData[0]?.name || 'N/A';
  const topAssetPct = totalValue > 0 ? Number((((allocationData[0]?.value || 0) / totalValue) * 100).toFixed(1)) : 0;

  const recommendations: PortfolioRecommendation[] = [];

  if (topAssetPct > 40) {
    recommendations.push({
      severity: topAssetPct > 55 ? 'high' : 'medium',
      title: 'High concentration risk',
      detail: `${topAssetName} accounts for ${topAssetPct}% of your traded notional. Consider reducing single-asset concentration and rebalancing exposure.`,
    });
  }

  if (allocationData.length < 4) {
    recommendations.push({
      severity: 'medium',
      title: 'Limited diversification',
      detail: `Only ${allocationData.length} assets are represented. Add uncorrelated instruments to reduce regime-specific drawdown risk.`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      severity: 'medium',
      title: 'Maintain disciplined rebalancing',
      detail: 'Portfolio concentration looks controlled. Keep a weekly rebalance check to maintain target risk distribution.',
    });
  }

  return {
    allocationData,
    totalValue: Math.round(totalValue * 100) / 100,
    assetCount: allocationData.length,
    topAssetName,
    topAssetPct,
    recommendations,
  };
}
