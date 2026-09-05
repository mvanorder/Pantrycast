import { render, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import RootLayout from '../_layout';

// Defined inside each factory on purpose: jest.mock is hoisted above the
// imports, so anything referenced at module scope would still be in its
// temporal dead zone when the factory runs.
jest.mock('expo-router', () => ({
  Stack: jest.fn(() => null),
  // AppShell's global header (rendered around the Stack) reads `useRouter`.
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// Only `useFonts` is overridden — the rest of expo-font stays real so
// @expo/vector-icons' `Font.isLoaded` still works when the global AppShell
// header renders its icons.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: jest.fn(() => [true, null]),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const mockedUseFonts = jest.mocked(useFonts);
const mockedStack = jest.mocked(Stack);

describe('RootLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseFonts.mockReturnValue([true, null]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the expo-router stack', async () => {
    await render(<RootLayout />);

    expect(mockedStack).toHaveBeenCalled();
  });

  it('renders real markup even before the fonts have loaded, so the static web export is not blank', async () => {
    mockedUseFonts.mockReturnValue([false, null]);

    await render(<RootLayout />);

    expect(mockedStack).toHaveBeenCalled();
  });

  it('holds the splash screen until the fonts are settled', async () => {
    mockedUseFonts.mockReturnValue([false, null]);

    await render(<RootLayout />);

    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('hides the splash screen once the fonts have loaded', async () => {
    await render(<RootLayout />);

    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
  });

  it('treats a font-load error as settled and dismisses the splash', async () => {
    mockedUseFonts.mockReturnValue([false, new Error('font 404')]);

    await render(<RootLayout />);

    expect(mockedStack).toHaveBeenCalled();
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
  });

  it('selects the dark Paper theme when the OS is in dark mode', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');

    await render(<RootLayout />);

    const [{ screenOptions }] = mockedStack.mock.calls[0] as [
      { screenOptions: { contentStyle: { backgroundColor: string } } },
    ];
    // #0E161C is darkPalette.background.
    expect(screenOptions.contentStyle.backgroundColor).toBe('#0E161C');
  });

  it('selects the light Paper theme when the OS is in light mode', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');

    await render(<RootLayout />);

    const [{ screenOptions }] = mockedStack.mock.calls[0] as [
      { screenOptions: { contentStyle: { backgroundColor: string } } },
    ];
    // #F3F7FB is palette.background.
    expect(screenOptions.contentStyle.backgroundColor).toBe('#F3F7FB');
  });
});
