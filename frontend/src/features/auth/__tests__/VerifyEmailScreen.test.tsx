import { act, renderWithProviders, screen, waitFor, fireEvent } from '../../../../test-utils/render';
import { ApiError } from '../../../api/client';
import { VerifyEmailScreen } from '../VerifyEmailScreen';

const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockRouterReplace }),
}));

let mockAuthStatus: 'loading' | 'authenticated' | 'unauthenticated' = 'unauthenticated';

// The screen reads `useAuth()` only to pick the "continue" destination; drive
// it from the test. The passthrough `AuthProvider` keeps `renderWithProviders`
// working.
jest.mock('../AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: mockAuthStatus, user: null, signIn: jest.fn(), signOut: jest.fn() }),
}));

beforeEach(() => {
  mockAuthStatus = 'unauthenticated';
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('VerifyEmailScreen', () => {
  it('shows a missing-token error and never calls onVerify when the link has no token', async () => {
    const onVerify = jest.fn();
    await renderWithProviders(<VerifyEmailScreen onVerify={onVerify} />);

    expect(
      await screen.findByText(
        "This verification link is missing its token. Check that you copied the full link from your email.",
      ),
    ).toBeOnTheScreen();
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('shows a spinner while verification is in flight', async () => {
    let release!: () => void;
    const onVerify = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    expect(screen.getByTestId('verify-email-spinner')).toBeOnTheScreen();
    expect(screen.getByText('Confirming your email…')).toBeOnTheScreen();
    expect(onVerify).toHaveBeenCalledWith('a-token');

    await act(async () => {
      release();
    });
  });

  it('shows success and a working continue action once verification resolves', async () => {
    const onVerify = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    expect(await screen.findByText('Email confirmed')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Log in'));
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('sends an already-signed-in visitor to the dashboard on success', async () => {
    mockAuthStatus = 'authenticated';
    const onVerify = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    expect(await screen.findByLabelText('Go to dashboard')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Go to dashboard'));
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('surfaces the API message when the token is expired or already used', async () => {
    const onVerify = jest.fn().mockRejectedValue(new ApiError(422, 'This link has expired.'));
    await renderWithProviders(<VerifyEmailScreen token="stale-token" onVerify={onVerify} />);

    await waitFor(() => expect(screen.getByText('This link has expired.')).toBeOnTheScreen());
  });

  it('falls back to a generic message for a non-API failure', async () => {
    const onVerify = jest.fn().mockRejectedValue(new Error('boom'));
    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong confirming your email. Please try again.'),
      ).toBeOnTheScreen(),
    );
  });

  it('does nothing on mount when a token is present but no handler is wired', async () => {
    await renderWithProviders(<VerifyEmailScreen token="a-token" />);

    expect(screen.getByText('Confirming your email…')).toBeOnTheScreen();
  });

  it('disables the continue action while the session is still being restored', async () => {
    mockAuthStatus = 'loading';
    const onVerify = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    expect(await screen.findByLabelText('Log in')).toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Log in'));
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
