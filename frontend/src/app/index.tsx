import { Stack } from 'expo-router';

import { LandingScreen } from '@/features/marketing/LandingScreen';

export default function Index() {
  return (
    <>
      <Stack.Screen options={{ title: 'Pantrycast' }} />
      <LandingScreen />
    </>
  );
}
