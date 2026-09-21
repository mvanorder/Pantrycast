import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../../test-utils/render';
import { ApiError } from '../../../api/client';
import { ForgotPasswordScreen } from '../ForgotPasswordScreen';

const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// This project's RNTL renders on a concurrent root, so firing events in a
// synchronous run overlaps act() scopes and wedges the renderer for the rest
// of the file. Await each interaction before the next.
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

describe('ForgotPasswordScreen', () => {
  it('renders the request form', async () => {
    await renderWithProviders(<ForgotPasswordScreen />);

    expect(await screen.findByText('Reset your password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Send reset link')).toBeOnTheScreen();
  });

  it('requires an email address and does not submit without one', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await press('Send reset link');

    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'not-an-email');
    await press('Send reset link');

    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears a field error once the user corrects it', async () => {
    await renderWithProviders(<ForgotPasswordScreen onSubmit={jest.fn()} />);

    await press('Send reset link');
    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();

    await type('Email', 'shopper@example.com');

    await waitFor(() =>
      expect(screen.queryByText('Enter your email address.')).not.toBeOnTheScreen(),
    );
  });

  it('submits the trimmed address', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', '  shopper@example.com  ');
    await press('Send reset link');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('shopper@example.com'));
  });

  it('submits when the email field fires its "go" key', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await act(async () => {
      fireEvent(screen.getByLabelText('Email'), 'submitEditing');
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('shopper@example.com'));
  });

  it('confirms only conditionally, never that the address has an account', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(await screen.findByText('Check your email')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'If shopper@example.com has an account, we’ve sent it a link to reset the password. It can take a minute to arrive — check your spam folder too.',
      ),
    ).toBeOnTheScreen();
    // The form is gone, so there is nothing left that could be read as a
    // second, differently-worded outcome.
    expect(screen.queryByLabelText('Send reset link')).not.toBeOnTheScreen();
  });

  it('shows the identical settled copy for an address with no account', async () => {
    // The API answers 204 for a non-match exactly as it does for a match, so
    // this is the same resolved promise — and must produce the same screen.
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'nobody@example.com');
    await press('Send reset link');

    expect(
      await screen.findByText(
        'If nobody@example.com has an account, we’ve sent it a link to reset the password. It can take a minute to arrive — check your spam folder too.',
      ),
    ).toBeOnTheScreen();
  });

  it('fills the always-mounted live region once the request settles', async () => {
    let release!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    expect(screen.getByTestId('forgot-password-announcer').props.children).toBe('');

    await type('Email', 'shopper@example.com');
    await press('Send reset link');
    await act(async () => {
      release();
    });

    expect(screen.getByTestId('forgot-password-announcer').props.children).toBe(
      'Check your email. If shopper@example.com has an account, we’ve sent it a link to reset the password.',
    );
  });

  it('sends the user back to login from the settled state', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');
    expect(await screen.findByLabelText('Back to log in')).toBeOnTheScreen();

    await press('Back to log in');

    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('lets the user go back and fix a mistyped address', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@exmaple.com');
    await press('Send reset link');
    expect(await screen.findByLabelText('Use a different address')).toBeOnTheScreen();

    await press('Use a different address');

    expect(await screen.findByLabelText('Email')).toBeOnTheScreen();
    // The typo is still there to correct rather than retyped from scratch.
    expect(screen.getByLabelText('Email').props.value).toBe('shopper@exmaple.com');

    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(onSubmit).toHaveBeenLastCalledWith('shopper@example.com');
  });

  it('surfaces a transport failure verbatim and keeps the form up', async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new ApiError(0, "Couldn't reach the server. Check your connection and try again."),
      );
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(
      await screen.findByText("Couldn't reach the server. Check your connection and try again."),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Check your email')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Send reset link')).toBeOnTheScreen();
  });

  it('falls back to a generic message for any other API failure', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(500, 'Internal Server Error'));
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(
      await screen.findByText('Something went wrong sending that link. Please try again.'),
    ).toBeOnTheScreen();
  });

  it('falls back to a generic message for a non-API failure', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(
      await screen.findByText('Something went wrong sending that link. Please try again.'),
    ).toBeOnTheScreen();
  });

  it('clears the submit error once the user edits the field', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');
    expect(
      await screen.findByText('Something went wrong sending that link. Please try again.'),
    ).toBeOnTheScreen();

    await type('Email', 'shopper2@example.com');

    await waitFor(() =>
      expect(
        screen.queryByText('Something went wrong sending that link. Please try again.'),
      ).not.toBeOnTheScreen(),
    );
  });

  it('shows a busy button while the request is in flight', async () => {
    let release!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await renderWithProviders(<ForgotPasswordScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(await screen.findByText('Sending…')).toBeOnTheScreen();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });

    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeOnTheScreen());
  });

  it('does nothing on a valid submit when no handler is wired', async () => {
    await renderWithProviders(<ForgotPasswordScreen />);

    await type('Email', 'shopper@example.com');
    await press('Send reset link');

    expect(screen.getByText('Reset your password')).toBeOnTheScreen();
    expect(screen.queryByText('Check your email')).not.toBeOnTheScreen();
  });

  it('offers a way back to login from the form itself', async () => {
    await renderWithProviders(<ForgotPasswordScreen />);

    await press('Log in');

    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });
});
