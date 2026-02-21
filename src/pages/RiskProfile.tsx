import { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllTradesForUser, fetchTradeCountForUser } from '@/lib/trades';
import { calculateRiskProfile, runFullAnalysis, type Trade } from '@/lib/biasDetection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Shield, TrendingUp, Zap, Brain, Heart, Target, RefreshCw, Loader2 } from 'lucide-react';

const RISK_PROFILE_ANALYSIS_LIMIT = 3000;

const metrics = [
  { key: 'overall_score', label: 'Overall Score', icon: Shield, desc: 'Your composite risk behavior score' },
  { key: 'discipline_score', label: 'Discipline', icon: Target, desc: 'How well you follow your strategy' },
  { key: 'emotional_control_score', label: 'Emotional Control', icon: Heart, desc: 'Managing emotions during trades' },
  { key: 'overtrading_score', label: 'Overtrading Risk', icon: Zap, desc: 'Tendency to trade excessively', inverted: true },
  { key: 'loss_aversion_score', label: 'Loss Aversion', icon: TrendingUp, desc: 'Fear-based decision making', inverted: true },
  { key: 'revenge_trading_score', label: 'Revenge Trading', icon: Brain, desc: 'Impulsive recovery attempts', inverted: true },
];

function mapTradesForAnalysis(rows: any[]): Trade[] {
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    action: row.action === 'buy' ? 'buy' : 'sell',
    asset: String(row.asset || ''),
    quantity: Number(row.quantity) || 0,
    entry_price: Number(row.entry_price) || 0,
    exit_price: row.exit_price !== null && row.exit_price !== undefined ? Number(row.exit_price) : undefined,
    pnl: row.pnl !== null && row.pnl !== undefined ? Number(row.pnl) : undefined,
    account_balance: row.account_balance !== null && row.account_balance !== undefined ? Number(row.account_balance) : undefined,
    notes: row.notes || undefined,
  }));
}

export default function RiskProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [tradeCount, setTradeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [profileRes, totalTrades] = await Promise.all([
        supabase.from('risk_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        fetchTradeCountForUser(user.id),
      ]);

      if (profileRes.error) throw profileRes.error;

      setProfiles(totalTrades === 0 ? [] : (profileRes.data || []));
      setTradeCount(totalTrades);
    } catch (error: any) {
      toast({ title: 'Failed to load risk profile', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;
    void fetchData();
  }, [user, fetchData]);

  const generateRiskProfile = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const [totalTrades, tradesForAnalysis] = await Promise.all([
        fetchTradeCountForUser(user.id),
        fetchAllTradesForUser(user.id, RISK_PROFILE_ANALYSIS_LIMIT),
      ]);

      if (totalTrades < 5) {
        toast({ title: 'Not enough data', description: 'Add at least 5 trades to generate a risk profile.', variant: 'destructive' });
        return;
      }

      const analysisTrades = mapTradesForAnalysis(tradesForAnalysis);
      const biases = runFullAnalysis(analysisTrades);
      const profile = calculateRiskProfile(analysisTrades, biases);

      const { data, error } = await supabase
        .from('risk_profiles')
        .insert({
          user_id: user.id,
          overall_score: profile.overallScore,
          overtrading_score: profile.overtradingScore,
          loss_aversion_score: profile.lossAversionScore,
          revenge_trading_score: profile.revengeTradingScore,
          discipline_score: profile.disciplineScore,
          emotional_control_score: profile.emotionalControlScore,
          details: profile,
        })
        .select('*')
        .single();

      if (error) throw error;

      setProfiles((prev) => [data, ...prev].slice(0, 10));
      setTradeCount(totalTrades);
      const usedCount = tradesForAnalysis.length;
      const usedSubset = totalTrades > usedCount;
      toast({
        title: 'Risk profile updated',
        description: usedSubset
          ? `Generated from your latest ${usedCount.toLocaleString()} of ${totalTrades.toLocaleString()} trades for faster performance.`
          : 'Latest behavioral profile generated from your full trade history.',
      });
    } catch (error: any) {
      toast({ title: 'Risk profile generation failed', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const latest = profiles[0];

  const getScoreColor = (score: number, inverted?: boolean) => {
    const effective = inverted ? score : 100 - score;
    if (effective > 60) return 'text-destructive';
    if (effective > 30) return 'text-warning';
    return 'text-success';
  };

  const getScoreGrade = (score: number, inverted?: boolean) => {
    const effective = inverted ? 100 - score : score;
    if (effective >= 80) return 'A';
    if (effective >= 60) return 'B';
    if (effective >= 40) return 'C';
    if (effective >= 20) return 'D';
    return 'F';
  };

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Risk Profile</h1>
            <p className="text-muted-foreground mt-1">
              Your personalized behavioral risk assessment ({tradeCount} trades available)
            </p>
          </div>
          <Button onClick={generateRiskProfile} disabled={generating || loading || tradeCount < 5} className="gradient-primary text-primary-foreground">
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {latest ? 'Refresh Profile' : 'Generate Profile'}
          </Button>
        </div>

        {!latest ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              {loading ? (
                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              ) : (
                <>
                  <Shield className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-xl font-display font-semibold mb-2">No risk profile yet</h3>
                  <p className="text-muted-foreground">
                    {tradeCount < 5 ? 'Add at least 5 trades to generate your first risk profile.' : 'Click Generate Profile to create your risk profile.'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map((metric) => {
                const score = Number(latest[metric.key]) || 0;
                return (
                  <Card key={metric.key} className="glass-card">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <metric.icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{metric.label}</p>
                            <p className="text-xs text-muted-foreground">{metric.desc}</p>
                          </div>
                        </div>
                        <span className={`text-2xl font-display font-bold ${getScoreColor(score, metric.inverted)}`}>
                          {getScoreGrade(score, metric.inverted)}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full gradient-primary transition-all duration-700"
                          style={{ width: `${metric.inverted ? 100 - score : score}%` }}
                        />
                      </div>
                      <p className="text-right text-sm text-muted-foreground mt-1">{metric.inverted ? 100 - score : score}/100</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="font-display">Portfolio Optimization Suggestions</CardTitle>
                <CardDescription>Based on your behavioral profile</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Number(latest.overtrading_score) > 30 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <Zap className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Reduce trading frequency</p>
                      <p className="text-xs text-muted-foreground">Consider setting a maximum daily trade limit. Your overtrading score suggests taking fewer, higher-conviction trades.</p>
                    </div>
                  </div>
                )}
                {Number(latest.loss_aversion_score) > 30 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Set predefined stop-losses and take-profits</p>
                      <p className="text-xs text-muted-foreground">Use fixed risk-reward ratios (e.g., 1:2) before entering trades. This removes emotional decision-making from exits.</p>
                    </div>
                  </div>
                )}
                {Number(latest.revenge_trading_score) > 30 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <Brain className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Implement a cooling-off period</p>
                      <p className="text-xs text-muted-foreground">After consecutive losses, take a mandatory break. Consider reducing position sizes by 50% for the next 3 trades.</p>
                    </div>
                  </div>
                )}
                {Number(latest.discipline_score) < 70 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-muted border border-border">
                    <Target className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Build a pre-trade checklist</p>
                      <p className="text-xs text-muted-foreground">Before every trade, verify: Does this match my strategy? Is my risk within limits? Am I in the right mental state?</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
                  <Heart className="w-5 h-5 text-success shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Track your emotional state</p>
                    <p className="text-xs text-muted-foreground">Use the Emotional Tracker to log your state before each trade session. Patterns between emotions and losses reveal hidden triggers.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
