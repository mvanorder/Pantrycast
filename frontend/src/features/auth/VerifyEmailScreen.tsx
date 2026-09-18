import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ApiError } from '@/api/client';
import { BrandMark } from '@/components/BrandMark';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { heading, radius, spacing, useAppTheme } from '@/theme';

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
 * Reachable signed in or signed out — verifying an email neither requires
 * nor starts a session (uac-design.md §1 "Account states") — so the
 * "continue" action goes to the dashboard for an already-signed-in visitor
 * and to login otherwise.
 */
export function VerifyEmailScreen({ token, onVerify }: VerifyEmailScreenProps) {
  const theme = useAppTheme();
  const router = useRouter();
  const { status: authStatus } = useAuth();

  // A missing token isn't something to synchronize with an external system —
  // it's fully determined by the prop this screen mounted with — so it's
  // derived here rather than set from inside the effect below.
  const [status, setStatus] = useState<Status>(() => (token ? 'verifying' : 'error'));
  const [errorMessage, setErrorMessage] = useState(() =>
    token ? GENERIC_ERROR : MISSING_TOKEN_ERROR,
  );

  useEffect(() => {
    if (!token || !onVerify) {
      return undefined;
    }

    let cancelled = false;
    onVerify(token)
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof ApiError ? error.message : GENERIC_ERROR);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // A verification token is single-use: redeem once for the token this
    // screen mounted with, never again on an unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const continueHref = authStatus === 'authenticated' ? '/dashboard' : '/login';
  const continueLabel = authStatus === 'authenticated' ? 'Go to dashboard' : 'Log in';

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScreenScrollView
        bodyStyle={[styles.scrollContent, { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg }]}
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
            <View style={styles.section}>
              <View style={[styles.art, { backgroundColor: theme.colors.primaryContainer }]}>
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={32}
                  color={theme.colors.onPrimaryContainer}
                />
              </View>
              <Text
                {...heading(1)}
                variant="headlineMedium"
                style={[styles.title, { color: theme.colors.onSurface }]}
              >
                Email confirmed
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
              >
                Your email address is verified.
              </Text>
              <Button
                mode="contained"
                onPress={() => router.replace(continueHref)}
                style={styles.action}
                contentStyle={styles.actionContent}
                accessibilityRole="button"
                accessibilityLabel={continueLabel}
              >
                {continueLabel}
              </Button>
            </View>
          )}

          {status === 'error' && (
            <View style={styles.section}>
              <View style={[styles.art, { backgroundColor: theme.colors.errorContainer }]}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={32}
                  color={theme.colors.onErrorContainer}
                />
              </View>
              <Text
                {...heading(1)}
                variant="headlineMedium"
                style={[styles.title, { color: theme.colors.onSurface }]}
              >
                We couldn’t confirm that email
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
                accessibilityLiveRegion="polite"
              >
                {errorMessage}
              </Text>
              <Button
                mode="contained"
                onPress={() => router.replace(continueHref)}
                style={styles.action}
                contentStyle={styles.actionContent}
                accessibilityRole="button"
                accessibilityLabel={continueLabel}
              >
                {continueLabel}
              </Button>
            </View>
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
    height: 48,
  },
});
