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
      <VerifyEmailScreen token={token} onVerify={handleVerify} />
    </>
  );
}
