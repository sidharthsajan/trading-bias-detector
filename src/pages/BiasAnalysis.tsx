import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { runFullAnalysis, calculateRiskProfile, BiasResult, Trade } from '@/lib/biasDetection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, AlertTriangle, CheckCircle, Loader2, RefreshCw, TrendingUp, Shield, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';

const severityConfig = {
  critical: { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: '🔴' },
  high: { color: 'bg-warning/10 text-warning-foreground border-warning/20', icon: '🟠' },
  medium: { color: 'bg-primary/10 text-primary border-primary/20', icon: '🟡' },
  low: { color: 'bg-success/10 text-success border-success/20', icon: '🟢' },
};

const biasIcons: Record<string, typeof Brain> = {
  overtrading: Zap,
  loss_aversion: TrendingUp,
  revenge_trading: AlertTriangle,
  disposition_effect: TrendingUp,
  anchoring: Shield,
  confirmation_bias: Brain,
};

export default function BiasAnalysis() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [results, setResults] = useState<BiasResult[]>([]);
  const [savedResults, setSavedResults] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    const [tradesRes, biasRes] = await Promise.all([
      supabase.from('trades').select('*').eq('user_id', user!.id).order('timestamp', { ascending: true }),
      supabase.from('bias_analyses').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
    ]);
    setTrades((tradesRes.data || []).map((t: any) => ({
      timestamp: t.timestamp,
      action: t.action,
      asset: t.asset,
      quantity: Number(t.quantity),
      entry_price: Number(t.entry_price),
      exit_price: t.exit_price ? Number(t.exit_price) : undefined,
      pnl: t.pnl ? Number(t.pnl) : undefined,
      account_balance: t.account_balance ? Number(t.account_balance) : undefined,
      notes: t.notes,
    })));
    setSavedResults(biasRes.data || []);
    setLoading(false);
  };

  const runAnalysis = async () => {
    if (trades.length < 5) {
      toast({ title: 'Not enough data', description: 'Upload at least 5 trades to run analysis.', variant: 'destructive' });
      return;
    }

    setAnalyzing(true);

    const biases = runFullAnalysis(trades);
    setResults(biases);

    // Save to DB
    const riskProfile = calculateRiskProfile(trades, biases);

    // Delete old analyses
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

    // Save risk profile
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

    toast({ title: `Analysis complete`, description: `Found ${biases.length} bias pattern(s).` });
    setAnalyzing(false);
    fetchData();
  };

  const displayResults = results.length > 0 ? results : savedResults.map(s => ({
    type: s.analysis_type,
    severity: s.severity as BiasResult['severity'],
    title: s.title,
    description: s.description,
    details: s.details || {},
    score: 50,
  }));

  const radarData = [
    { bias: 'Overtrading', score: displayResults.find(r => r.type === 'overtrading')?.score || 0 },
    { bias: 'Loss Aversion', score: displayResults.find(r => r.type === 'loss_aversion')?.score || 0 },
    { bias: 'Revenge', score: displayResults.find(r => r.type === 'revenge_trading')?.score || 0 },
    { bias: 'Disposition', score: displayResults.find(r => r.type === 'disposition_effect')?.score || 0 },
    { bias: 'Anchoring', score: displayResults.find(r => r.type === 'anchoring')?.score || 0 },
    { bias: 'Confirmation', score: displayResults.find(r => r.type === 'confirmation_bias')?.score || 0 },
  ];

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Bias Analysis</h1>
            <p className="text-muted-foreground mt-1">{trades.length} trades loaded for analysis</p>
          </div>
          <Button onClick={runAnalysis} disabled={analyzing || trades.length < 5} className="gradient-primary text-primary-foreground">
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {analyzing ? 'Analyzing...' : 'Run Analysis'}
          </Button>
        </div>

        {displayResults.length > 0 && (
          <>
            {/* Radar chart */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="font-display">Bias Radar</CardTitle>
                <CardDescription>Overview of detected behavioral biases (0 = none, 100 = severe)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="bias" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Individual biases */}
            <div className="grid gap-4">
              {displayResults.map((bias, i) => {
                const config = severityConfig[bias.severity];
                const Icon = biasIcons[bias.type] || Brain;
                return (
                  <Card key={i} className={`glass-card border ${config.color}`}>
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
                              {Object.entries(bias.details).map(([k, v]) => (
                                typeof v !== 'object' && (
                                  <span key={k} className="px-2 py-1 rounded-md bg-muted text-xs font-mono">
                                    {k.replace(/_/g, ' ')}: {String(v)}
                                  </span>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {displayResults.length === 0 && !loading && (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <CheckCircle className="w-16 h-16 text-success/30 mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold mb-2">No biases detected</h3>
              <p className="text-muted-foreground">
                {trades.length < 5 ? 'Upload at least 5 trades to run analysis.' : 'Your trading appears disciplined. Keep it up!'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
