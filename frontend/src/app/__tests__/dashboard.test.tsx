import { renderWithProviders, screen } from '../../../test-utils/render';

import DashboardRoute from '../dashboard';

let mockStatus: 'loading' | 'authenticated' | 'unauthenticated';

// The route reads `useAuth()` to gate itself; drive the status from the test.
// The passthrough `AuthProvider` keeps `renderWithProviders` working.
jest.mock('../../features/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: mockStatus, user: null, signIn: jest.fn(), signOut: jest.fn() }),
}));

// `useLocalSearchParams` needs a route context we do not mount here; `Redirect`
// is stubbed to a marker so the test can assert where it points.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  mockStatus = 'authenticated';
});

describe('Dashboard route', () => {
  it('renders the loaded dashboard by default for a signed-in user', async () => {
    await renderWithProviders(<DashboardRoute />);

    expect(screen.getByText('Here’s what’s trending in your home')).toBeOnTheScreen();
  });

  it('redirects a signed-out visitor to the landing page', async () => {
    mockStatus = 'unauthenticated';

    await renderWithProviders(<DashboardRoute />);

    expect(screen.getByText('redirect:/')).toBeOnTheScreen();
    expect(screen.queryByText('Here’s what’s trending in your home')).not.toBeOnTheScreen();
  });

  it('renders nothing while the session is still being restored', async () => {
    mockStatus = 'loading';

    await renderWithProviders(<DashboardRoute />);

    expect(screen.queryByText('redirect:/')).not.toBeOnTheScreen();
    expect(screen.queryByText('Here’s what’s trending in your home')).not.toBeOnTheScreen();
  });
});
