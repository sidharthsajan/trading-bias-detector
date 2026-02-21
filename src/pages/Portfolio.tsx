import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const COLORS = ['hsl(350, 84%, 46%)', 'hsl(196, 67%, 45%)', 'hsl(160, 60%, 45%)', 'hsl(40, 90%, 55%)', 'hsl(270, 60%, 55%)', 'hsl(196, 67%, 45%)'];

export default function Portfolio() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      supabase.from('trades').select('*').eq('user_id', user.id).order('timestamp', { ascending: true })
        .then(({ data }) => setTrades(data || []));
    }
  }, [user]);

  // Asset allocation
  const assetPositions: Record<string, { value: number; count: number }> = {};
  trades.forEach(t => {
    if (!assetPositions[t.asset]) assetPositions[t.asset] = { value: 0, count: 0 };
    assetPositions[t.asset].value += Number(t.quantity) * Number(t.entry_price);
    assetPositions[t.asset].count++;
  });
  const allocationData = Object.entries(assetPositions)
    .map(([name, { value }]) => ({ name, value: Math.round(Math.abs(value) * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  // PnL over time
  let cumPnl = 0;
  const pnlTimeline = trades
    .filter(t => t.pnl !== null)
    .map(t => {
      cumPnl += Number(t.pnl);
      return { date: new Date(t.timestamp).toLocaleDateString(), pnl: Math.round(cumPnl * 100) / 100 };
    });

  // Concentration risk
  const totalValue = allocationData.reduce((s, a) => s + a.value, 0);
  const topAssetPct = totalValue > 0 ? ((allocationData[0]?.value || 0) / totalValue * 100).toFixed(1) : '0';

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" /> Portfolio Analysis
          </h1>
          <p className="text-muted-foreground mt-1">Optimization insights and allocation overview</p>
        </div>

        {trades.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <BarChart3 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold mb-2">No trading data</h3>
              <p className="text-muted-foreground">Upload trades to see portfolio analysis.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Total Volume</p>
                  <p className="text-2xl font-display font-bold">{formatMoney(totalValue)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Assets Traded</p>
                  <p className="text-2xl font-display font-bold">{allocationData.length}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Top Concentration</p>
                  <p className={`text-2xl font-display font-bold ${Number(topAssetPct) > 50 ? 'text-destructive' : 'text-success'}`}>{topAssetPct}%</p>
                  <p className="text-xs text-muted-foreground">{allocationData[0]?.name}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="font-display">Asset Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={allocationData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {allocationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMoney(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="font-display">Cumulative P/L</CardTitle>
                </CardHeader>
                <CardContent>
                  {pnlTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={pnlTimeline}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value) => formatMoney(value)} />
                        <Tooltip
                          formatter={(value: number) => formatMoney(value)}
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Line type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No P/L data available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Optimization recommendations */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="font-display">Optimization Recommendations</CardTitle>
                <CardDescription>Based on your portfolio composition</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Number(topAssetPct) > 40 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <TrendingDown className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">High concentration risk</p>
                      <p className="text-xs text-muted-foreground">{allocationData[0]?.name} makes up {topAssetPct}% of your volume. Consider diversifying across more assets to reduce risk.</p>
                    </div>
                  </div>
                )}
                {allocationData.length < 4 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Limited diversification</p>
                      <p className="text-xs text-muted-foreground">Trading only {allocationData.length} asset(s) increases exposure to sector-specific risks. Consider adding uncorrelated instruments.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
