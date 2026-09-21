import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../../test-utils/render';
import { ApiError } from '../../../api/client';
import { LoginScreen } from '../LoginScreen';

const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// This project's RNTL renders on a concurrent root, so firing events in a
// synchronous run overlaps act() scopes and wedges the renderer for the rest
// of the file. Await each interaction before the next. (The marketing
// LandingScreen test documents the same constraint.)
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
  mockRouterReplace.mockClear();
  mockRouterPush.mockClear();
});

describe('LoginScreen', () => {
  it('renders the form heading and both fields', async () => {
    await renderWithProviders(<LoginScreen />);

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
  });

  it('shows a required-field error for each empty field and does not submit', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await press('Log in');

    await waitFor(() =>
      expect(screen.getByText('Enter your email address.')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await type('Email', 'not-an-email');
    await type('Password', 'hunter2!!');
    await press('Log in');

    await waitFor(() =>
      expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the trimmed email and password when valid', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await type('Email', '  shopper@example.com  ');
    await type('Password', 's3cret-pass');
    await press('Log in');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'shopper@example.com',
        password: 's3cret-pass',
      }),
    );
  });

  it('submits when the password field fires its "go" key', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 's3cret-pass');
    await act(async () => {
      fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    });

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'shopper@example.com',
        password: 's3cret-pass',
      }),
    );
  });

  it('does nothing on a valid submit when no handler is wired', async () => {
    await renderWithProviders(<LoginScreen />);

    await type('Email', 'shopper@example.com');
    await type('Password', 's3cret-pass');
    await press('Log in');

    expect(screen.getByText('Welcome back')).toBeOnTheScreen();
    expect(screen.queryByText('Signing in…')).not.toBeOnTheScreen();
  });

  it('clears a field error once the user corrects it', async () => {
    await renderWithProviders(<LoginScreen onSubmit={jest.fn()} />);

    await press('Log in');
    await waitFor(() =>
      expect(screen.getByText('Enter your email address.')).toBeOnTheScreen(),
    );

    await type('Email', 'shopper@example.com');

    await waitFor(() =>
      expect(screen.queryByText('Enter your email address.')).not.toBeOnTheScreen(),
    );
  });

  it('surfaces the API message when the sign-in call is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'wrong-pass');
    await press('Log in');

    await waitFor(() =>
      expect(screen.getByText('Invalid email or password')).toBeOnTheScreen(),
    );
  });

  it('falls back to a generic message for a non-API failure', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 's3cret-pass');
    await press('Log in');

    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong signing you in. Please try again.'),
      ).toBeOnTheScreen(),
    );
  });

  it('clears the sign-in error once the user edits a field', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'wrong-pass');
    await press('Log in');
    await waitFor(() =>
      expect(screen.getByText('Invalid email or password')).toBeOnTheScreen(),
    );

    await type('Password', 'another-pass');

    await waitFor(() =>
      expect(screen.queryByText('Invalid email or password')).not.toBeOnTheScreen(),
    );
  });

  it('shows a busy button while the submission is in flight', async () => {
    let release!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await renderWithProviders(<LoginScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 's3cret-pass');
    await press('Log in');

    expect(await screen.findByText('Signing in…')).toBeOnTheScreen();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });

    await waitFor(() => expect(screen.queryByText('Signing in…')).not.toBeOnTheScreen());
  });

  it('handles the email "next" key without disturbing the entered value', async () => {
    await renderWithProviders(<LoginScreen />);

    await type('Email', 'shopper@example.com');
    await act(async () => {
      fireEvent(screen.getByLabelText('Email'), 'submitEditing');
    });

    expect(screen.getByLabelText('Email').props.value).toBe('shopper@example.com');
  });

  it('toggles password visibility', async () => {
    await renderWithProviders(<LoginScreen />);

    expect((await screen.findByLabelText('Password')).props.secureTextEntry).toBe(true);

    await press('Show password');

    await waitFor(() =>
      expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false),
    );
    expect(screen.getByLabelText('Hide password')).toBeOnTheScreen();
  });

  it('offers a recovery link next to the password field', async () => {
    await renderWithProviders(<LoginScreen />);

    expect(await screen.findByLabelText('Forgot password?')).toBeOnTheScreen();

    await press('Forgot password?');

    // `push`, not `replace`: recovery is a detour, so back returns here.
    expect(mockRouterPush).toHaveBeenCalledWith('/forgot-password');
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('keeps the recovery link visible alongside a password validation error', async () => {
    await renderWithProviders(<LoginScreen onSubmit={jest.fn()} />);

    await press('Log in');

    await waitFor(() => expect(screen.getByText('Enter your password.')).toBeOnTheScreen());
    expect(screen.getByLabelText('Forgot password?')).toBeOnTheScreen();
  });

  it('sends a would-be signer-upper to the signup screen', async () => {
    await renderWithProviders(<LoginScreen />);

    await press('Get started');

    expect(mockRouterReplace).toHaveBeenCalledWith('/signup');
  });
});
