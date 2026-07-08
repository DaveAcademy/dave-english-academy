import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSession, onAuthStateChange, getProfile } from './auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession) {
      setProfile(null);
      return;
    }
    try {
      const p = await getProfile(currentSession.user.id);
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    getSession().then(async (s) => {
      if (!mounted) return;
      setSession(s);
      await loadProfile(s);
      if (mounted) setLoading(false);
    });

    const subscription = onAuthStateChange(async (s) => {
      if (!mounted) return;
      setSession(s);
      await loadProfile(s);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  return (
    <AuthContext.Provider
      value={{ session, profile, role: profile?.role ?? null, loading, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
