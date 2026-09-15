import { Text } from 'react-native';

import { renderWithProviders, screen } from '../../../test-utils/render';
import { AppShell } from '../AppShell';

jest.mock('../../features/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'unauthenticated', user: null, signOut: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
}));

describe('AppShell', () => {
  it('frames its children with the global header', async () => {
    await renderWithProviders(
      <AppShell>
        <Text>route content</Text>
      </AppShell>,
    );

    expect(screen.getByText('route content')).toBeOnTheScreen();
    expect(screen.getByLabelText('Log in to Pantrycast')).toBeOnTheScreen();
    expect(screen.getByLabelText('Get started with Pantrycast')).toBeOnTheScreen();
  });
});
