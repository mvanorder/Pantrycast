import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError } from '@/api/client';

import {
  fetchCurrentUser,
  login,
  logout,
  refresh,
  register,
  type TokenPair,
  type UserProfile,
} from './api';
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
 * Tries to exchange the stored refresh token for a new pair (uac-design.md §1
 * "Error contract" — the frontend should silently attempt a refresh rather
 * than forcing a sign-out on every 401). Persists the new pair on success.
 *
 * Returns `null` on any failure — no refresh token stored, or the server
 * rejects it (expired, already rotated out, reuse-detected) — rather than
 * throwing, since every caller's only move at that point is to fall back to
 * signing out; there's nothing to branch on beyond success/failure.
 */
async function attemptSilentRefresh(): Promise<TokenPair | null> {
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    const tokens = await refresh(refreshToken);
    await storeTokenPair(tokens);
    return tokens;
  } catch {
    return null;
  }
}

/**
 * Fetches the caller's profile, transparently retrying once via
 * {@link attemptSilentRefresh} if the stored access token is rejected. Any
 * other failure (network error, a non-401 status) passes straight through.
 *
 * On a failed refresh this rethrows the *original* 401, not a refresh-specific
 * error — the caller (`restore`, below) treats every rejection the same way
 * (clear the stored pair, settle on `unauthenticated`), so which error reaches
 * it doesn't change behavior, only what would show up in a log.
 */
async function fetchProfileWithRefresh(accessToken: string): Promise<UserProfile> {
  try {
    return await fetchCurrentUser(accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      throw err;
    }
    const tokens = await attemptSilentRefresh();
    if (!tokens) {
      throw err;
    }
    return fetchCurrentUser(tokens.access_token);
  }
}

/**
 * Holds the authentication state for the app: hydrates from stored tokens on
 * startup, and exposes `signIn` / `signOut`.
 *
 * A stored access token the server rejects (expired, most commonly — the
 * server issues 10-15 minute access tokens, uac-design.md §1 "Sessions and
 * tokens") is not immediately treated as signed-out: `restore` below tries a
 * silent `POST /auth/refresh` first via {@link fetchProfileWithRefresh}, and
 * only settles on `unauthenticated` if that also fails.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          if (!cancelled) setStatus('unauthenticated');
          return;
        }
        const profile = await fetchProfileWithRefresh(accessToken);
        if (cancelled) return;
        setUser(profile);
        setStatus('authenticated');
      } catch {
        // An expired access token already went through a silent refresh
        // attempt inside fetchProfileWithRefresh above, so reaching here means
        // that failed too (no refresh token stored, or the server rejected
        // it) — plus the other, unrelated failure modes: the server
        // unreachable, or the token store itself unreadable (e.g. storage
        // access blocked in an in-app browser). Every failure here must still
        // resolve `status`, since screens elsewhere (route guards,
        // `VerifyEmailScreen`'s continue button) wait on it leaving `loading`
        // and would otherwise hang forever. Drop the stored pair and start
        // signed out.
        await clearTokenPair().catch(() => {
          // Clearing is best-effort too — a storage failure here shouldn't
          // stop `status` from settling either.
        });
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
    try {
      const [accessToken, refreshToken] = await Promise.all([
        getAccessToken(),
        getRefreshToken(),
      ]);
      if (accessToken && refreshToken) {
        await logout(accessToken, refreshToken).catch(() => {
          // Best effort — a failed revocation still clears the client.
        });
      }
    } catch {
      // Reading the stored tokens failed — nothing to revoke server-side,
      // but `clearTokenPair` below still needs to run regardless: it must
      // not be skipped just because this step failed first, or the pair
      // stays in storage and the *next* launch restores the "signed out"
      // session right back.
    }
    await clearTokenPair().catch(() => {
      // Same invariant as `restore` above: a storage failure clearing the
      // pair must not stop the local session from ending, or tapping
      // "Sign out" would silently leave the user looking signed in.
    });
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
