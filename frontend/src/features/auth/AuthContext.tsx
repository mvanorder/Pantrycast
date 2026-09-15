import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { fetchCurrentUser, login, logout, register, type UserProfile } from './api';
import {
  clearTokenPair,
  getAccessToken,
  getRefreshToken,
  storeTokenPair,
} from './tokenStorage';

/** `loading` until the persisted session (if any) has been checked on startup. */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type Credentials = { email: string; password: string };

/** Details for a new account — {@link Credentials} plus an optional display name. */
export type NewAccountDetails = Credentials & { displayName?: string };

type AuthContextValue = {
  status: AuthStatus;
  /** The signed-in user's profile, or `null` unless `status` is `authenticated`. */
  user: UserProfile | null;
  /**
   * Sign in with email + password. Resolves once the token pair is stored and
   * the profile is loaded; rejects (leaving the session untouched) with the
   * {@link ApiError} from `POST /auth/login` on a bad credential.
   */
  signIn: (credentials: Credentials) => Promise<void>;
  /**
   * Create a new account, then sign in as it — `POST /auth/register` issues
   * no token pair of its own, so this chains a {@link signIn} with the same
   * credentials. Rejects (leaving the session untouched) with the
   * {@link ApiError} from whichever call failed — a 400 from register for a
   * taken email, or whatever `signIn` can reject with.
   */
  signUp: (details: NewAccountDetails) => Promise<void>;
  /** Revoke the session server-side (best effort) and clear the local tokens. */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the authentication state for the app: hydrates from stored tokens on
 * startup, and exposes `signIn` / `signOut`.
 *
 * Silent access-token refresh on a 401 (uac-design.md §1) is not built yet — a
 * stored token the server rejects is treated as a signed-out state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }
      try {
        const profile = await fetchCurrentUser(accessToken);
        if (cancelled) return;
        setUser(profile);
        setStatus('authenticated');
      } catch {
        // Expired/invalid stored token, or the server is unreachable. Drop the
        // stored pair and start signed out.
        await clearTokenPair();
        if (!cancelled) setStatus('unauthenticated');
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (credentials: Credentials) => {
    const tokens = await login(credentials);
    await storeTokenPair(tokens);
    const profile = await fetchCurrentUser(tokens.access_token);
    setUser(profile);
    setStatus('authenticated');
  }, []);

  const signUp = useCallback(
    async (details: NewAccountDetails) => {
      await register(details);
      await signIn({ email: details.email, password: details.password });
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    const [accessToken, refreshToken] = await Promise.all([
      getAccessToken(),
      getRefreshToken(),
    ]);
    if (accessToken && refreshToken) {
      await logout(accessToken, refreshToken).catch(() => {
        // Best effort — a failed revocation still clears the client.
      });
    }
    await clearTokenPair();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the auth state. Throws if used outside an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
