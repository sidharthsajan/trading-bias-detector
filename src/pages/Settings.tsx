import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User, Shield, Loader2, CheckCircle, QrCode } from 'lucide-react';

export default function Settings() {
  const { user, mfaEnrolled, enrollMFA, verifyMFA } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ qrCode: string; secret: string; factorId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('display_name').eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setDisplayName(data.display_name || ''); });
    }
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('user_id', user!.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Profile updated!' });
    setSaving(false);
  };

  const startMFA = async () => {
    setEnrolling(true);
    const result = await enrollMFA();
    if (result) setMfaSetup(result);
    else toast({ title: 'Error', description: 'Failed to start MFA setup.', variant: 'destructive' });
    setEnrolling(false);
  };

  const confirmMFA = async () => {
    if (!mfaSetup || !mfaCode) return;
    setEnrolling(true);
    const { error } = await verifyMFA(mfaSetup.factorId, mfaCode);
    if (error) {
      toast({ title: 'Verification failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '2FA Enabled!', description: 'Your account is now more secure.' });
      setMfaSetup(null);
      setMfaCode('');
    }
    setEnrolling(false);
  };

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in max-w-2xl">
        <div>
          <h1 className="text-3xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your profile and security</p>
        </div>

        {/* Profile */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2"><User className="w-5 h-5 text-primary" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
            </div>
            <Button onClick={saveProfile} disabled={saving} className="gradient-primary text-primary-foreground">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* 2FA */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Two-Factor Authentication</CardTitle>
            <CardDescription>Add an extra layer of security to your account</CardDescription>
          </CardHeader>
          <CardContent>
            {mfaEnrolled ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/20">
                <CheckCircle className="w-6 h-6 text-success" />
                <div>
                  <p className="font-medium">2FA is enabled</p>
                  <p className="text-sm text-muted-foreground">Your account is protected with an authenticator app.</p>
                </div>
              </div>
            ) : mfaSetup ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-3">Scan this QR code with your authenticator app</p>
                  <div className="inline-block p-4 bg-card rounded-xl border border-border">
                    <img src={mfaSetup.qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Or enter manually: <code className="bg-muted px-2 py-0.5 rounded text-xs">{mfaSetup.secret}</code></p>
                </div>
                <div className="space-y-2">
                  <Label>Enter the 6-digit code from your app</Label>
                  <Input
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setMfaSetup(null); setMfaCode(''); }}>Cancel</Button>
                  <Button onClick={confirmMFA} disabled={mfaCode.length !== 6 || enrolling} className="gradient-primary text-primary-foreground">
                    {enrolling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Verify & Enable
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Protect your account by requiring a code from your authenticator app when signing in.
                </p>
                <Button onClick={startMFA} disabled={enrolling} variant="outline">
                  {enrolling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <QrCode className="w-4 h-4 mr-1" />}
                  Set Up 2FA
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
