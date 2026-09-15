import { useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';

import { useAuth, type NewAccountDetails } from '@/features/auth/AuthContext';
import { SignUpScreen } from '@/features/auth/SignUpScreen';

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();

  const handleSubmit = useCallback(
    async (details: NewAccountDetails) => {
      await signUp(details);
      router.replace('/dashboard');
    },
    [signUp, router],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Sign up' }} />
      <SignUpScreen onSubmit={handleSubmit} />
    </>
  );
}
