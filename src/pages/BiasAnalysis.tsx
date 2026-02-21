import { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { runFullAnalysis, calculateRiskProfile, BiasResult, Trade } from '@/lib/biasDetection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, AlertTriangle, CheckCircle, Loader2, RefreshCw, TrendingUp, Zap, Upload, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip, RadialBarChart, RadialBar } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const FALLBACK_BIAS_SCORE = 50;
const BIAS_AXES = [
  { key: 'overtrading', label: 'Overtrading' },
  { key: 'loss_aversion', label: 'Loss Aversion' },
  { key: 'revenge_trading', label: 'Revenge Trading' },
  { key: 'disposition_effect', label: 'Disposition Effect' },
  { key: 'anchoring', label: 'Anchoring' },
  { key: 'confirmation_bias', label: 'Confirmation Bias' },
] as const;

export interface AnalyzeResponse {
  biases: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    details: Record<string, unknown>;
    score: number;
  }>;
  trade_flags: {
    overtrading: number[];
    loss_aversion: number[];
    revenge_trading: number[];
  };
  bias_score: number;
  trades: Array<{
    timestamp: string;
    buy_sell: string;
    asset: string;
    quantity: number;
    price: number;
    p_l: number | null;
    balance: number | null;
  }>;
  preprocess?: {
    rows_before: number;
    rows_after: number;
    dropped_invalid: number;
    dropped_outliers: number;
    dropped_duplicates: number;
  };
}

const severityConfig: Record<string, { color: string; icon: string }> = {
  critical: { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: '🔴' },
  high: { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: '🟠' },
  medium: { color: 'bg-primary/10 text-primary border-primary/20', icon: '🟡' },
  low: { color: 'bg-muted text-muted-foreground border-border', icon: '🟢' },
};

const biasIcons: Record<string, typeof Brain> = {
  overtrading: Zap,
  loss_aversion: TrendingUp,
  revenge_trading: AlertTriangle,
};

export default function BiasAnalysis() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [results, setResults] = useState<BiasResult[]>([]);
  const [savedResults, setSavedResults] = useState<Array<{ analysis_type: string; severity: string; title: string; description: string; details: Record<string, unknown> }>>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiResult, setApiResult] = useState<AnalyzeResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tradesRes, biasRes] = await Promise.all([
      supabase.from('trades').select('*').eq('user_id', user.id).order('timestamp', { ascending: true }),
      supabase.from('bias_analyses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setTrades((tradesRes.data || []).map((t: Record<string, unknown>) => ({
      timestamp: t.timestamp as string,
      action: t.action as 'buy' | 'sell',
      asset: t.asset as string,
      quantity: Number(t.quantity),
      entry_price: Number(t.entry_price),
      exit_price: t.exit_price ? Number(t.exit_price) : undefined,
      pnl: t.pnl != null ? Number(t.pnl) : undefined,
      account_balance: t.account_balance != null ? Number(t.account_balance) : undefined,
      notes: t.notes as string | undefined,
    })));
    setSavedResults((biasRes.data || []).map((s: Record<string, unknown>) => ({
      analysis_type: s.analysis_type as string,
      severity: s.severity as string,
      title: s.title as string,
      description: s.description as string,
      details: (s.details as Record<string, unknown>) || {},
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchData();
  }, [user, fetchData]);

  const analyzeFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({ title: 'Invalid file', description: 'Please upload a CSV file.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setApiResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText || 'Analysis failed');
      }
      const data: AnalyzeResponse = await res.json();
      setApiResult(data);
      toast({ title: 'Analysis complete', description: `Bias score: ${data.bias_score}. ${data.biases.length} pattern(s) detected.` });
    } catch (e) {
      toast({ title: 'Analysis failed', description: e instanceof Error ? e.message : 'Could not reach analysis API.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const runAnalysis = async () => {
    if (trades.length < 5) {
      toast({ title: 'Not enough data', description: 'Upload at least 5 trades to run analysis.', variant: 'destructive' });
      return;
    }
    setAnalyzing(true);
    const biases = runFullAnalysis(trades);
    setResults(biases);
    const riskProfile = calculateRiskProfile(trades, biases);
    await supabase.from('bias_analyses').delete().eq('user_id', user!.id);
    if (biases.length > 0) {
      await supabase.from('bias_analyses').insert(
        biases.map(b => ({
          user_id: user!.id,
          analysis_type: b.type,
          severity: b.severity,
          title: b.title,
          description: b.description,
          details: b.details,
        }))
      );
    }
    await supabase.from('risk_profiles').insert({
      user_id: user!.id,
      overall_score: riskProfile.overallScore,
      overtrading_score: riskProfile.overtradingScore,
      loss_aversion_score: riskProfile.lossAversionScore,
      revenge_trading_score: riskProfile.revengeTradingScore,
      discipline_score: riskProfile.disciplineScore,
      emotional_control_score: riskProfile.emotionalControlScore,
      details: riskProfile,
    });
    toast({ title: 'Analysis complete', description: `Found ${biases.length} bias pattern(s).` });
    setAnalyzing(false);
    fetchData();
  };

  const displayResults = apiResult
    ? apiResult.biases
    : results.length > 0
      ? results
      : savedResults.map(s => {
          const detailsObj = (s.details || {}) as Record<string, unknown>;
          const raw = detailsObj.score;
          const score =
            typeof raw === 'number' && Number.isFinite(raw)
              ? Math.max(0, Math.min(100, raw))
              : (typeof raw === 'string' ? Math.max(0, Math.min(100, Number(raw))) : null) ?? FALLBACK_BIAS_SCORE;
          return {
            type: s.analysis_type,
            severity: s.severity as BiasResult['severity'],
            title: s.title,
            description: s.description,
            details: s.details || {},
            score,
          };
        });

  const radarScoreByType = displayResults.reduce((acc, result) => {
    const rawScore = typeof result.score === 'number' ? result.score : Number(result.score);
    if (!Number.isFinite(rawScore)) return acc;

    const clampedScore = Math.max(0, Math.min(100, rawScore));
    const key = String(result.type || '').trim().toLowerCase();
    if (!key) return acc;

    acc[key] = Math.max(acc[key] ?? 0, clampedScore);
    return acc;
  }, {} as Record<string, number>);

  const radarData = BIAS_AXES.map((axis) => ({
    bias: axis.label,
    score: radarScoreByType[axis.key] ?? 0,
  }));

  // Aggregate bias score 0–100 (median of bias scores so one severe bias doesn't force overall to 100)
  const biasScore = (() => {
    const fromApi = apiResult?.bias_score;
    if (fromApi != null && fromApi !== '') {
      const n = Number(fromApi);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    }
    if (!displayResults.length) return 0;
    const scores = displayResults
      .map((b) => (typeof b.score === 'number' && Number.isFinite(b.score) ? b.score : Number(b.score) || 0))
      .filter((s) => s >= 0 && s <= 100)
      .sort((a, b) => a - b);
    if (!scores.length) return 0;
    const n = scores.length;
    const median = n % 2 ? scores[n >> 1] : (scores[(n >> 1) - 1] + scores[n >> 1]) / 2;
    return Math.round(Math.max(0, Math.min(100, median)));
  })();
  const tradeFlags = apiResult?.trade_flags ?? { overtrading: [], loss_aversion: [], revenge_trading: [] };
  const allBiasedIndices = new Set([...tradeFlags.overtrading, ...tradeFlags.loss_aversion, ...tradeFlags.revenge_trading]);
  const journalTrades = apiResult?.trades ?? trades.map(t => ({
    timestamp: t.timestamp,
    buy_sell: t.action,
    asset: t.asset,
    quantity: t.quantity,
    price: t.entry_price,
    p_l: t.pnl ?? null,
    balance: t.account_balance ?? null,
  }));

  const heatmapData = (() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    journalTrades.forEach(t => {
      try {
        const d = new Date(t.timestamp);
        if (!Number.isNaN(d.getTime())) hours[d.getHours()].count++;
      } catch {
        // skip
      }
    });
    return hours;
  })();
  const maxCount = Math.max(1, ...heatmapData.map(h => h.count));

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Bias Analysis</h1>
          <p className="text-muted-foreground mt-1">Upload a CSV or use saved trades to detect behavioral biases</p>
        </div>

        {/* Preprocessing summary */}
        {apiResult?.preprocess && (apiResult.preprocess.rows_before !== apiResult.preprocess.rows_after || apiResult.preprocess.dropped_invalid > 0 || apiResult.preprocess.dropped_outliers > 0 || apiResult.preprocess.dropped_duplicates > 0) && (
          <div>
          <Card className="glass-card border-muted">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                <strong>CSV preprocessed:</strong> {apiResult.preprocess.rows_before} → {apiResult.preprocess.rows_after} rows
                {(apiResult.preprocess.dropped_invalid > 0 || apiResult.preprocess.dropped_outliers > 0 || apiResult.preprocess.dropped_duplicates > 0) && (
                  <> (removed {apiResult.preprocess.dropped_invalid} invalid, {apiResult.preprocess.dropped_outliers} outliers, {apiResult.preprocess.dropped_duplicates} duplicates)</>
                )}
              </p>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Bias Score radial gauge */}
        {(apiResult || displayResults.length > 0) && (
          <div>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-display">Bias Score</CardTitle>
              <CardDescription>Overall behavioral bias intensity (0 = none, 100 = severe)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative w-full" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="60%"
                    outerRadius="100%"
                    data={[{ name: 'Score', value: biasScore, fill: 'hsl(var(--primary))' }]}
                    startAngle={180}
                    endAngle={0}
                  >
                    <RadialBar dataKey="value" max={100} cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-4xl font-bold text-foreground">{biasScore}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Heatmap: trading intensity by time of day */}
        {journalTrades.length > 0 && (
          <div>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-display">Trading intensity by hour</CardTitle>
              <CardDescription>Number of trades per hour of day (UTC or local)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {heatmapData.map(({ hour, count }) => (
                  <div
                    key={hour}
                    className="h-8 w-8 rounded flex items-center justify-center text-[10px] font-medium text-foreground/80"
                    style={{ backgroundColor: `hsl(var(--primary) / ${0.15 + (count / maxCount) * 0.85})` }}
                    title={`${hour}:00 – ${count} trade(s)`}
                  >
                    {count > 0 ? count : ''}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">0h → 23h</p>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Radar + bias cards (when we have results) */}
        {displayResults.length > 0 && (
          <>
            <div>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="font-display">Bias Radar</CardTitle>
                <CardDescription>6-factor bias radar (0-100)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid gridType="polygon" stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="bias" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            </div>
            <div className="grid gap-4">
              {displayResults.map((bias, i) => {
                const config = severityConfig[bias.severity] ?? severityConfig.low;
                const Icon = biasIcons[bias.type] ?? Brain;
                return (
                  <div key={i}>
                  <Card className={`glass-card border ${config.color}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${config.color}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{config.icon}</span>
                            <h3 className="font-display font-semibold text-lg">{bias.title}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${config.color}`}>{bias.severity}</span>
                          </div>
                          <p className="text-muted-foreground">{bias.description}</p>
                          {bias.details && Object.keys(bias.details).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {Object.entries(bias.details).map(([k, v]) =>
                                typeof v !== 'object' && v != null ? (
                                  <span key={k} className="px-2 py-1 rounded-md bg-muted text-xs font-mono">
                                    {k.replace(/_/g, ' ')}: {String(v)}
                                  </span>
                                ) : null
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Saved trades: Run analysis (client-side) */}
        {!apiResult && trades.length > 0 && (
          <div>
          <Card className="glass-card">
            <CardContent className="pt-6 flex items-center justify-between">
              <p className="text-muted-foreground">{trades.length} trades loaded from your account. Run analysis to detect biases (client-side).</p>
              <Button onClick={runAnalysis} disabled={analyzing || trades.length < 5} className="gradient-primary text-primary-foreground">
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                {analyzing ? 'Analyzing…' : 'Run Analysis'}
              </Button>
            </CardContent>
          </Card>
          </div>
        )}

        {displayResults.length === 0 && journalTrades.length === 0 && !loading && (
          <div>
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <CheckCircle className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold mb-2">No data yet</h3>
              <p className="text-muted-foreground">Upload a CSV above or save trades from the Upload page, then run analysis.</p>
            </CardContent>
          </Card>
          </div>
        )}
      </div>

      {/* Trade Journal table */}
        {journalTrades.length > 0 && (
  <div>
    <Card className="glass-card mt-8">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsJournalOpen(prev => !prev)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display">Trade Journal</CardTitle>
            <CardDescription>
              Biased trades are highlighted in red
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setIsJournalOpen(prev => !prev);
            }}
          >
            {isJournalOpen ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </CardHeader>

      {isJournalOpen && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Buy/Sell</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>P/L</TableHead>
                <TableHead>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journalTrades.map((row, idx) => (
                <TableRow
                  key={idx}
                  className={
                    allBiasedIndices.has(idx)
                      ? 'bg-destructive/10 border-l-4 border-l-destructive'
                      : ''
                  }
                >
                  <TableCell>{row.timestamp}</TableCell>
                  <TableCell>{row.buy_sell}</TableCell>
                  <TableCell>{row.asset}</TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell>{row.price}</TableCell>
                  <TableCell
                    className={
                      row.p_l != null && row.p_l < 0
                        ? 'text-destructive'
                        : ''
                    }
                  >
                    {row.p_l != null ? row.p_l : '—'}
                  </TableCell>
                  <TableCell>
                    {row.balance != null ? row.balance : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  </div>
        )}
    </AppLayout>
  );
}
