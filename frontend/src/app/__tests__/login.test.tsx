import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../test-utils/render';
import { ApiError } from '../../api/client';

import Login from '../login';

const mockReplace = jest.fn();
const mockSignIn = jest.fn();

// `Stack.Screen` only sets navigator options and needs a route context we do
// not mount here; `useRouter` is stubbed because the route handler reads it.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

// The route delegates the actual sign-in to the auth context; stub it so the
// test stays on the route's own job (validate -> signIn -> navigate). The
// passthrough `AuthProvider` keeps `renderWithProviders` working.
jest.mock('../../features/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    signIn: mockSignIn,
    signOut: jest.fn(),
  }),
}));

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

describe('Login screen', () => {
  it('renders the login form at the /login route', async () => {
    await renderWithProviders(<Login />);

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
  });

  it('signs in with the trimmed credentials and goes to the dashboard on success', async () => {
    mockSignIn.mockResolvedValue(undefined);

    await renderWithProviders(<Login />);
    await type('Email', '  shopper@example.com  ');
    await type('Password', 's3cret-pass');
    await press('Log in');

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'shopper@example.com',
        password: 's3cret-pass',
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'));
  });

  it('surfaces a rejected sign-in and does not navigate', async () => {
    mockSignIn.mockRejectedValue(new ApiError(401, 'Invalid email or password'));

    await renderWithProviders(<Login />);
    await type('Email', 'shopper@example.com');
    await type('Password', 'wrong-pass');
    await press('Log in');

    await waitFor(() =>
      expect(screen.getByText('Invalid email or password')).toBeOnTheScreen(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
