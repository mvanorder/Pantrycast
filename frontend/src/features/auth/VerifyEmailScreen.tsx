import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Surface, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { BrandMark } from '@/components/BrandMark';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { radius, spacing, useAppTheme, useResponsive } from '@/theme';

import { AuthOutcome, LiveAnnouncement, type AuthOutcomeAction } from './AuthOutcome';
import { useAuth } from './AuthContext';

const GENERIC_ERROR = 'Something went wrong confirming your email. Please try again.';
// Deliberately doesn't say "check that you copied the full link": this also
// fires on a plain page refresh after a successful confirm, since the token
// is stripped from the URL once read (see the effect below) — a copy-paste
// mistake is only one of two causes here, not the likely one. Doesn't point
// at a "request a new link" action either, since there's no resend flow yet
// (uac-design.md §1) — only `register` issues a verification token today.
const MISSING_TOKEN_ERROR =
  "This link is missing its verification token — or your email is already confirmed and this page was just reloaded.";
// `POST /auth/verify-email`'s 400 (`backend/app/routers/auth.py`) is a bare
// developer string — "Invalid verification token", no punctuation, no next
// step — not something to show a user verbatim. This is the path a link an
// email client wrapped or truncated actually lands on, so it's the one
// that most needs the hint the raw string doesn't give.
const INVALID_TOKEN_ERROR =
  "This verification link isn't valid. Check that you copied the full link from your email, then try again.";
// The 422 detail ("Verification token has expired or already been used") is
// at least accurate, but still reads as a log line rather than copy aimed at
// the person looking at it.
const EXPIRED_TOKEN_ERROR = 'This verification link has expired or has already been used.';

/**
 * Turns a redemption failure into copy for the `error` state.
 *
 * Only a transport failure (`status === 0`) shows the API client's own
 * message verbatim — that copy (`api/client.ts`'s `NETWORK_ERROR_MESSAGE`) is
 * already user-facing. A 400/422 gets translated (see the constants above);
 * anything else falls back to {@link GENERIC_ERROR}.
 */
function describeVerificationError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return GENERIC_ERROR;
  }
  switch (error.status) {
    case 0:
      return error.message;
    case 400:
      return INVALID_TOKEN_ERROR;
    case 422:
      return EXPIRED_TOKEN_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

type Status = 'verifying' | 'success' | 'error';

type VerifyEmailScreenProps = {
  /** The `token` query param off the emailed link, or `undefined`/empty if missing. */
  token?: string;
  /**
   * Redeems `token` — the `/verify-email` route wires this to
   * `POST /auth/verify-email`. Called once, on mount, with a non-empty
   * `token`.
   *
   * Reject to surface an error: a rejection is translated by
   * {@link describeVerificationError} — only a transport failure
   * (`ApiError.status === 0`) shows the message verbatim, since the API's own
   * 400/422 detail strings are bare developer copy, not user-facing text.
   * Resolve on success. Left undefined (isolated tests, previews), the
   * screen sits in the `verifying` state forever.
   */
  onVerify?: (token: string) => Promise<void>;
};

/**
 * Lands here from the "Confirm your email address" link
 * (`app/mailer/__init__.py`'s `render_verification_email` on the backend);
 * redeems the token automatically on mount rather than asking for another
 * tap.
 *
 * The `/verify-email` route mounts this keyed on `token`, so opening a second
 * emailed link into the same tab remounts fresh (a clean `verifying` state)
 * rather than layering a new in-flight redemption under the previous
 * attempt's leftover success/error copy.
 *
 * Reachable signed in or signed out — verifying an email neither requires
 * nor starts a session (uac-design.md §1 "Account states") — so the
 * "continue" action goes to the dashboard for an already-signed-in visitor
 * and to login otherwise.
 */
export function VerifyEmailScreen({ token, onVerify }: VerifyEmailScreenProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { gutter } = useResponsive();
  const { status: authStatus } = useAuth();

  // Always starts `verifying`, even for a missing token: the static web
  // export prerenders this screen with no query params, so an initial state
  // derived from `token` would bake the error text into that build's first
  // paint. Settling on the real state happens below, after mount, the same
  // way a redemption failure does.
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR);
  // Set only for a transport failure (`ApiError.status === 0`): the request
  // never reached the server *or* its response never reached us — the
  // latter means the server may have already redeemed the token even though
  // this client sees it as unspent, so a retry can occasionally report
  // "already been used" for a verification that in fact succeeded. Still the
  // one case worth offering a retry for: any other error (400/422) would
  // just fail the exact same way again, which this at least won't.
  const [canRetry, setCanRetry] = useState(false);
  // Bumped by the "Try again" button to re-run the effect below without
  // depending on the URL still holding the token — see the `replaceState`
  // comment for why that dependency would be unsafe.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (token && Platform.OS === 'web' && typeof window !== 'undefined') {
      // The token is spent as soon as it's captured in this closure — strip
      // it from the URL now, before it's sent as the `Referer` on the POST
      // below (same-origin, behind the proxy), and so it doesn't linger in
      // browser history. This does *not* keep it out of nginx's access log:
      // the initial `GET /verify-email?token=…` for this very page is
      // already logged server-side before any of this JS runs.
      //
      // Passes the *existing* `history.state` through rather than `null`:
      // expo-router's web history layer stores its own `{ id }` bookkeeping
      // there (`expo-router/build/fork/createMemoryHistory.js`), and
      // clobbering it would corrupt back/forward navigation on this entry.
      // We only want to change the URL, not the state object.
      //
      // This bypasses expo-router's own history API entirely, which has one
      // sharp edge: `useLinking.js`'s `onStateChange` re-derives the URL from
      // React Navigation's state tree and calls `history.replace({ path,
      // state })` on it whenever that state tree changes — and that tree
      // still has `token` as this route's param, unaffected by this direct
      // DOM call. A *navigation* action elsewhere while this screen is still
      // mounted (a push/replace, tab switch, etc.) would re-run that listener
      // and could put `?token=…` right back. In practice nothing here
      // triggers a navigation action until "continue" is pressed — which
      // replaces to a different route with a clean URL of its own anyway —
      // so this hasn't been an issue, but it's not proof against every future
      // caller of this screen.
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }

    // A missing token is folded into the same async settling path as a
    // rejected redemption (rather than branching to a synchronous setState
    // here) so every route to the `error` state goes through a microtask,
    // same as a real `onVerify` rejection. Retrying (`attempt`) reuses this
    // same `token` from the closure rather than re-reading the URL, which is
    // exactly why stripping the URL up front is safe: recovery from a failed
    // attempt never depends on the token still being there.
    const redemption = token
      ? onVerify?.(token)
      : Promise.reject(new Error(MISSING_TOKEN_ERROR));
    if (!redemption) {
      return undefined;
    }

    let cancelled = false;
    redemption
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(!token ? MISSING_TOKEN_ERROR : describeVerificationError(error));
        setCanRetry(!!token && error instanceof ApiError && error.status === 0);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // A verification token is single-use per *server-accepted* attempt, but
    // this effect itself may legitimately re-run for the same token — a
    // retry after a transport failure never reached the server at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, attempt]);

  const retry = () => {
    setStatus('verifying');
    setAttempt((current) => current + 1);
  };

  // While the stored session is still being restored, `authStatus` isn't
  // "unauthenticated" yet — just unknown — so the continue action stays
  // disabled rather than momentarily offering "Log in" to a visitor who
  // turns out to already be signed in.
  const authSettled = authStatus !== 'loading';
  const continueAction: AuthOutcomeAction = {
    label: authStatus === 'authenticated' ? 'Go to dashboard' : 'Log in',
    onPress: () => router.replace(authStatus === 'authenticated' ? '/dashboard' : '/login'),
    disabled: !authSettled,
  };

  // Fed to the always-mounted {@link LiveAnnouncement} below rather than
  // announced off the visible copy — see that component for why.
  const announcement =
    status === 'success'
      ? 'Email confirmed. Your email address is verified.'
      : status === 'error'
        ? `We couldn’t confirm that email. ${errorMessage}`
        : '';

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScreenScrollView
        bodyStyle={[
          styles.scrollContent,
          {
            paddingVertical: spacing.xl,
            paddingHorizontal: gutter + Math.max(insets.left, insets.right),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} style={styles.card}>
          <View style={styles.brand}>
            <BrandMark />
          </View>

          <LiveAnnouncement testID="verify-email-announcer" message={announcement} />

          {status === 'verifying' && (
            <View style={styles.section}>
              <ActivityIndicator animating size="large" testID="verify-email-spinner" />
              <Text
                variant="bodyMedium"
                style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
              >
                Confirming your email…
              </Text>
            </View>
          )}

          {status === 'success' && (
            <AuthOutcome
              icon="check-circle-outline"
              tone="success"
              title="Email confirmed"
              body="Your email address is verified."
              actions={[continueAction]}
            />
          )}

          {status === 'error' && (
            <AuthOutcome
              icon="alert-circle-outline"
              tone="error"
              title="We couldn’t confirm that email"
              body={errorMessage}
              actions={
                canRetry
                  ? [
                      { label: 'Try again', onPress: retry },
                      { ...continueAction, mode: 'outlined' },
                    ]
                  : [continueAction]
              }
            />
          )}
        </Surface>
      </ScreenScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  section: {
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 360,
  },
});
