import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../../test-utils/render';
import { ApiError } from '../../../api/client';
import { SignUpScreen } from '../SignUpScreen';

const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// Same constraint as LoginScreen's tests: this project's RNTL renders on a
// concurrent root, so firing events synchronously overlaps act() scopes.
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

describe('SignUpScreen', () => {
  it('renders the form heading and every field', async () => {
    await renderWithProviders(<SignUpScreen />);

    expect(await screen.findByText('Create your account')).toBeOnTheScreen();
    expect(screen.getByLabelText('Name')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Confirm password')).toBeOnTheScreen();
  });

  it('shows a required-field error for each empty field and does not submit', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await press('Create account');

    await waitFor(() =>
      expect(screen.getByText('Enter your email address.')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Enter a password.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Email', 'not-an-email');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    await waitFor(() =>
      expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'short1');
    await type('Confirm password', 'short1');
    await press('Create account');

    await waitFor(() =>
      expect(screen.getByText('Use at least 8 characters.')).toBeOnTheScreen(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a confirmation that does not match the password', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password124');
    await press('Create account');

    await waitFor(() =>
      expect(screen.getByText("Passwords don't match.")).toBeOnTheScreen(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the trimmed email, password, and display name when valid', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Name', '  Sam Shopper  ');
    await type('Email', '  shopper@example.com  ');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'shopper@example.com',
        password: 'password123',
        displayName: 'Sam Shopper',
      }),
    );
  });

  it('omits displayName when the name field is left blank', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'shopper@example.com',
        password: 'password123',
      }),
    );
  });

  it('does nothing on a valid submit when no handler is wired', async () => {
    await renderWithProviders(<SignUpScreen />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    expect(screen.getByText('Create your account')).toBeOnTheScreen();
    expect(screen.queryByText('Creating account…')).not.toBeOnTheScreen();
  });

  it('clears a field error once the user corrects it', async () => {
    await renderWithProviders(<SignUpScreen onSubmit={jest.fn()} />);

    await press('Create account');
    await waitFor(() =>
      expect(screen.getByText('Enter your email address.')).toBeOnTheScreen(),
    );

    await type('Email', 'shopper@example.com');

    await waitFor(() =>
      expect(screen.queryByText('Enter your email address.')).not.toBeOnTheScreen(),
    );
  });

  it('clears a stale confirm-password mismatch once the password is edited to match again', async () => {
    await renderWithProviders(<SignUpScreen onSubmit={jest.fn()} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'not-the-same');
    await press('Create account');
    await waitFor(() =>
      expect(screen.getByText("Passwords don't match.")).toBeOnTheScreen(),
    );

    await type('Confirm password', 'password123');

    await waitFor(() =>
      expect(screen.queryByText("Passwords don't match.")).not.toBeOnTheScreen(),
    );
  });

  it('also clears a stale confirm-password mismatch when the password field itself is edited', async () => {
    await renderWithProviders(<SignUpScreen onSubmit={jest.fn()} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'not-the-same');
    await press('Create account');
    await waitFor(() =>
      expect(screen.getByText("Passwords don't match.")).toBeOnTheScreen(),
    );

    await type('Password', 'not-the-same');

    await waitFor(() =>
      expect(screen.queryByText("Passwords don't match.")).not.toBeOnTheScreen(),
    );
  });

  it('surfaces the API message when registration is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(400, 'Email already registered'));
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Email', 'taken@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    await waitFor(() =>
      expect(screen.getByText('Email already registered')).toBeOnTheScreen(),
    );
  });

  it('falls back to a generic message for a non-API failure', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong creating your account. Please try again.'),
      ).toBeOnTheScreen(),
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
    await renderWithProviders(<SignUpScreen onSubmit={onSubmit} />);

    await type('Email', 'shopper@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    expect(await screen.findByText('Creating account…')).toBeOnTheScreen();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });

    await waitFor(() => expect(screen.queryByText('Creating account…')).not.toBeOnTheScreen());
  });

  it('toggles password visibility for both password fields together', async () => {
    await renderWithProviders(<SignUpScreen />);

    expect((await screen.findByLabelText('Password')).props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(true);

    await press('Show password');

    await waitFor(() =>
      expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false),
    );
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(false);
  });

  it('sends an already-registered visitor to the login screen', async () => {
    await renderWithProviders(<SignUpScreen />);

    await press('Log in');

    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });
});
