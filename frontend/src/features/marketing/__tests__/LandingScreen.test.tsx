import { ScrollView, useWindowDimensions } from 'react-native';

import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
} from '../../../../test-utils/render';
import { LandingScreen } from '../LandingScreen';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

// The landing body no longer reads auth directly, but `renderWithProviders`
// still mounts the real `AuthProvider`, whose async hydration overlaps act()
// scopes on the concurrent renderer. A passthrough keeps the helper working
// without that noise.
jest.mock('../../auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'unauthenticated', user: null, signIn: jest.fn(), signOut: jest.fn() }),
}));

const mockedUseWindowDimensions = jest.mocked(useWindowDimensions);

function setViewport(width: number) {
  mockedUseWindowDimensions.mockReturnValue({
    width,
    height: 900,
    scale: 2,
    fontScale: 1,
  });
}

afterEach(() => {
  mockedUseWindowDimensions.mockReset();
  jest.restoreAllMocks();
});

describe('LandingScreen', () => {
  it('renders every section of the page on a compact viewport', async () => {
    setViewport(375);
    await renderWithProviders(<LandingScreen />);

    expect(
      screen.getByText("Know what you'll need before you run out."),
    ).toBeOnTheScreen();
    expect(screen.getByText('How it works')).toBeOnTheScreen();
    expect(screen.getByText('A live look at your trends.')).toBeOnTheScreen();
    expect(screen.getByText('Ready to see your own patterns?')).toBeOnTheScreen();
  });

  it('renders the mid-width (medium) layout', async () => {
    setViewport(800);
    await renderWithProviders(<LandingScreen />);

    expect(screen.getByText('How it works')).toBeOnTheScreen();
    expect(screen.getByText('A live look at your trends.')).toBeOnTheScreen();
  });

  it('renders the two-column layout on an expanded viewport', async () => {
    setViewport(1280);
    await renderWithProviders(<LandingScreen />);

    expect(screen.getByText('How it works')).toBeOnTheScreen();
    expect(
      screen.getByText('Example preview — your own history fills this in.'),
    ).toBeOnTheScreen();
  });

  it('scrolls to the measured "How it works" section', async () => {
    setViewport(1280);
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});

    const { root } = await renderWithProviders(<LandingScreen />);

    // The screen has exactly one onLayout handler: the "How it works" band.
    const [sectionNode] = root!.queryAll(
      (node) => typeof node.props.onLayout === 'function',
    );
    expect(sectionNode).toBeDefined();

    await act(async () => {
      fireEvent(sectionNode, 'layout', {
        nativeEvent: { layout: { x: 0, y: 1400, width: 1280, height: 600 } },
      });
    });

    fireEvent.press(screen.getByLabelText('See how it works'));

    expect(scrollTo).toHaveBeenCalledWith({ y: 1400, animated: true });
  });

  it('scrolls to the top before the section has been measured', async () => {
    setViewport(1280);
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});

    await renderWithProviders(<LandingScreen />);

    fireEvent.press(screen.getByLabelText('See how it works'));

    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });
});
