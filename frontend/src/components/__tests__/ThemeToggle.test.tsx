import * as ReactNative from 'react-native';

import { renderWithProviders, fireEvent, screen, waitFor } from '../../../test-utils/render';
import { ThemeToggle } from '../ThemeToggle';

afterEach(() => jest.restoreAllMocks());

describe('ThemeToggle', () => {
  it('shows the "Auto" tag while following the system theme', async () => {
    await renderWithProviders(<ThemeToggle />);

    expect(screen.getByText('Auto')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/Theme: system default \((light|dark)\)/),
    ).toBeOnTheScreen();
  });

  it('drops the "Auto" tag and relabels once a scheme is pinned', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    await renderWithProviders(<ThemeToggle />);

    fireEvent.press(screen.getByLabelText(/Theme:/));

    await waitFor(() => expect(screen.queryByText('Auto')).not.toBeOnTheScreen());
    expect(screen.getByLabelText('Theme: dark')).toBeOnTheScreen();
  });

  it('cycles back to system after visiting both pinned schemes', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    await renderWithProviders(<ThemeToggle />);

    fireEvent.press(screen.getByLabelText(/Theme:/));
    await waitFor(() => expect(screen.getByLabelText('Theme: dark')).toBeOnTheScreen());

    fireEvent.press(screen.getByLabelText(/Theme:/));
    await waitFor(() => expect(screen.getByLabelText('Theme: light')).toBeOnTheScreen());

    fireEvent.press(screen.getByLabelText(/Theme:/));
    await waitFor(() => expect(screen.getByText('Auto')).toBeOnTheScreen());
  });
});
