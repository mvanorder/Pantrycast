import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { BrandMark } from '@/components/BrandMark';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { heading, layout, radius, spacing, useAppTheme, useResponsive } from '@/theme';

import { useAuth } from './AuthContext';

const GENERIC_ERROR = 'Something went wrong confirming your email. Please try again.';
const MISSING_TOKEN_ERROR =
  "This verification link is missing its token. Check that you copied the full link from your email.";

type Status = 'verifying' | 'success' | 'error';

type VerifyEmailScreenProps = {
  /** The `token` query param off the emailed link, or `undefined`/empty if missing. */
  token?: string;
  /**
   * Redeems `token` — the `/verify-email` route wires this to
   * `POST /auth/verify-email`. Called once, on mount, with a non-empty
   * `token`.
   *
   * Reject to surface an error: an {@link ApiError}'s message is shown
   * verbatim (the API's 422 "expired or already used" copy is already
   * user-facing), anything else falls back to a generic message. Resolve on
   * success. Left undefined (isolated tests, previews), the screen sits in
   * the `verifying` state forever.
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
  const { gutter } = useResponsive();
  const { status: authStatus } = useAuth();

  // Always starts `verifying`, even for a missing token: the static web
  // export prerenders this screen with no query params, so an initial state
  // derived from `token` would bake the error text into that build's first
  // paint. Settling on the real state happens below, after mount, the same
  // way a redemption failure does.
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR);

  useEffect(() => {
    if (token && Platform.OS === 'web' && typeof window !== 'undefined') {
      // The token is spent as soon as it's captured in this closure — strip
      // it from the URL now, before it's sent as the `Referer` on the POST
      // below, so it doesn't linger in browser history or (same-origin,
      // behind the proxy) nginx's access log.
      window.history.replaceState(null, '', window.location.pathname);
    }

    // A missing token is folded into the same async settling path as a
    // rejected redemption (rather than branching to a synchronous setState
    // here) so every route to the `error` state goes through a microtask,
    // same as a real `onVerify` rejection.
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
        setErrorMessage(
          !token ? MISSING_TOKEN_ERROR : error instanceof ApiError ? error.message : GENERIC_ERROR,
        );
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // A verification token is single-use: redeem once for the token this
    // screen instance mounted with (the route remounts a fresh instance per
    // token — see the component docstring — so this never actually re-runs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // While the stored session is still being restored, `authStatus` isn't
  // "unauthenticated" yet — just unknown — so the continue action stays
  // disabled rather than momentarily offering "Log in" to a visitor who
  // turns out to already be signed in.
  const authSettled = authStatus !== 'loading';
  const continueHref = authStatus === 'authenticated' ? '/dashboard' : '/login';
  const continueLabel = authStatus === 'authenticated' ? 'Go to dashboard' : 'Log in';

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
            <Outcome
              icon="check-circle-outline"
              iconBackground={theme.colors.primaryContainer}
              iconColor={theme.colors.onPrimaryContainer}
              title="Email confirmed"
              body="Your email address is verified."
              continueHref={continueHref}
              continueLabel={continueLabel}
              continueDisabled={!authSettled}
            />
          )}

          {status === 'error' && (
            <Outcome
              icon="alert-circle-outline"
              iconBackground={theme.colors.errorContainer}
              iconColor={theme.colors.onErrorContainer}
              title="We couldn’t confirm that email"
              body={errorMessage}
              continueHref={continueHref}
              continueLabel={continueLabel}
              continueDisabled={!authSettled}
            />
          )}
        </Surface>
      </ScreenScrollView>
    </View>
  );
}

type OutcomeProps = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconBackground: string;
  iconColor: string;
  title: string;
  body: string;
  continueHref: '/dashboard' | '/login';
  continueLabel: string;
  continueDisabled: boolean;
};

/** The settled (`success` or `error`) state of {@link VerifyEmailScreen} — same shape, different art/copy. */
function Outcome({
  icon,
  iconBackground,
  iconColor,
  title,
  body,
  continueHref,
  continueLabel,
  continueDisabled,
}: OutcomeProps) {
  const theme = useAppTheme();
  const router = useRouter();

  return (
    <View style={styles.section}>
      <View style={[styles.art, { backgroundColor: iconBackground }]}>
        <MaterialCommunityIcons name={icon} size={32} color={iconColor} />
      </View>
      <Text
        {...heading(1)}
        variant="headlineMedium"
        style={[styles.title, { color: theme.colors.onSurface }]}
      >
        {title}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
        accessibilityLiveRegion="polite"
      >
        {body}
      </Text>
      <Button
        mode="contained"
        onPress={() => router.replace(continueHref)}
        disabled={continueDisabled}
        style={styles.action}
        contentStyle={styles.actionContent}
        accessibilityRole="button"
        accessibilityLabel={continueLabel}
      >
        {continueLabel}
      </Button>
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
  art: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 360,
  },
  action: {
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  actionContent: {
    height: layout.minTouchTarget,
  },
});
