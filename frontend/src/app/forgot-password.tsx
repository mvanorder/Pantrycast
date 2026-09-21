import { useCallback } from 'react';
import { Stack } from 'expo-router';

import { requestPasswordReset } from '@/features/auth/api';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';

export default function ForgotPassword() {
  // Nothing to navigate to on success: the screen settles into its own
  // "check your email" state, because the response says nothing about
  // whether an email was actually sent.
  const handleSubmit = useCallback((email: string) => requestPasswordReset(email), []);

  return (
    <>
      <Stack.Screen options={{ title: 'Forgot password' }} />
      <ForgotPasswordScreen onSubmit={handleSubmit} />
    </>
  );
}
