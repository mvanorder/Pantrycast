import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../test-utils/render';
import { ApiError } from '../../api/client';
import { requestPasswordReset } from '../../features/auth/api';

import ForgotPassword from '../forgot-password';

const mockReplace = jest.fn();

// `Stack.Screen` only sets navigator options and needs a route context we do
// not mount here; `useRouter` is stubbed because the screen reads it.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

// The route delegates the actual request to the auth API; stub it so the test
// stays on the route's own job (validate -> request -> settled state).
jest.mock('../../features/auth/api', () => ({ requestPasswordReset: jest.fn() }));

const mockRequestPasswordReset = requestPasswordReset as jest.MockedFunction<
  typeof requestPasswordReset
>;

async function type(label: string, value: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), value);
  });
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('Forgot password route', () => {
  it('renders the request form at /forgot-password', async () => {
    await renderWithProviders(<ForgotPassword />);

    expect(await screen.findByText('Reset your password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
  });

  it('requests a reset link via POST /auth/password-reset and stays put', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);

    await renderWithProviders(<ForgotPassword />);
    await type('Email', '  shopper@example.com  ');
    await press('Send reset link');

    await waitFor(() =>
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('shopper@example.com'),
    );
    // No navigation on success: the answer says nothing about whether an
    // email went out, so the screen settles in place instead.
    expect(await screen.findByText('Check your email')).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('surfaces a failed request without claiming the link was sent', async () => {
    mockRequestPasswordReset.mockRejectedValue(
      new ApiError(0, "Couldn't reach the server. Check your connection and try again."),
    );

    await renderWithProviders(<ForgotPassword />);
    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(
      await screen.findByText("Couldn't reach the server. Check your connection and try again."),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Check your email')).not.toBeOnTheScreen();
  });
});
