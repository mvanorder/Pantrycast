import { useWindowDimensions } from 'react-native';

import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
} from '../../../test-utils/render';
import { AppHeader } from '../AppHeader';
import { GetStartedNoticeContext } from '../GetStartedNotice';

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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn() }),
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

function renderHeader(onGetStarted: () => void = jest.fn()) {
  return renderWithProviders(
    <GetStartedNoticeContext.Provider value={onGetStarted}>
      <AppHeader />
    </GetStartedNoticeContext.Provider>,
  );
}

beforeEach(() => {
  mockAuth = { status: 'unauthenticated', user: null, signOut: mockSignOut };
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

    await press('Log in to Shopping Analysis');

    expect(mockRouterPush).toHaveBeenCalledWith('/login');
    expect(screen.queryByLabelText('Log out')).not.toBeOnTheScreen();
  });

  it('routes the "Get started" action through the shared notice', async () => {
    setViewport(1280);
    const onGetStarted = jest.fn();
    await renderHeader(onGetStarted);

    await press('Get started with Shopping Analysis');

    expect(onGetStarted).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByLabelText('Log in to Shopping Analysis')).not.toBeOnTheScreen();

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
