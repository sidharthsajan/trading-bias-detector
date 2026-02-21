import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/lib/format';
import { fetchAllTradesForUser, invalidateTradeCache } from '@/lib/trades';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Upload, Brain, TrendingUp, TrendingDown, Activity, AlertTriangle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const BIAS_AXES = [
  { key: 'overtrading', label: 'Overtrading' },
  { key: 'loss_aversion', label: 'Loss Aversion' },
  { key: 'revenge_trading', label: 'Revenge Trading' },
  { key: 'disposition_effect', label: 'Disposition Effect' },
  { key: 'anchoring', label: 'Anchoring' },
  { key: 'confirmation_bias', label: 'Confirmation Bias' },
] as const;

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [trades, setTrades] = useState<any[]>([]);
  const [biases, setBiases] = useState<any[]>([]);
  const [riskProfile, setRiskProfile] = useState<any>(null);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [tradesRes, biasesRes, riskRes] = await Promise.allSettled([
        fetchAllTradesForUser(user.id),
        supabase.from('bias_analyses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('risk_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
      ]);

      if (tradesRes.status === 'fulfilled') {
        setTrades(tradesRes.value || []);
      } else {
        toast({
          title: 'Failed to load trades',
          description: 'Your latest trade data could not be loaded. Try refreshing.',
          variant: 'destructive',
        });
      }

      if (biasesRes.status === 'fulfilled' && !biasesRes.value.error) {
        setBiases(biasesRes.value.data || []);
      }

      if (riskRes.status === 'fulfilled' && !riskRes.value.error) {
        setRiskProfile(riskRes.value.data?.[0] || null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;
    void fetchData();
  }, [user, fetchData]);

  const clearAllTrades = useCallback(async () => {
    if (!user || trades.length === 0) return;

    const confirmed = window.confirm('Clear all saved trades? This action cannot be undone.');
    if (!confirmed) return;

    setClearing(true);

    try {
      const { error } = await supabase.from('trades').delete().eq('user_id', user.id);
      if (error) throw error;

      invalidateTradeCache(user.id);
      setTrades([]);
      setBiases([]);
      setRiskProfile(null);
      toast({ title: 'All trades cleared' });
    } catch (error: any) {
      toast({ title: 'Clear failed', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  }, [user, trades.length, toast]);

  const totalPnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const winningTrades = trades.filter((t) => (Number(t.pnl) || 0) > 0).length;
  const winRate = trades.length > 0 ? Math.round((winningTrades / trades.length) * 100) : 0;

  const criticalBiases = biases.filter((b) => b.severity === 'critical' || b.severity === 'high');

  const recentTrades = useMemo(() => trades.slice(0, 10), [trades]);

  const assetSymbols = useMemo(
    () =>
      Array.from(new Set(trades.filter((t) => t.asset && t.pnl !== null).map((t) => t.asset as string))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [trades],
  );

  useEffect(() => {
    if (assetSymbols.length === 0) {
      setSelectedAsset('');
      return;
    }
    if (!selectedAsset || !assetSymbols.includes(selectedAsset)) {
      setSelectedAsset(assetSymbols[0]);
    }
  }, [assetSymbols, selectedAsset]);

  const stockIndexData = useMemo(() => {
    if (!selectedAsset) return [];

    const selectedTrades = trades
      .filter((t) => t.asset === selectedAsset && t.pnl !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let index = 100;
    let cumulativePnl = 0;

    return selectedTrades.map((trade) => {
      const pnl = Number(trade.pnl) || 0;
      const notional = Math.max(Math.abs((Number(trade.quantity) || 0) * (Number(trade.entry_price) || 0)), 1);
      const pctMove = (pnl / notional) * 100;
      cumulativePnl += pnl;
      index = Math.max(1, index + pctMove);

      return {
        timestamp: new Date(trade.timestamp).getTime(),
        index: Math.round(index * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        cumulativePnl: Math.round(cumulativePnl * 100) / 100,
      };
    });
  }, [trades, selectedAsset]);

  const biasDistribution = biases.reduce((acc: Record<string, number>, b) => {
    const rawType = String(b.analysis_type || '').trim().toLowerCase();
    if (!rawType || rawType === 'unknown' || rawType === 'uncategorized') return acc;
    acc[rawType] = (acc[rawType] || 0) + 1;
    return acc;
  }, {});

  const radarData = useMemo(
    () => BIAS_AXES.map((axis) => ({
      bias: axis.label,
      value: biasDistribution[axis.key] || 0,
    })),
    [biasDistribution],
  );

  const hasRadarData = radarData.some((row) => row.value > 0);
  const radarMax = Math.max(3, ...radarData.map((row) => row.value));

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Your trading behavior at a glance</p>
          </div>
          <Button variant="outline" onClick={() => fetchData(true)} disabled={refreshing || clearing}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Trades</p>
                  <p className="text-3xl font-display font-bold">{trades.length}</p>
                </div>
                <BarChart3 className="w-10 h-10 text-primary/30" />
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total P/L</p>
                  <p className={`text-3xl font-display font-bold ${totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatMoney(totalPnl)}
                  </p>
                </div>
                {totalPnl >= 0 ? <TrendingUp className="w-10 h-10 text-success/30" /> : <TrendingDown className="w-10 h-10 text-destructive/30" />}
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className="text-3xl font-display font-bold">{winRate}%</p>
                </div>
                <Activity className="w-10 h-10 text-primary/30" />
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Biases Found</p>
                  <p className="text-3xl font-display font-bold">{biases.length}</p>
                </div>
                <AlertTriangle className={`w-10 h-10 ${criticalBiases.length > 0 ? 'text-destructive/50' : 'text-warning/30'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {trades.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <Upload className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold mb-2">No trades yet</h3>
              <p className="text-muted-foreground mb-6">Upload a CSV or manually add trades to start your analysis</p>
              <Button onClick={() => navigate('/upload')} className="gradient-primary text-primary-foreground">
                <Upload className="w-4 h-4 mr-2" /> Upload Trades
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-card">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="font-display">P/L Index by Stock</CardTitle>
                <div className="w-full sm:w-56">
                  <Select value={selectedAsset} onValueChange={setSelectedAsset} disabled={assetSymbols.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {assetSymbols.map((asset) => (
                        <SelectItem key={asset} value={asset}>
                          {asset}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {stockIndexData.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      {selectedAsset} lifespan, normalized to index 100 at first trade
                    </p>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={stockIndexData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="timestamp"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(value) => new Date(Number(value)).toLocaleDateString()}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                          domain={['auto', 'auto']}
                          tickFormatter={(value) => `${Number(value).toFixed(0)}`}
                        />
                        <Tooltip
                          labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
                          formatter={(value: number, name: string) => {
                            if (name === 'index') return [`${Number(value).toFixed(2)}`, 'Index'];
                            if (name === 'cumulativePnl') return [formatMoney(value), 'Cumulative P/L'];
                            if (name === 'pnl') return [formatMoney(value), 'Trade P/L'];
                            return [value, name];
                          }}
                          contentStyle={{
                            background: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Line type="monotone" dataKey="index" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No P/L timeline available for this stock
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="font-display">Bias Radar (6-Factor)</CardTitle>
              </CardHeader>
              <CardContent>
                {hasRadarData ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid gridType="polygon" stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="bias" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <PolarRadiusAxis angle={90} domain={[0, radarMax]} tickCount={Math.min(5, radarMax + 1)} />
                      <Radar
                        name="Signals"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.35}
                        strokeWidth={2}
                      />
                      <Tooltip formatter={(value: number) => [`${value}`, 'Occurrences']} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    <div className="text-center">
                      <Brain className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>Run analysis to see bias distribution</p>
                      <Button onClick={() => navigate('/analysis')} variant="outline" className="mt-3">Go to Analysis</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card lg:col-span-2">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="font-display">Recent Trades</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/trades')}>View All</Button>
                  <Button variant="destructive" size="sm" onClick={clearAllTrades} disabled={clearing || trades.length === 0}>
                    {clearing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                    Clear Trades
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground font-medium">Date</th>
                        <th className="text-left py-2 text-muted-foreground font-medium">Asset</th>
                        <th className="text-left py-2 text-muted-foreground font-medium">Action</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Qty</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Entry</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTrades.map((trade) => (
                        <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2">{new Date(trade.timestamp).toLocaleDateString()}</td>
                          <td className="py-2 font-medium">{trade.asset}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trade.action === 'buy' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                              {String(trade.action).toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 text-right">{trade.quantity}</td>
                          <td className="py-2 text-right">{formatMoney(trade.entry_price)}</td>
                          <td className={`py-2 text-right font-medium ${(trade.pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {trade.pnl !== null ? formatMoney(trade.pnl) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {riskProfile && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-display">Risk Profile Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="8"
                      strokeDasharray={`${riskProfile.overall_score * 2.51} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-display font-bold">{riskProfile.overall_score}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 flex-1">
                  {[
                    { label: 'Discipline', score: riskProfile.discipline_score },
                    { label: 'Emotional Control', score: riskProfile.emotional_control_score },
                    { label: 'Overtrading Risk', score: riskProfile.overtrading_score },
                    { label: 'Loss Aversion', score: riskProfile.loss_aversion_score },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 rounded-full bg-muted">
                          <div className="h-full rounded-full gradient-primary" style={{ width: `${item.score}%` }} />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{item.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
