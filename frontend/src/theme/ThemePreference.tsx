import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

/** What the user picked. `'system'` follows the OS appearance. */
export type ThemeMode = 'system' | 'light' | 'dark';
/** The scheme actually in effect once `'system'` is resolved. */
export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'pantrycast/theme-mode';

type ThemePreference = {
  mode: ThemeMode;
  scheme: ColorScheme;
  /**
   * `false` until the persisted choice has been read. The root layout holds the
   * splash screen until this flips so the app never paints light-then-dark.
   */
  isReady: boolean;
  /** Pick a mode explicitly (also persists it). */
  setMode: (mode: ThemeMode) => void;
  /**
   * Step to the next mode in a three-stop cycle that always starts at
   * `'system'`, then visits the two pinned schemes. The OS appearance is
   * offered last of the two so the *other* scheme is one tap away:
   * - OS is dark  -> `system` -> `light` -> `dark` -> `system` -> ...
   * - OS is light -> `system` -> `dark` -> `light` -> `system` -> ...
   */
  cycle: () => void;
};

const ThemePreferenceContext = createContext<ThemePreference | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  // On web, `useColorScheme` reports `null` during static prerender (no
  // `window`) and the *real* OS scheme from the very first client render -
  // reading it unconditionally would make that first client render disagree
  // with the statically-rendered (always-light) HTML it's hydrating over.
  // React detects that as a hydration mismatch (error #418) and discards the
  // mismatched subtree to re-render it client-only; some subtrees recover
  // visually from that, but the root layout's persistent AppHeader/AppShell
  // chrome does not, leaving it stuck on the server's light styling forever
  // (until some unrelated, non-hydration state update - e.g. a manual theme
  // toggle - forces a normal re-render). Gating on `isReady` (which only
  // flips after the initial mount/hydration commit, via the AsyncStorage
  // effect below) makes the first client render match the server exactly, so
  // hydration always succeeds; the correct scheme then applies a tick later
  // via an ordinary, hydration-unrelated re-render, which reliably repaints
  // every subtree, header included.
  const rawScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);
  const systemScheme: ColorScheme = isReady && rawScheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isThemeMode(stored)) {
          setModeState(stored);
        }
      })
      .catch(() => {
        // No stored preference (or storage unavailable) - stay on 'system'.
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best effort - the in-memory choice still applies for this session.
    });
  }, []);

  const scheme: ColorScheme = mode === 'system' ? systemScheme : mode;

  const cycle = useCallback(() => {
    // Pin the scheme opposite the OS first, then the OS scheme, then back to
    // 'system' - so whichever appearance the OS isn't giving you is always the
    // very next tap from 'system'.
    const order: ThemeMode[] = [
      'system',
      systemScheme === 'dark' ? 'light' : 'dark',
      systemScheme,
    ];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    setMode(next);
  }, [mode, systemScheme, setMode]);

  const value = useMemo<ThemePreference>(
    () => ({ mode, scheme, isReady, setMode, cycle }),
    [mode, scheme, isReady, setMode, cycle],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreference {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used within a ThemePreferenceProvider');
  }
  return context;
}
