import { useWindowDimensions } from 'react-native';

import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
} from '../../../test-utils/render';
import { AppHeader } from '../AppHeader';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const mockSignOut = jest.fn();
let mockAuth: {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: { display_name: string | null; email: string } | null;
  signOut: jest.Mock;
};

// The header reads `useAuth()` for its signed-in state; drive it from the test.
// The passthrough `AuthProvider` keeps `renderWithProviders` working.
jest.mock('../../features/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuth,
}));

const mockRouterPush = jest.fn();

// The header navigates to `/login` through `useRouter`; there is no router
// context mounted here, so stub the hook and assert on the push.
let mockPathname = '/';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn() }),
  usePathname: () => mockPathname,
}));

const mockedUseWindowDimensions = jest.mocked(useWindowDimensions);

function setViewport(width: number) {
  mockedUseWindowDimensions.mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
}

// This project's RNTL renders on a concurrent root; a synchronous fireEvent
// overlaps act() scopes and wedges the renderer for the rest of the file.
async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

function renderHeader() {
  return renderWithProviders(<AppHeader />);
}

beforeEach(() => {
  mockAuth = { status: 'unauthenticated', user: null, signOut: mockSignOut };
  mockPathname = '/';
});

afterEach(() => {
  mockedUseWindowDimensions.mockReset();
  mockRouterPush.mockClear();
  mockSignOut.mockClear();
});

describe('AppHeader', () => {
  it('navigates to the login route from the "Log in" action when signed out', async () => {
    setViewport(1280);
    await renderHeader();

    await press('Log in to Pantrycast');

    expect(mockRouterPush).toHaveBeenCalledWith('/login');
    expect(screen.queryByLabelText('Log out')).not.toBeOnTheScreen();
  });

  it('hides the "Log in" action when already on the login route', async () => {
    setViewport(1280);
    mockPathname = '/login';
    await renderHeader();

    expect(screen.queryByLabelText('Log in to Pantrycast')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Get started with Pantrycast')).toBeOnTheScreen();
  });

  it('navigates to the signup route from the "Get started" action', async () => {
    setViewport(1280);
    await renderHeader();

    await press('Get started with Pantrycast');

    expect(mockRouterPush).toHaveBeenCalledWith('/signup');
  });

  it('hides the "Get started" action when already on the signup route', async () => {
    setViewport(1280);
    mockPathname = '/signup';
    await renderHeader();

    expect(screen.queryByLabelText('Get started with Pantrycast')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Log in to Pantrycast')).toBeOnTheScreen();
  });

  it('shows the signed-in identity and logs out when a session is authenticated', async () => {
    setViewport(1280);
    mockAuth = {
      status: 'authenticated',
      user: { display_name: null, email: 'shopper@example.com' },
      signOut: mockSignOut,
    };
    await renderHeader();

    expect(screen.getByText('shopper@example.com')).toBeOnTheScreen();
    expect(screen.getByLabelText('Signed in as shopper@example.com')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Log in to Pantrycast')).not.toBeOnTheScreen();

    await press('Log out');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('drops the address label on a compact viewport, keeping the log-out action', async () => {
    setViewport(375);
    mockAuth = {
      status: 'authenticated',
      user: { display_name: 'Sam Shopper', email: 'shopper@example.com' },
      signOut: mockSignOut,
    };

    await renderHeader();

    expect(screen.queryByText('Sam Shopper')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Signed in as Sam Shopper')).toBeOnTheScreen();
    expect(screen.getByLabelText('Log out')).toBeOnTheScreen();
  });
});
