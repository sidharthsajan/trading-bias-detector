import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildPortfolioInsights } from '@/lib/portfolioInsights';
import { AI_COACH_DRAFT_KEY } from '@/lib/aiCoach';
import { Shield, TrendingUp, TrendingDown, BarChart3, MessageSquare } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const COLORS = ['hsl(350, 84%, 46%)', 'hsl(196, 67%, 45%)', 'hsl(160, 60%, 45%)', 'hsl(40, 90%, 55%)', 'hsl(270, 60%, 55%)', 'hsl(196, 67%, 45%)'];

export default function Portfolio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trades, setTrades] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      supabase.from('trades').select('*').eq('user_id', user.id).order('timestamp', { ascending: true })
        .then(({ data }) => setTrades(data || []));
    }
  }, [user]);

  const portfolio = useMemo(() => buildPortfolioInsights(trades), [trades]);
  const allocationData = portfolio.allocationData;
  const totalValue = portfolio.totalValue;
  const topAssetPct = portfolio.topAssetPct;

  let cumPnl = 0;
  const pnlTimeline = trades
    .filter((trade) => trade.pnl !== null)
    .map((trade) => {
      cumPnl += Number(trade.pnl);
      return { date: new Date(trade.timestamp).toLocaleDateString(), pnl: Math.round(cumPnl * 100) / 100 };
    });

  const openCoachWithPortfolioPrompt = () => {
    const recommendationText = portfolio.recommendations
      .map((item) => `- ${item.title}: ${item.detail}`)
      .join('\n');

    const draft = [
      'Please review my portfolio optimization recommendations and give me a concrete action plan.',
      `Top concentration: ${portfolio.topAssetName} at ${portfolio.topAssetPct}%`,
      `Assets traded: ${portfolio.assetCount}`,
      'Current recommendations:',
      recommendationText,
    ].join('\n');

    localStorage.setItem(AI_COACH_DRAFT_KEY, draft);
    navigate('/ai-coach');
  };

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
                  <p className="text-2xl font-display font-bold">{portfolio.assetCount}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Top Concentration</p>
                  <p className={`text-2xl font-display font-bold ${topAssetPct > 50 ? 'text-destructive' : 'text-success'}`}>{topAssetPct.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">{portfolio.topAssetName}</p>
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
                      <Tooltip formatter={(value: number) => formatMoney(value)} />
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

            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-display">Optimization Recommendations</CardTitle>
                  <CardDescription>Based on your portfolio composition</CardDescription>
                </div>
                <Button variant="outline" onClick={openCoachWithPortfolioPrompt}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Ask Laurent
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {portfolio.recommendations.map((item) => (
                  <div
                    key={item.title}
                    className={`flex gap-3 p-3 rounded-lg border ${
                      item.severity === 'high'
                        ? 'bg-warning/5 border-warning/20'
                        : 'bg-primary/5 border-primary/20'
                    }`}
                  >
                    {item.severity === 'high'
                      ? <TrendingDown className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                      : <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
