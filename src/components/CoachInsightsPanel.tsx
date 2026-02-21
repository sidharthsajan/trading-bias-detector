import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage, type AppLanguage } from '@/hooks/useLanguage';
import { formatMoney } from '@/lib/format';
import type { CoachInsights } from '@/lib/coachInsights';
import { insightDayName } from '@/lib/coachInsights';
import { translateUiText } from '@/lib/translations';

type CoachInsightsPanelProps = {
  insights: CoachInsights | null;
  loading?: boolean;
  compact?: boolean;
};

function Heatmap({ insights, language }: { insights: CoachInsights; language: AppLanguage }) {
  const { maxCount, countMap } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    insights.heatmap.forEach((item) => {
      const key = `${item.day}-${item.hour}`;
      map.set(key, item.count);
      if (item.count > max) max = item.count;
    });
    return { maxCount: max, countMap: map };
  }, [insights]);
  const tradesNoun = language === 'fr' ? 'transactions' : 'trades';

  return (
    <div className="space-y-1.5">
      {Array.from({ length: 7 }).map((_, day) => (
        <div key={day} className="grid grid-cols-[32px_1fr] items-center gap-1.5">
          <p className="text-[10px] text-muted-foreground">{insightDayName(day, language)}</p>
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
            {Array.from({ length: 24 }).map((_, hour) => {
              const count = countMap.get(`${day}-${hour}`) || 0;
              const intensity = maxCount > 0 ? count / maxCount : 0;
              const opacity = count > 0 ? 0.16 + intensity * 0.84 : 0.08;
              return (
                <div
                  key={`${day}-${hour}`}
                  title={`${insightDayName(day, language)} ${hour}:00 - ${count} ${tradesNoun}`}
                  className="h-3 rounded-[2px]"
                  style={{ backgroundColor: `hsl(var(--primary) / ${opacity})` }}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}

export default function CoachInsightsPanel({ insights, loading = false, compact = false }: CoachInsightsPanelProps) {
  const { language } = useLanguage();
  const cumulativePnlSeriesLabel = translateUiText('Cumulative P/L', language);
  const tradesSeriesLabel = language === 'fr' ? 'Transactions' : 'Trades';

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card className="glass-card">
        <CardContent className="py-10 text-center text-muted-foreground">
          No insights yet. Add trades to unlock summaries and chart insights.
        </CardContent>
      </Card>
    );
  }

  const timeline = compact ? insights.timeline.slice(-14) : insights.timeline;
  const assetMix = compact ? insights.assetMix.slice(0, 4) : insights.assetMix;
  const suggestions = compact ? insights.suggestions.slice(0, 3) : insights.suggestions;
  const prompts = compact ? insights.journalingPrompts.slice(0, 2) : insights.journalingPrompts;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">Coach Insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[11px] text-muted-foreground">Total Trades</p>
            <p className="text-sm font-semibold">{insights.stats.totalTrades}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[11px] text-muted-foreground">Win Rate</p>
            <p className="text-sm font-semibold">{insights.stats.winRate}%</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[11px] text-muted-foreground">Total P/L</p>
            <p className="text-sm font-semibold">{formatMoney(insights.stats.totalPnl)}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-[11px] text-muted-foreground">Trades/Day</p>
            <p className="text-sm font-semibold">{insights.stats.avgTradesPerDay}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold mb-1.5">Bias Summary</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {insights.biasSummaries.map((summary) => (
              <li key={summary}>- {summary}</li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-md border border-border p-2">
            <p className="text-xs font-semibold mb-2">P/L Timeline</p>
            {timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={compact ? 120 : 160}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" hide={compact} />
                  <YAxis width={48} tickFormatter={(value) => `${Math.round(Number(value))}`} />
                  <Tooltip formatter={(value: number) => [formatMoney(value), cumulativePnlSeriesLabel]} />
                  <Line type="monotone" dataKey="cumulativePnl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">No timeline data yet</p>
            )}
          </div>

          <div className="rounded-md border border-border p-2">
            <p className="text-xs font-semibold mb-2">Asset Activity</p>
            {assetMix.length > 0 ? (
              <ResponsiveContainer width="100%" height={compact ? 120 : 160}>
                <BarChart data={assetMix}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="asset" hide={compact} />
                  <YAxis width={30} />
                  <Tooltip formatter={(value: number) => [value, tradesSeriesLabel]} />
                  <Bar dataKey="trades" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">No asset activity yet</p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border p-2">
          <p className="text-xs font-semibold mb-2">Trading Heatmap (Day x Hour)</p>
          <Heatmap insights={insights} language={language} />
        </div>

        <div>
          <p className="text-xs font-semibold mb-1.5">Personalized Suggestions</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {suggestions.map((item) => (
              <li key={item.title}>
                <span className="font-medium text-foreground">{item.title}:</span> {item.recommendation}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold mb-1.5">Journaling Prompts</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {prompts.map((prompt) => (
              <li key={prompt}>- {prompt}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
