import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../test-utils/render';
import { ApiError } from '../../api/client';

import SignUp from '../signup';

const mockReplace = jest.fn();
const mockSignUp = jest.fn();

// `Stack.Screen` only sets navigator options and needs a route context we do
// not mount here; `useRouter` is stubbed because the route handler reads it.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

// The route delegates account creation to the auth context; stub it so the
// test stays on the route's own job (validate -> signUp -> navigate). The
// passthrough `AuthProvider` keeps `renderWithProviders` working.
jest.mock('../../features/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    signUp: mockSignUp,
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

describe('Sign up screen', () => {
  it('renders the sign-up form at the /signup route', async () => {
    await renderWithProviders(<SignUp />);

    expect(await screen.findByText('Create your account')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Confirm password')).toBeOnTheScreen();
  });

  it('signs up with the trimmed details and goes to the dashboard on success', async () => {
    mockSignUp.mockResolvedValue(undefined);

    await renderWithProviders(<SignUp />);
    await type('Name', '  Sam Shopper  ');
    await type('Email', '  shopper@example.com  ');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'shopper@example.com',
        password: 'password123',
        displayName: 'Sam Shopper',
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'));
  });

  it('surfaces a rejected registration and does not navigate', async () => {
    mockSignUp.mockRejectedValue(new ApiError(400, 'Email already registered'));

    await renderWithProviders(<SignUp />);
    await type('Email', 'taken@example.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await press('Create account');

    await waitFor(() =>
      expect(screen.getByText('Email already registered')).toBeOnTheScreen(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
