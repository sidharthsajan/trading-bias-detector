import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import * as api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, TrendingUp, Zap, Brain, Heart, Target } from 'lucide-react';

const metrics = [
  { key: 'overall_score', label: 'Overall Score', icon: Shield, desc: 'Your composite risk behavior score' },
  { key: 'discipline_score', label: 'Discipline', icon: Target, desc: 'How well you follow your strategy' },
  { key: 'emotional_control_score', label: 'Emotional Control', icon: Heart, desc: 'Managing emotions during trades' },
  { key: 'overtrading_score', label: 'Overtrading Risk', icon: Zap, desc: 'Tendency to trade excessively', inverted: true },
  { key: 'loss_aversion_score', label: 'Loss Aversion', icon: TrendingUp, desc: 'Fear-based decision making', inverted: true },
  { key: 'revenge_trading_score', label: 'Revenge Trading', icon: Brain, desc: 'Impulsive recovery attempts', inverted: true },
];

export default function RiskProfile() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      api.getRiskProfiles(10).then((data) => { setProfiles(data || []); setLoading(false); });
    }
  }, [user]);

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
        <div>
          <h1 className="text-3xl font-display font-bold">Risk Profile</h1>
          <p className="text-muted-foreground mt-1">Your personalized behavioral risk assessment</p>
        </div>

        {!latest ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <Shield className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold mb-2">No risk profile yet</h3>
              <p className="text-muted-foreground">Run a bias analysis first to generate your risk profile.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Score cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map(m => {
                const score = Number(latest[m.key]) || 0;
                return (
                  <Card key={m.key} className="glass-card">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <m.icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{m.label}</p>
                            <p className="text-xs text-muted-foreground">{m.desc}</p>
                          </div>
                        </div>
                        <span className={`text-2xl font-display font-bold ${getScoreColor(score, m.inverted)}`}>
                          {getScoreGrade(score, m.inverted)}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full gradient-primary transition-all duration-700"
                          style={{ width: `${m.inverted ? 100 - score : score}%` }}
                        />
                      </div>
                      <p className="text-right text-sm text-muted-foreground mt-1">{m.inverted ? 100 - score : score}/100</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Portfolio optimization suggestions */}
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
