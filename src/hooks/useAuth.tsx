import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  // MFA
  mfaEnrolled: boolean;
  enrollMFA: () => Promise<{ qrCode: string; secret: string; factorId: string } | null>;
  verifyMFA: (factorId: string, code: string) => Promise<{ error: any }>;
  challengeMFA: () => Promise<{ factorId: string; challengeId: string } | null>;
  verifyMFAChallenge: (factorId: string, challengeId: string, code: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      checkMFA();
    }
  }, [user]);

  const checkMFA = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnrolled((data?.totp?.length ?? 0) > 0);
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const enrollMFA = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
    if (error || !data) return null;
    return { qrCode: data.totp.qr_code, secret: data.totp.secret, factorId: data.id };
  };

  const verifyMFA = async (factorId: string, code: string) => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) return { error: challengeError };
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (!error) setMfaEnrolled(true);
    return { error };
  };

  const challengeMFA = async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) return null;
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (error) return null;
    return { factorId: totp.id, challengeId: data.id };
  };

  const verifyMFAChallenge = async (factorId: string, challengeId: string, code: string) => {
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    return { error };
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading, signUp, signIn, signOut,
      mfaEnrolled, enrollMFA, verifyMFA, challengeMFA, verifyMFAChallenge,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
