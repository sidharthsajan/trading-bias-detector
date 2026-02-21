import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import * as api from '@/lib/api';

export interface User {
  id: string;
  email: string;
  display_name?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: { access_token: string } | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  mfaEnrolled: boolean;
  enrollMFA: () => Promise<{ qrCode: string; secret: string; factorId: string } | null>;
  verifyMFA: (factorId: string, code: string) => Promise<{ error: Error | null }>;
  challengeMFA: () => Promise<{ factorId: string; challengeId: string } | null>;
  verifyMFAChallenge: (factorId: string, challengeId: string, code: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'access_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);

  const loadUser = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setSession(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.getMe();
      setUser({
        id: me.id,
        email: me.email,
        display_name: me.display_name ?? null,
      });
      setSession({ access_token: token });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const { data } = await api.signUp(email, password, displayName);
      if (data?.access_token) {
        localStorage.setItem(TOKEN_KEY, data.access_token);
        await loadUser();
      }
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data } = await api.signIn(email, password);
      if (data?.access_token) {
        localStorage.setItem(TOKEN_KEY, data.access_token);
        await loadUser();
      }
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signOut = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setSession(null);
  };

  const enrollMFA = async () => {
    return null;
  };
  const verifyMFA = async () => ({ error: null as Error | null });
  const challengeMFA = async () => null;
  const verifyMFAChallenge = async () => ({ error: null as Error | null });

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
