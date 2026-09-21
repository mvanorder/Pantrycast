import { useCallback } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { confirmPasswordReset } from '@/features/auth/api';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';

export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const handleSubmit = useCallback(
    (tokenToRedeem: string, newPassword: string) =>
      confirmPasswordReset(tokenToRedeem, newPassword),
    [],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Reset password' }} />
      {/* Keyed on `token`: a second emailed link opened into the same tab
          should remount fresh rather than reuse the previous attempt's
          settled state — see ResetPasswordScreen's docstring. */}
      <ResetPasswordScreen key={token} token={token} onSubmit={handleSubmit} />
    </>
  );
}
