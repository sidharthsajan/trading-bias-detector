import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight, Eye, EyeOff, LineChart, Loader2, ShieldCheck } from 'lucide-react';

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
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

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
    <div className="min-h-screen bg-accent/40">
      <header className="bg-white border-b border-border">
        <div className="h-1 bg-primary" />
        <div className="mx-auto max-w-6xl h-20 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden">
              <img src="/national-bank-logo.png" alt="National Bank logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="font-semibold text-secondary leading-tight">Bias Detector</p>
              <p className="text-xs text-muted-foreground leading-tight">National Bank Capital Markets</p>
            </div>
          </div>

          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm font-medium text-secondary hover:text-primary transition-colors"
          >
            {isSignUp ? 'Already have an account?' : 'Need an account?'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
          <section className="rounded-2xl gradient-navy text-secondary-foreground border border-sidebar-border shadow-lg overflow-hidden">
            <div className="h-1.5 bg-primary" />
            <div className="p-8 md:p-10">
              <p className="text-xs tracking-[0.14em] uppercase text-secondary-foreground/70 mb-4">
                National Bank Platform
              </p>
              <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">
                Trade with discipline and measurable confidence.
              </h1>
              <p className="text-secondary-foreground/75 max-w-xl leading-relaxed">
                Centralize your execution data, identify behavioral bias quickly, and get targeted coaching aligned
                with institutional risk controls.
              </p>

              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                {featurePoints.map((point) => (
                  <div key={point.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <point.icon className="w-5 h-5 text-primary mb-3" />
                    <p className="font-semibold mb-1">{point.title}</p>
                    <p className="text-sm text-secondary-foreground/75">{point.description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-secondary-foreground/65">Operational focus</p>
                <p className="mt-2 text-sm text-secondary-foreground/80 leading-relaxed">
                  Improve consistency by linking execution outcomes to emotional and behavioral triggers.
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center">
            <Card className="w-full border-border bg-white shadow-xl shadow-secondary/10">
              <CardHeader>
                <CardTitle className="text-2xl font-display text-secondary">
                  {isSignUp ? 'Create your account' : 'Sign in'}
                </CardTitle>
                <CardDescription>
                  {isSignUp ? 'Start your behavior-driven trading review.' : 'Access your trading bias dashboard.'}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp && (
                    <div className="space-y-2">
                      <Label htmlFor="name">Display Name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="trader@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {isSignUp ? 'Create Account' : 'Sign In'}
                    {!submitting ? <ChevronRight className="w-4 h-4 ml-1" /> : null}
                  </Button>
                </form>

                <div className="mt-5 pt-5 border-t border-border">
                  <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                  </button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
