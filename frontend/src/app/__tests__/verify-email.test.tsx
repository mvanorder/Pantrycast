import { renderWithProviders, screen, waitFor } from '../../../test-utils/render';
import { verifyEmail } from '../../features/auth/api';

import VerifyEmail from '../verify-email';

let mockParams: { token?: string } = { token: 'a-token' };

// `Stack.Screen` only sets navigator options and needs a route context we do
// not mount here; `useLocalSearchParams` needs the same context, so both are
// stubbed. `useRouter` is stubbed because `VerifyEmailScreen` reads it.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// The route delegates the actual redemption to the auth API; stub it so the
// test stays on the route's own job (read the query param -> call the API).
jest.mock('../../features/auth/api', () => ({ verifyEmail: jest.fn() }));

// The passthrough `AuthProvider` keeps `renderWithProviders` working; the
// screen only reads `status` off it to pick a "continue" destination, which
// isn't this test's concern.
jest.mock('../../features/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'unauthenticated', user: null, signIn: jest.fn(), signOut: jest.fn() }),
}));

const mockVerifyEmail = verifyEmail as jest.MockedFunction<typeof verifyEmail>;

beforeEach(() => {
  mockParams = { token: 'a-token' };
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Verify email route', () => {
  it('redeems the token query param via POST /auth/verify-email', async () => {
    mockVerifyEmail.mockResolvedValue(undefined);

    await renderWithProviders(<VerifyEmail />);

    await waitFor(() => expect(mockVerifyEmail).toHaveBeenCalledWith('a-token'));
    expect(await screen.findByText('Email confirmed')).toBeOnTheScreen();
  });

  it('shows the missing-token error when the link has no token', async () => {
    mockParams = {};

    await renderWithProviders(<VerifyEmail />);

    expect(
      await screen.findByText(
        'This link is missing its verification token — or your email is already confirmed and this page was just reloaded.',
      ),
    ).toBeOnTheScreen();
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });
});
