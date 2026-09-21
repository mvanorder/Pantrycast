import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../test-utils/render';
import { ApiError } from '../../api/client';
import { confirmPasswordReset } from '../../features/auth/api';

import ResetPassword from '../reset-password';

const mockReplace = jest.fn();
let mockParams: { token?: string } = { token: 'a-token' };

// `Stack.Screen` only sets navigator options and needs a route context we do
// not mount here; `useLocalSearchParams` needs the same context, so both are
// stubbed. `useRouter` is stubbed because `ResetPasswordScreen` reads it.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

// The route delegates the actual confirmation to the auth API; stub it so the
// test stays on the route's own job (read the query param -> call the API).
jest.mock('../../features/auth/api', () => ({ confirmPasswordReset: jest.fn() }));

const mockConfirmPasswordReset = confirmPasswordReset as jest.MockedFunction<
  typeof confirmPasswordReset
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

async function fillAndSubmit() {
  await type('New password', 'new-passphrase');
  await type('Confirm new password', 'new-passphrase');
  await press('Save new password');
}

beforeEach(() => {
  mockParams = { token: 'a-token' };
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Reset password route', () => {
  it('sends the token query param and the new password to POST /auth/password-reset/confirm', async () => {
    mockConfirmPasswordReset.mockResolvedValue(undefined);

    await renderWithProviders(<ResetPassword />);
    expect(await screen.findByText('Set a new password')).toBeOnTheScreen();
    await fillAndSubmit();

    await waitFor(() =>
      expect(mockConfirmPasswordReset).toHaveBeenCalledWith('a-token', 'new-passphrase'),
    );
    expect(await screen.findByText('Password updated')).toBeOnTheScreen();
  });

  it('takes the first value when the link repeats the token param', async () => {
    mockParams = { token: ['a-token', 'another-token'] as unknown as string };
    mockConfirmPasswordReset.mockResolvedValue(undefined);

    await renderWithProviders(<ResetPassword />);
    await fillAndSubmit();

    await waitFor(() =>
      expect(mockConfirmPasswordReset).toHaveBeenCalledWith('a-token', 'new-passphrase'),
    );
  });

  it('shows the missing-token error when the link has no token', async () => {
    mockParams = {};

    await renderWithProviders(<ResetPassword />);

    expect(
      await screen.findByText(
        'This link is missing its reset token — or the password was already reset and this page was just reloaded.',
      ),
    ).toBeOnTheScreen();
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it('ends the form on a spent token and offers a fresh link', async () => {
    mockConfirmPasswordReset.mockRejectedValue(
      new ApiError(422, 'Verification token has expired or already been used'),
    );

    await renderWithProviders(<ResetPassword />);
    await fillAndSubmit();

    expect(
      await screen.findByText(
        'This reset link has expired or has already been used. Request a new one to try again.',
      ),
    ).toBeOnTheScreen();

    await press('Request a new link');
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
  });
});
