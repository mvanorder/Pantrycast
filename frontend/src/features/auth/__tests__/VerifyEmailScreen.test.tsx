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
        'This link is missing its verification token — or your email is already confirmed and this page was just reloaded.',
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

  it('fills the always-mounted live region once settled, rather than mounting it fresh', async () => {
    let release!: () => void;
    const onVerify = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    // Present and empty from the first render — `accessibilityLiveRegion`
    // only reliably announces a change to an already-present region, not one
    // that appears at the same moment as its content.
    expect(screen.getByTestId('verify-email-announcer').props.children).toBe('');

    await act(async () => {
      release();
    });

    expect(screen.getByTestId('verify-email-announcer').props.children).toBe(
      'Email confirmed. Your email address is verified.',
    );
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

  it('translates the bare 422 detail into user-facing copy, with no retry action', async () => {
    // The real backend string (backend/app/routers/auth.py) — bare developer
    // copy, not something to show verbatim.
    const onVerify = jest
      .fn()
      .mockRejectedValue(new ApiError(422, 'Verification token has expired or already been used'));
    await renderWithProviders(<VerifyEmailScreen token="stale-token" onVerify={onVerify} />);

    expect(
      await screen.findByText('This verification link has expired or has already been used.'),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Try again')).not.toBeOnTheScreen();
  });

  it('translates the bare 400 detail into user-facing copy, with no retry action', async () => {
    const onVerify = jest.fn().mockRejectedValue(new ApiError(400, 'Invalid verification token'));
    await renderWithProviders(<VerifyEmailScreen token="mangled-token" onVerify={onVerify} />);

    expect(
      await screen.findByText(
        "This verification link isn't valid. Check that you copied the full link from your email, then try again.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Try again')).not.toBeOnTheScreen();
  });

  it('offers a working retry when the request never reached the server', async () => {
    let releaseRetry!: () => void;
    const onVerify = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server. Check your connection and try again."))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseRetry = resolve;
          }),
      );
    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    await waitFor(() => expect(screen.getByLabelText('Try again')).toBeOnTheScreen());
    expect(onVerify).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Try again'));
    });

    // Back to `verifying` immediately, before the retried request settles.
    expect(screen.getByText('Confirming your email…')).toBeOnTheScreen();
    expect(onVerify).toHaveBeenLastCalledWith('a-token');
    expect(onVerify).toHaveBeenCalledTimes(2);

    await act(async () => {
      releaseRetry();
    });
    expect(screen.getByText('Email confirmed')).toBeOnTheScreen();
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
