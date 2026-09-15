import { useCallback, useMemo, useRef, useState } from 'react';
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

import type { NewAccountDetails } from './AuthContext';

const GENERIC_SUBMIT_ERROR = 'Something went wrong creating your account. Please try again.';

// Matches the backend's RegisterRequest.password (backend/app/schemas.py):
// Field(min_length=8, max_length=128).
const MIN_PASSWORD_LENGTH = 8;

type SignUpScreenProps = {
  /**
   * Called with the validated details when the form is submitted. May be
   * async; the screen shows a busy button until it settles.
   *
   * Reject to surface an error under the button — an {@link ApiError}'s
   * message is shown verbatim (the API's 400 "already registered" copy is
   * already user-facing), anything else falls back to a generic message.
   * Resolve on success; the caller is responsible for navigating away.
   *
   * The `/signup` route wires this to `AuthContext.signUp` (register + sign
   * in); left undefined (isolated tests, previews) a valid submit is a no-op.
   */
  onSubmit?: (details: NewAccountDetails) => void | Promise<void>;
};

// Deliberately loose: a sign-up form should reject "obviously not an email"
// (no `@`, no domain) client-side, but the server is the authority on whether
// an address is valid or already taken. A stricter regex here only risks
// turning away valid addresses the backend would accept.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { email?: string; password?: string; confirmPassword?: string };

function validate(email: string, password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};

  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0) {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_RE.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (password.length === 0) {
    errors.password = 'Enter a password.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length >= MIN_PASSWORD_LENGTH && confirmPassword !== password) {
    errors.confirmPassword = "Passwords don't match.";
  }

  return errors;
}

/**
 * Account-creation screen (route: `/signup`) — the "Get started" destination
 * from the header and landing page CTAs.
 *
 * Client-side validation only gates the shape of the input (email format,
 * password length, confirmation match); the server is still the authority on
 * whether the email is already registered ({@link SignUpScreenProps.onSubmit}
 * surfaces that as a 400 from `POST /auth/register`). Renders as a centred
 * card on wide viewports and a full-width column on phones, and holds the
 * fields clear of the on-screen keyboard on native — same layout as
 * {@link LoginScreen}.
 */
export function SignUpScreen({ onSubmit }: SignUpScreenProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();

  const passwordRef = useRef<RNTextInput>(null);
  const confirmPasswordRef = useRef<RNTextInput>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // After the first submit, keep the messages honest as the user fixes each
  // field rather than leaving a stale error under a now-valid input.
  const liveErrors = useMemo(
    () => (submitted ? validate(email, password, confirmPassword) : errors),
    [submitted, email, password, confirmPassword, errors],
  );

  const handleSubmit = useCallback(async () => {
    const nextErrors = validate(email, password, confirmPassword);
    setErrors(nextErrors);
    setSubmitted(true);
    if (Object.keys(nextErrors).length > 0 || !onSubmit) {
      return;
    }

    setSubmitError(null);
    setPending(true);
    try {
      const trimmedName = displayName.trim();
      await onSubmit({
        email: email.trim(),
        password,
        ...(trimmedName ? { displayName: trimmedName } : {}),
      });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : GENERIC_SUBMIT_ERROR);
    } finally {
      setPending(false);
    }
  }, [email, password, confirmPassword, displayName, onSubmit]);

  const router = useRouter();

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

            <Text
              {...heading(1)}
              variant="headlineMedium"
              style={[styles.title, { color: theme.colors.onSurface }]}
            >
              Create your account
            </Text>
            <Text
              variant="bodyMedium"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Start tracking your shopping trends in minutes.
            </Text>

            <TextInput
              mode="outlined"
              label="Name (optional)"
              value={displayName}
              onChangeText={setDisplayName}
              onSubmitEditing={() => passwordRef.current?.focus()}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              accessibilityLabel="Name"
              style={styles.nameInput}
            />

            <View>
              <TextInput
                mode="outlined"
                label="Email"
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  setSubmitError(null);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                onSubmitEditing={() => passwordRef.current?.focus()}
                error={liveErrors.email != null}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                accessibilityLabel="Email"
              />
              <HelperText type="error" visible={liveErrors.email != null}>
                {liveErrors.email ?? ' '}
              </HelperText>
            </View>

            <View>
              <TextInput
                ref={passwordRef}
                mode="outlined"
                label="Password"
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
                accessibilityLabel="Password"
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
                label="Confirm password"
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
                accessibilityLabel="Confirm password"
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
              accessibilityLabel="Create account"
            >
              {pending ? 'Creating account…' : 'Create account'}
            </Button>
            <HelperText
              type="error"
              visible={submitError != null}
              accessibilityLiveRegion="polite"
            >
              {submitError ?? ' '}
            </HelperText>
          </Surface>

          <View style={styles.footer}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Already have an account?
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
  // The other fields each have a HelperText beneath them for validation
  // messages, which supplies their bottom spacing; this field has none, so it
  // needs its own margin to keep the same rhythm between fields.
  nameInput: {
    marginBottom: spacing.sm,
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
