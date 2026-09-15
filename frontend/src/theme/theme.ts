import { Platform } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
// Type-only: erased at compile time, so this never pulls in the real
// `expo-router` module (or fights its jest mock) at runtime.
import type { Theme as NavigationTheme } from 'expo-router';

import { appFontConfig } from './fonts';
import { darkPalette, palette, radius, spacing, type Palette } from './tokens';

/**
 * Paper theme extended with the handful of brand colours MD3 has no slot for,
 * plus the spacing/radius scale so screens can read `theme.spacing.lg` instead
 * of importing the token separately. Consume it with `useAppTheme()` so
 * `theme.colors.accent` etc. stay typed.
 */
export type AppTheme = MD3Theme & {
  colors: MD3Theme['colors'] & {
    /** Raw splash-screen blue. Decorative fills only - never behind text. */
    primaryBright: string;
    /** Tinted surface for inset panels inside a card. */
    surfaceMuted: string;
    /** Urgency accent, e.g. "due in 2d" badges (marketing's dashboard preview). */
    accent: string;
    accentContainer: string;
    /** Renders a KPI caption in the success tone (e.g. a spend delta). */
    success: string;
    onSuccess: string;
    successContainer: string;
    onSuccessContainer: string;
    /** "Due soon" amber, e.g. the dashboard's `DuePill`. Same idea as `accent`
     * under the name the dashboard feature already uses. */
    warning: string;
    warningContainer: string;
    onWarningContainer: string;
    /** Neutral (not due soon) pill background - same as `surfaceMuted`. */
    neutralContainer: string;
    onNeutralContainer: string;
    /** The dashboard's brand header band. */
    headerBackground: string;
    onHeader: string;
    /** Raw brand blue for decorative use (sparklines, icon tints). Same value
     * as `primaryBright` under a name the dashboard feature already uses. */
    brandBright: string;
    skeleton: string;
  };
  spacing: typeof spacing;
  radius: typeof radius;
};

/**
 * Colour roles the dashboard feature added that don't derive from the shared
 * `Palette` shape - either because no marketing screen needs them (so they
 * were never generalised into `Palette`), or because the "right" dark value
 * isn't a mechanical function of the light one (`headerBackground` needs a
 * *container* tone in dark mode, not the scheme's `primary`, since `primary`
 * itself is a light chip colour there and doesn't hold white text).
 */
type DashboardExtra = {
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
  warning: string;
  warningContainer: string;
  onWarningContainer: string;
  headerBackground: string;
  onHeader: string;
  skeleton: string;
};

/**
 * Build an `AppTheme` by mapping our palette onto MD3's colour slots. `base` is
 * `MD3LightTheme` or `MD3DarkTheme` - it only supplies the roles we don't
 * override (scrim, backdrop, etc.), so the two themes stay in lockstep.
 */
function createAppTheme(base: MD3Theme, colors: Palette, extra: DashboardExtra): AppTheme {
  return {
    ...base,
    roundness: 3, // Paper multiplies this by 4 -> 12pt corners
    fonts: appFontConfig,
    spacing,
    radius,
    colors: {
      ...base.colors,

      primary: colors.primary,
      onPrimary: colors.onPrimary,
      primaryContainer: colors.primaryContainer,
      onPrimaryContainer: colors.onPrimaryContainer,

      secondary: colors.onPrimaryContainer,
      onSecondary: colors.onPrimary,
      secondaryContainer: colors.primaryContainer,
      onSecondaryContainer: colors.onPrimaryContainer,

      tertiary: colors.accent,
      onTertiary: colors.onPrimary,
      tertiaryContainer: colors.accentContainer,
      onTertiaryContainer: colors.accent,

      background: colors.background,
      onBackground: colors.onSurface,
      surface: colors.surface,
      onSurface: colors.onSurface,
      surfaceVariant: colors.surfaceMuted,
      onSurfaceVariant: colors.onSurfaceVariant,

      outline: colors.outline,
      outlineVariant: colors.outline,

      inverseSurface: colors.onSurface,
      inverseOnSurface: colors.background,
      inversePrimary: colors.primaryContainer,

      // Cards/Surfaces hold one flat surface colour at every elevation instead
      // of drifting purple (light) or grey-blue (dark) with Paper's tint.
      elevation: {
        level0: 'transparent',
        level1: colors.surface,
        level2: colors.surface,
        level3: colors.surface,
        level4: colors.surface,
        level5: colors.surface,
      },

      primaryBright: colors.primaryBright,
      surfaceMuted: colors.surfaceMuted,
      accent: colors.accent,
      accentContainer: colors.accentContainer,
      neutralContainer: colors.surfaceMuted,
      onNeutralContainer: colors.onSurfaceVariant,
      brandBright: colors.primaryBright,

      ...extra,
    },
  };
}

export const lightTheme: AppTheme = createAppTheme(MD3LightTheme, palette, {
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#8C0009',
  success: '#10703A',
  onSuccess: '#FFFFFF',
  successContainer: '#D9F2E3',
  onSuccessContainer: '#05331A',
  warning: '#8A5000',
  warningContainer: '#FFE8CC',
  onWarningContainer: '#7A3E00',
  headerBackground: palette.primary,
  onHeader: palette.onPrimary,
  skeleton: '#E4EAF0',
});

export const darkTheme: AppTheme = createAppTheme(MD3DarkTheme, darkPalette, {
  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  success: '#77DFA4',
  onSuccess: '#00391C',
  successContainer: '#0B4E28',
  onSuccessContainer: '#C8F2D8',
  warning: '#FFB870',
  warningContainer: '#5E3400',
  onWarningContainer: '#FFE8CC',
  // The *container* blue, not `primary` - `primary` itself is a light chip
  // colour meant to sit on dark surfaces, and doesn't hold white text.
  headerBackground: darkPalette.primaryContainer,
  onHeader: '#FFFFFF',
  skeleton: '#22303A',
});

export const useAppTheme = () => useTheme<AppTheme>();

/**
 * React Navigation's font shape (mirrors `expo-router`'s own default, which
 * isn't exported) - `NavigationTheme` requires it even though our screens
 * never render React Navigation's built-in header/label chrome.
 */
const navigationFonts = Platform.select<NavigationTheme['fonts']>({
  web: {
    regular: { fontFamily: appFontConfig.bodyMedium.fontFamily, fontWeight: '400' },
    medium: { fontFamily: appFontConfig.bodyMedium.fontFamily, fontWeight: '500' },
    bold: { fontFamily: appFontConfig.bodyMedium.fontFamily, fontWeight: '600' },
    heavy: { fontFamily: appFontConfig.bodyMedium.fontFamily, fontWeight: '700' },
  },
  default: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
})!;

/**
 * React Navigation's own theme, kept in lockstep with {@link lightTheme} /
 * {@link darkTheme}. `expo-router` mounts its `NavigationContainer`
 * automatically with a hardcoded light theme (`background: 'rgb(242, 242,
 * 242)'`) unless a `ThemeProvider` overrides it - without this, the
 * full-bleed screen background React Navigation paints *behind* every route
 * (see `expo-router`'s `Background` element) never follows dark mode, and
 * shows through as a stray light patch anywhere our own view backgrounds
 * don't fully occlude it (background rules only, no scroll fixed here).
 */
export const navigationLightTheme: NavigationTheme = {
  dark: false,
  colors: {
    primary: palette.primary,
    background: palette.background,
    card: palette.surface,
    text: palette.onSurface,
    border: palette.outline,
    notification: palette.accent,
  },
  fonts: navigationFonts,
};

export const navigationDarkTheme: NavigationTheme = {
  dark: true,
  colors: {
    primary: darkPalette.primary,
    background: darkPalette.background,
    card: darkPalette.surface,
    text: darkPalette.onSurface,
    border: darkPalette.outline,
    notification: darkPalette.accent,
  },
  fonts: navigationFonts,
};
