import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type Session } from '../api/auth';
import { AUTH_MODE } from '../api/env';
import { UNAUTHENTICATED_EVENT } from '../api/http';
import { mockSession } from '../config';
import { remember } from './rememberedAccount';

type Status = 'loading' | 'signedIn' | 'signedOut';

interface AuthValue {
  status: Status;
  session: Session | null;
  /** Store a session returned by a sign-in call. */
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  /** Update fields after a change (for example voice sign-in turned on). */
  patchUser: (patch: Partial<Session['user']>) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Loads GET /api/me once at start, then keeps the session in memory. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(AUTH_MODE === 'mock' ? mockSession : null);
  const [status, setStatus] = useState<Status>(AUTH_MODE === 'mock' ? 'signedIn' : 'loading');

  useEffect(() => {
    if (AUTH_MODE === 'mock') return;
    let alive = true;
    authApi
      .me()
      .then((s) => {
        if (!alive) return;
        setSession(s);
        setStatus('signedIn');
      })
      .catch(() => alive && setStatus('signedOut'));
    // Any API call that gets a 401 ends the session everywhere in the app.
    const onSignedOut = () => {
      setSession(null);
      setStatus('signedOut');
    };
    window.addEventListener(UNAUTHENTICATED_EVENT, onSignedOut);
    return () => {
      alive = false;
      window.removeEventListener(UNAUTHENTICATED_EVENT, onSignedOut);
    };
  }, []);

  const signIn = useCallback((s: Session) => {
    remember(s);
    setSession(s);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    if (AUTH_MODE === 'api') await authApi.logout().catch(() => undefined);
    setSession(null);
    setStatus('signedOut');
  }, []);

  const patchUser = useCallback((patch: Partial<Session['user']>) => {
    setSession((s) => {
      if (!s) return s;
      const next = { ...s, user: { ...s.user, ...patch } };
      remember(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ status, session, signIn, signOut, patchUser }),
    [status, session, signIn, signOut, patchUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user and company. Only for components rendered behind <RequireAuth>. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('useSession used outside a signed-in route');
  return session;
}
