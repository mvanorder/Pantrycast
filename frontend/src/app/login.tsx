import { useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/AuthContext';
import { LoginScreen, type LoginCredentials } from '@/features/auth/LoginScreen';

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();

  const handleSubmit = useCallback(
    async (credentials: LoginCredentials) => {
      await signIn(credentials);
      router.replace('/dashboard');
    },
    [signIn, router],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Log in' }} />
      <LoginScreen onSubmit={handleSubmit} />
    </>
  );
}
