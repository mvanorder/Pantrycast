import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Surface, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { BrandMark } from '@/components/BrandMark';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { heading, layout, radius, spacing, useAppTheme, useResponsive } from '@/theme';

import { AuthOutcome, LiveAnnouncement } from './AuthOutcome';

const GENERIC_SUBMIT_ERROR = 'Something went wrong sending that link. Please try again.';

/**
 * Turns a failed request into copy for the error line under the button.
 *
 * Only a transport failure (`status === 0`) shows the API client's own
 * message verbatim — that copy (`api/client.ts`'s `NETWORK_ERROR_MESSAGE`) is
 * already user-facing and tells the user something actionable. Everything
 * else is a server-side problem the user can't diagnose (the endpoint has no
 * user-caused failure mode: it answers 204 for a match *and* a non-match), so
 * it falls back to {@link GENERIC_SUBMIT_ERROR}. Same split
 * {@link VerifyEmailScreen} makes, with fewer branches because there are
 * fewer meaningful statuses here.
 */
function describeRequestError(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) {
    return error.message;
  }
  return GENERIC_SUBMIT_ERROR;
}

// Deliberately loose, and identical to the login/sign-up forms': reject
// "obviously not an email" (no `@`, no domain) client-side and leave the rest
// to the server. Stricter matching here would only turn away addresses the
// backend accepts — and on this screen a false rejection is worse than
// elsewhere, since the user has no other way back into their account.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string): string | undefined {
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return 'Enter your email address.';
  }
  if (!EMAIL_RE.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  return undefined;
}

type ForgotPasswordScreenProps = {
  /**
   * Called with the trimmed email address when the form is submitted. May be
   * async; the screen shows a busy button until it settles.
   *
   * Resolve to move to the "check your email" state — and note that this
   * resolves for an address with no account too, since
   * `POST /auth/password-reset` answers 204 either way (anti-enumeration).
   * Reject to stay on the form with an error under the button: a transport
   * failure (`ApiError.status === 0`) shows its message verbatim, anything
   * else falls back to a generic message. A rejection must never be used to
   * signal "no such account" — there is no such response to react to.
   *
   * The `/forgot-password` route wires this to `POST /auth/password-reset`;
   * left undefined (isolated tests, previews) a valid submit is a no-op.
   */
  onSubmit?: (email: string) => void | Promise<void>;
};

/**
 * "Forgot password?" request screen (route: `/forgot-password`), reached from
 * the link under the password field on {@link LoginScreen}.
 *
 * Step one of two: this screen only asks the backend to email a reset link;
 * the link itself lands on `/reset-password`, where the new password is set.
 *
 * The settled state is carefully worded: the API cannot tell us whether the
 * address matched an account, and must not be made to — so the confirmation
 * is conditional ("if that address has an account…") and looks exactly the
 * same for a real account, a typo, and an address that never signed up. Do
 * not "improve" this copy into a confirmation; it would hand an enumeration
 * oracle to anyone with the form.
 */
export function ForgotPasswordScreen({ onSubmit }: ForgotPasswordScreenProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { gutter } = useResponsive();

  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // After the first submit, keep the message honest as the user fixes the
  // field rather than leaving a stale error under a now-valid input.
  const liveError = useMemo(
    () => (submitted ? validate(email) : error),
    [submitted, email, error],
  );

  const handleSubmit = useCallback(async () => {
    const nextError = validate(email);
    setError(nextError);
    setSubmitted(true);
    if (nextError || !onSubmit) {
      return;
    }

    const trimmed = email.trim();
    setSubmitError(null);
    setPending(true);
    try {
      await onSubmit(trimmed);
      setSentTo(trimmed);
    } catch (caught) {
      setSubmitError(describeRequestError(caught));
    } finally {
      setPending(false);
    }
  }, [email, onSubmit]);

  // Returns to the form with the address still in the field, for the user who
  // reaches the settled state and realises they typed it wrong — the only
  // recovery available, since nothing here can tell them the address was
  // wrong in the first place.
  const editAddress = useCallback(() => {
    setSentTo(null);
    setSubmitted(false);
    setError(undefined);
  }, []);

  const announcement = sentTo
    ? `Check your email. If ${sentTo} has an account, we’ve sent it a link to reset the password.`
    : '';

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenScrollView
          bodyStyle={[
            styles.scrollContent,
            {
              paddingVertical: spacing.xl,
              paddingHorizontal: gutter + Math.max(insets.left, insets.right),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Surface elevation={1} style={styles.card}>
            <View style={styles.brand}>
              <BrandMark />
            </View>

            <LiveAnnouncement testID="forgot-password-announcer" message={announcement} />

            {sentTo ? (
              <AuthOutcome
                icon="email-fast-outline"
                tone="success"
                title="Check your email"
                body={`If ${sentTo} has an account, we’ve sent it a link to reset the password. It can take a minute to arrive — check your spam folder too.`}
                actions={[
                  { label: 'Back to log in', onPress: () => router.replace('/login') },
                  { label: 'Use a different address', onPress: editAddress, mode: 'text' },
                ]}
              />
            ) : (
              <>
                <Text
                  {...heading(1)}
                  variant="headlineMedium"
                  style={[styles.title, { color: theme.colors.onSurface }]}
                >
                  Reset your password
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
                >
                  Enter the email address on your account and we’ll send you a link to set a
                  new password.
                </Text>

                <View>
                  <TextInput
                    mode="outlined"
                    label="Email"
                    value={email}
                    onChangeText={(next) => {
                      setEmail(next);
                      setSubmitError(null);
                      if (error) setError(undefined);
                    }}
                    onSubmitEditing={handleSubmit}
                    error={liveError != null}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="go"
                    accessibilityLabel="Email"
                  />
                  <HelperText type="error" visible={liveError != null}>
                    {liveError ?? ' '}
                  </HelperText>
                </View>

                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  loading={pending}
                  disabled={pending}
                  style={styles.submit}
                  contentStyle={styles.submitContent}
                  accessibilityRole="button"
                  accessibilityLabel="Send reset link"
                >
                  {pending ? 'Sending…' : 'Send reset link'}
                </Button>
                <HelperText
                  type="error"
                  visible={submitError != null}
                  accessibilityLiveRegion="polite"
                >
                  {submitError ?? ' '}
                </HelperText>
              </>
            )}
          </Surface>

          {!sentTo && (
            <View style={styles.footer}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Remembered it?
              </Text>
              <Button
                mode="text"
                compact
                onPress={() => router.replace('/login')}
                accessibilityRole="button"
                accessibilityLabel="Log in"
              >
                Log in
              </Button>
            </View>
          )}
        </ScreenScrollView>
      </KeyboardAvoidingView>
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
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  submit: {
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  submitContent: {
    height: layout.minTouchTarget,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.lg,
  },
});
