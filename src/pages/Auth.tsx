import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, ChevronRight, Eye, EyeOff, LineChart, Loader2, ShieldCheck } from 'lucide-react';

const featurePoints = [
  {
    icon: LineChart,
    title: 'Behavior Analytics',
    description: 'Track P/L behavior patterns across symbols and trading sessions.',
  },
  {
    icon: ShieldCheck,
    title: 'Risk Oversight',
    description: 'Flag overtrading, revenge trading, and loss aversion before they escalate.',
  },
];

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const toggleMode = () => setIsSignUp(!isSignUp);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (isSignUp) {
      const { error } = await signUp(email, password, displayName);
      if (error) {
        toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Account created', description: 'Check your email to verify your account.' });
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
      }
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-accent/30">
      <div className="fixed inset-0 bg-[linear-gradient(hsl(var(--accent))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--accent))_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 pointer-events-none" aria-hidden />

      <header className="relative bg-card/80 backdrop-blur-md border-b border-border/60">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary via-primary/90 to-secondary" />
        <div className="mx-auto max-w-6xl h-16 md:h-[4.5rem] px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm md:text-base">Bias Detector</p>
              <p className="text-[11px] md:text-xs text-muted-foreground leading-tight">National Bank Capital Markets</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              title={language === 'en' ? 'Set language to French' : 'Set language to English'}
              className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors px-2.5 py-2 rounded-lg hover:bg-accent/50"
            >
              {language === 'en' ? 'FR' : 'EN'}
            </button>
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-accent/50"
            >
              {isSignUp ? 'Already have an account?' : 'Need an account?'}
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 md:px-6 py-8 lg:py-12">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 lg:gap-10 items-center">
          <section className="rounded-2xl lg:rounded-3xl gradient-navy text-secondary-foreground overflow-hidden shadow-2xl shadow-secondary/20 border border-white/10">
            <div className="h-1 w-full bg-gradient-to-r from-primary to-primary/80" />
            <div className="p-6 sm:p-8 md:p-10">
              <p className="text-[11px] sm:text-xs tracking-[0.2em] uppercase text-secondary-foreground/60 mb-3">
                National Bank Platform
              </p>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold leading-[1.15] tracking-tight mb-4">
                Trade with discipline and measurable confidence.
              </h1>
              <p className="text-secondary-foreground/80 max-w-xl leading-relaxed text-sm sm:text-base">
                Centralize your execution data, identify behavioral bias quickly, and get targeted coaching aligned
                with institutional risk controls.
              </p>

              <div className="mt-8 grid sm:grid-cols-2 gap-3 sm:gap-4">
                {featurePoints.map((point) => (
                  <div
                    key={point.title}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center mb-3">
                      <point.icon className="w-4 h-4 text-primary" />
                    </div>
                    <p className="font-semibold text-sm mb-0.5">{point.title}</p>
                    <p className="text-xs text-secondary-foreground/70 leading-snug">{point.description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-widest text-secondary-foreground/55">Operational focus</p>
                <p className="mt-2 text-sm text-secondary-foreground/80 leading-relaxed">
                  Improve consistency by linking execution outcomes to emotional and behavioral triggers.
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center">
            <div className="w-full">
            <Card className="w-full border border-border/80 bg-card shadow-2xl shadow-black/5 rounded-2xl lg:rounded-3xl overflow-hidden">
              <div key={isSignUp ? 'signup' : 'signin'}>
                  <CardHeader className="space-y-1.5 pb-2">
                    <CardTitle className="text-xl sm:text-2xl font-display font-semibold text-foreground tracking-tight">
                      {isSignUp ? 'Create your account' : 'Sign in'}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-sm">
                      {isSignUp ? 'Start your behavior-driven trading review.' : 'Access your trading bias dashboard.'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-2">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {isSignUp && (
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-sm font-medium text-foreground">Display Name</Label>
                          <Input
                            id="name"
                            placeholder="Your name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="h-11 rounded-xl border-border bg-background/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="trader@example.com"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-11 rounded-xl border-border bg-background/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="h-11 rounded-xl border-border bg-background/50 focus-visible:ring-2 focus-visible:ring-primary/20 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="pt-1">
                        <Button
                          type="submit"
                          disabled={submitting}
                          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/25 transition-shadow"
                        >
                          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          {isSignUp ? 'Create Account' : 'Sign In'}
                          {!submitting ? <ChevronRight className="w-4 h-4 ml-1" /> : null}
                        </Button>
                      </div>
                    </form>

                    <div className="mt-6 pt-5 border-t border-border">
                      <button
                        type="button"
                        onClick={toggleMode}
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                      >
                        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                      </button>
                    </div>
                  </CardContent>
              </div>
            </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
