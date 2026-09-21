import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type TextInput as RNTextInput,
} from 'react-native';
import { Button, HelperText, Surface, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { BrandMark } from '@/components/BrandMark';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { heading, layout, radius, spacing, useAppTheme, useResponsive } from '@/theme';

import { AuthOutcome, LiveAnnouncement } from './AuthOutcome';

// Matches the backend's PasswordResetConfirmRequest.new_password
// (backend/app/schemas.py): Field(min_length=8, max_length=128), the same
// bound registration uses.
const MIN_PASSWORD_LENGTH = 8;
// Unlike the sign-up form, this screen enforces the *upper* bound too. The
// API answers 422 both for an over-long password and for a spent or expired
// token, and this screen turns a 422 into "that link has expired" — so
// without this check a 129-character password would be reported as a dead
// link and send the user off to request another one that fails identically.
const MAX_PASSWORD_LENGTH = 128;

const GENERIC_SUBMIT_ERROR = 'Something went wrong setting your password. Please try again.';
// Reached with no token at all. Worded to cover the second, likelier cause
// besides a mangled link: the token is stripped from the URL as soon as it's
// read (see the effect below), so reloading this page after a successful
// reset lands here too.
const MISSING_TOKEN_ERROR =
  'This link is missing its reset token — or the password was already reset and this page was just reloaded.';
// `POST /auth/password-reset/confirm`'s 400 detail ("Invalid verification
// token", backend/app/routers/auth.py) is a bare developer string, not copy
// to show verbatim. This is the path a link an email client wrapped or
// truncated lands on, so it's the one that most needs the hint.
const INVALID_TOKEN_ERROR =
  "This reset link isn't valid. Check that you copied the full link from your email, or request a new one.";
// The 422 detail ("Verification token has expired or already been used") is
// accurate but reads like a log line. One other request shape reaches 422:
// a token over the schema's 512-character bound, which is really "invalid"
// rather than "expired". Not worth a branch — no email client produces a
// token that long, and both messages end at the same "request a new link".
const EXPIRED_TOKEN_ERROR =
  'This reset link has expired or has already been used. Request a new one to try again.';

/** The two statuses that mean this link is finished, whatever the user types. */
const DEAD_LINK_STATUSES = [400, 422] as const;
type DeadLinkStatus = (typeof DEAD_LINK_STATUSES)[number];

function isDeadLinkStatus(status: number): status is DeadLinkStatus {
  return (DEAD_LINK_STATUSES as readonly number[]).includes(status);
}

/**
 * Turns a spent-link failure into copy for the settled `invalid` state.
 *
 * Narrowed to the two statuses that end the flow rather than taking the raw
 * error: a 400 and a 422 both mean the token can never be spent, which is why
 * they replace the form instead of annotating it. Everything else keeps the
 * user on the form and goes through {@link describeRetryableError}, so there
 * is no fallback branch to write here.
 */
function describeDeadLink(status: DeadLinkStatus): string {
  return status === 400 ? INVALID_TOKEN_ERROR : EXPIRED_TOKEN_ERROR;
}

/**
 * Turns a failure the user can retry in place into copy for the error line
 * under the button. Only a transport failure (`status === 0`) shows the API
 * client's own message verbatim — that copy is already user-facing.
 */
function describeRetryableError(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) {
    return error.message;
  }
  return GENERIC_SUBMIT_ERROR;
}

type FieldErrors = { password?: string; confirmPassword?: string };

function validate(password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};

  if (password.length === 0) {
    errors.password = 'Enter a new password.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (password.length >= MIN_PASSWORD_LENGTH && confirmPassword !== password) {
    errors.confirmPassword = "Passwords don't match.";
  }

  return errors;
}

type Status = 'form' | 'success' | 'invalid';

type ResetPasswordScreenProps = {
  /** The `token` query param off the emailed link, or `undefined`/empty if missing. */
  token?: string;
  /**
   * Redeems `token` with the new password — the `/reset-password` route wires
   * this to `POST /auth/password-reset/confirm`. Called on submit, never on
   * mount: unlike email verification, this token is only spent once the user
   * has typed something.
   *
   * Resolve on success; the account is *not* signed in afterwards (the API
   * returns no token pair and revokes every refresh token), so the screen
   * sends the user to `/login` rather than the dashboard. Reject to fail: a
   * 400 or 422 ends the form with the link declared dead (see
   * {@link describeDeadLink}), anything else — notably a transport failure
   * — leaves the form intact with an error under the button, so a retry
   * doesn't cost the user their typing.
   *
   * Left undefined (isolated tests, previews) a valid submit is a no-op.
   */
  onSubmit?: (token: string, newPassword: string) => void | Promise<void>;
};

/**
 * Lands here from the "Reset your password" link (`app/mailer/__init__.py`'s
 * `render_password_reset_email` on the backend); step two of the flow that
 * starts on {@link ForgotPasswordScreen}.
 *
 * Unlike {@link VerifyEmailScreen}, nothing is redeemed on mount — the token
 * is only spent when the form is submitted — which makes stripping it from
 * the URL *more* important here, not less: it stays live for as long as this
 * screen is open. The `/reset-password` route mounts this keyed on `token`,
 * so a second emailed link opened into the same tab remounts fresh instead of
 * layering a new attempt under the previous one's settled copy.
 *
 * Succeeding does not start a session, so the only way on from here is
 * `/login` with the new password.
 */
export function ResetPasswordScreen({ token, onSubmit }: ResetPasswordScreenProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { gutter } = useResponsive();

  const confirmPasswordRef = useRef<RNTextInput>(null);

  // Always starts on the form, even though `token` is known at first render.
  // The static web export prerenders this screen with no query params, so an
  // initial state derived from `token` would bake the missing-token error
  // into that build's first paint and show it to everyone arriving with a
  // perfectly good link. Same hazard {@link VerifyEmailScreen} avoids by
  // always starting `verifying`; the prerender-safe default here is the form,
  // which is also the right answer for every visitor who does have a token —
  // only a genuinely tokenless visitor sees it swapped out, below.
  const [status, setStatus] = useState<Status>('form');
  const [outcomeMessage, setOutcomeMessage] = useState(MISSING_TOKEN_ERROR);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (token && Platform.OS === 'web' && typeof window !== 'undefined') {
      // Strip the token from the URL before anything can leak it: it would
      // otherwise ride along as the `Referer` on the POST below (same-origin,
      // behind the proxy) and linger in browser history on a shared machine
      // — and this token is still spendable, so that lingering copy is a
      // live credential, not a spent one. This does *not* keep it out of
      // nginx's access log: the initial `GET /reset-password?token=…` for
      // this page was already logged before any of this JS ran.
      //
      // Passes the *existing* `history.state` through rather than `null`:
      // expo-router's web history layer stores its own `{ id }` bookkeeping
      // there (`expo-router/build/fork/createMemoryHistory.js`), and
      // clobbering it would corrupt back/forward navigation on this entry.
      //
      // Submitting reads `token` from this component's props, not from the
      // URL, so removing it here costs the form nothing. The same sharp edge
      // VerifyEmailScreen documents applies: a navigation action elsewhere
      // while this screen is mounted could have expo-router's own linking
      // layer re-derive the URL from the navigation state — which still
      // carries `token` — and put it back.
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }

    if (token) {
      return undefined;
    }

    // Settled in a microtask rather than synchronously here, the same way
    // VerifyEmailScreen settles a missing token: a synchronous setState in an
    // effect body is a cascading render (and this project's react-hooks lint
    // rejects it outright).
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }
      setOutcomeMessage(MISSING_TOKEN_ERROR);
      setStatus('invalid');
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // After the first submit, keep the messages honest as the user fixes each
  // field rather than leaving a stale error under a now-valid input.
  const liveErrors = useMemo(
    () => (submitted ? validate(password, confirmPassword) : errors),
    [submitted, password, confirmPassword, errors],
  );

  const handleSubmit = useCallback(async () => {
    const nextErrors = validate(password, confirmPassword);
    setErrors(nextErrors);
    setSubmitted(true);
    if (Object.keys(nextErrors).length > 0 || !token || !onSubmit) {
      return;
    }

    setSubmitError(null);
    setPending(true);
    try {
      await onSubmit(token, password);
      setStatus('success');
    } catch (error) {
      // A 400 or 422 means the link itself is finished — keeping the form up
      // would only invite the user to retype a password into a token that
      // can never be spent — so those end the screen. Everything else
      // (transport failure, 5xx) is worth another press of the same button,
      // with what they typed still in the fields.
      if (error instanceof ApiError && isDeadLinkStatus(error.status)) {
        setOutcomeMessage(describeDeadLink(error.status));
        setStatus('invalid');
      } else {
        setSubmitError(describeRetryableError(error));
      }
    } finally {
      setPending(false);
    }
  }, [token, password, confirmPassword, onSubmit]);

  const announcement =
    status === 'success'
      ? 'Password updated. Log in with your new password.'
      : status === 'invalid'
        ? `We couldn’t reset that password. ${outcomeMessage}`
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

            <LiveAnnouncement testID="reset-password-announcer" message={announcement} />

            {status === 'success' && (
              <AuthOutcome
                icon="check-circle-outline"
                tone="success"
                title="Password updated"
                body="Your password has been changed and you’ve been signed out everywhere. Log in with the new one to continue."
                actions={[{ label: 'Log in', onPress: () => router.replace('/login') }]}
              />
            )}

            {status === 'invalid' && (
              <AuthOutcome
                icon="alert-circle-outline"
                tone="error"
                title="We couldn’t reset that password"
                body={outcomeMessage}
                actions={[
                  {
                    label: 'Request a new link',
                    onPress: () => router.replace('/forgot-password'),
                  },
                  { label: 'Log in', onPress: () => router.replace('/login'), mode: 'outlined' },
                ]}
              />
            )}

            {status === 'form' && (
              <>
                <Text
                  {...heading(1)}
                  variant="headlineMedium"
                  style={[styles.title, { color: theme.colors.onSurface }]}
                >
                  Set a new password
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
                >
                  Choose a new password for your account. You’ll be signed out on every device
                  and can log back in with it.
                </Text>

                <View>
                  <TextInput
                    mode="outlined"
                    label="New password"
                    value={password}
                    onChangeText={(next) => {
                      setPassword(next);
                      setSubmitError(null);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                      if (errors.confirmPassword) {
                        setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      }
                    }}
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                    error={liveErrors.password != null}
                    secureTextEntry={secure}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    accessibilityLabel="New password"
                    right={
                      <TextInput.Icon
                        icon={secure ? 'eye' : 'eye-off'}
                        onPress={() => setSecure((prev) => !prev)}
                        accessibilityLabel={secure ? 'Show password' : 'Hide password'}
                        forceTextInputFocus={false}
                      />
                    }
                  />
                  <HelperText type="error" visible={liveErrors.password != null}>
                    {liveErrors.password ?? ' '}
                  </HelperText>
                </View>

                <View>
                  <TextInput
                    ref={confirmPasswordRef}
                    mode="outlined"
                    label="Confirm new password"
                    value={confirmPassword}
                    onChangeText={(next) => {
                      setConfirmPassword(next);
                      setSubmitError(null);
                      if (errors.confirmPassword) {
                        setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      }
                    }}
                    onSubmitEditing={handleSubmit}
                    error={liveErrors.confirmPassword != null}
                    secureTextEntry={secure}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    accessibilityLabel="Confirm new password"
                  />
                  <HelperText type="error" visible={liveErrors.confirmPassword != null}>
                    {liveErrors.confirmPassword ?? ' '}
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
                  accessibilityLabel="Save new password"
                >
                  {pending ? 'Saving…' : 'Save new password'}
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
});
