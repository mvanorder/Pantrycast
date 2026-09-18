import { useCallback } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { verifyEmail } from '@/features/auth/api';
import { VerifyEmailScreen } from '@/features/auth/VerifyEmailScreen';

export default function VerifyEmail() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const handleVerify = useCallback((tokenToRedeem: string) => verifyEmail(tokenToRedeem), []);

  return (
    <>
      <Stack.Screen options={{ title: 'Verify email' }} />
      {/* Keyed on `token`: a second emailed link opened into the same tab
          should remount fresh rather than reuse the previous attempt's
          settled state — see VerifyEmailScreen's docstring. */}
      <VerifyEmailScreen key={token} token={token} onVerify={handleVerify} />
    </>
  );
}
