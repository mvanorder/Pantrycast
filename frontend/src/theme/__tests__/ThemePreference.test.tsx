import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ReactNative from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  ThemePreferenceProvider,
  useThemePreference,
} from '../ThemePreference';

const STORAGE_KEY = 'pantrycast/theme-mode';

function mockSystemScheme(scheme: 'light' | 'dark' | null) {
  jest
    .spyOn(ReactNative, 'useColorScheme')
    .mockReturnValue(scheme as 'light' | 'dark');
}

async function mountPreference() {
  const view = await renderHook(() => useThemePreference(), {
    wrapper: ThemePreferenceProvider,
  });
  await waitFor(() => expect(view.result.current.isReady).toBe(true));
  return view;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSystemScheme('light');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ThemePreferenceProvider', () => {
  it('starts on system mode and follows the OS scheme', async () => {
    mockSystemScheme('dark');
    const { result } = await mountPreference();

    expect(result.current.mode).toBe('system');
    expect(result.current.scheme).toBe('dark');
  });

  it('restores a persisted explicit mode', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'dark');

    const { result } = await mountPreference();

    expect(result.current.mode).toBe('dark');
    expect(result.current.scheme).toBe('dark');
  });

  it('ignores a corrupt stored value and stays on system', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'chartreuse');

    const { result } = await mountPreference();

    expect(result.current.mode).toBe('system');
  });

  it('persists an explicit choice made through setMode', async () => {
    const { result } = await mountPreference();

    await act(async () => result.current.setMode('light'));

    expect(result.current.mode).toBe('light');
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('cycles system -> light -> dark -> system when the OS is dark', async () => {
    mockSystemScheme('dark');
    const { result } = await mountPreference();

    await act(async () => result.current.cycle());
    expect(result.current.mode).toBe('light');

    await act(async () => result.current.cycle());
    expect(result.current.mode).toBe('dark');

    await act(async () => result.current.cycle());
    expect(result.current.mode).toBe('system');
  });

  it('cycles system -> dark -> light -> system when the OS is light', async () => {
    mockSystemScheme('light');
    const { result } = await mountPreference();

    await act(async () => result.current.cycle());
    expect(result.current.mode).toBe('dark');

    await act(async () => result.current.cycle());
    expect(result.current.mode).toBe('light');

    await act(async () => result.current.cycle());
    expect(result.current.mode).toBe('system');
  });

  it('treats an unknown OS scheme as light', async () => {
    mockSystemScheme(null);
    const { result } = await mountPreference();

    expect(result.current.scheme).toBe('light');
  });

  it('stays on system when the storage read itself rejects', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    const { result } = await mountPreference();

    expect(result.current.mode).toBe('system');
    expect(result.current.isReady).toBe(true);
  });

  it('still applies the choice in memory when persistence fails', async () => {
    const { result } = await mountPreference();
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('quota exceeded'));

    await act(async () => result.current.setMode('dark'));

    expect(result.current.mode).toBe('dark');
  });
});

describe('useThemePreference outside a provider', () => {
  it('throws a helpful error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(renderHook(() => useThemePreference())).rejects.toThrow(
      /must be used within a ThemePreferenceProvider/,
    );
  });
});
