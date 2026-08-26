import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/features/auth/AuthContext';
import {
  appFonts,
  darkTheme,
  lightTheme,
  ThemePreferenceProvider,
  useThemePreference,
  useWebFocusRing,
} from '@/theme';

// Hold the native splash screen until the display face is ready, so headlines
// never flash in the fallback system font first.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Everything below the theme provider: picks the Paper theme from the resolved
 * scheme and matches the OS status bar to it.
 */
function ThemedApp({ fontsSettled }: { fontsSettled: boolean }) {
  const { scheme, isReady } = useThemePreference();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  useWebFocusRing(theme.colors.primary);

  useEffect(() => {
    // Hold the native splash until both the display face and the stored theme
    // are ready, so headlines never flash in the fallback font and a pinned
    // dark preference is never revealed as a light-to-dark flash. We gate only
    // the splash *dismissal* on this, never rendering - returning null here
    // would export a blank static web page (effects don't run during prerender).
    if (isReady && fontsSettled) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isReady, fontsSettled]);

  return (
    <PaperProvider
      theme={theme}
      // Paper's default icon set ships with react-native-vector-icons; on Expo
      // we point it at @expo/vector-icons so fonts load on iOS, Android and web.
      settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}>
      {/* Individual screens with their own brand chrome (e.g. the
          dashboard's blue header band) override this with their own
          <StatusBar> while focused. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}>
        <Stack.Screen name="index" />
        {/* Dashboard draws its own brand header, so the native header is off.
            Future drill-downs (item history, full shopping list) push onto
            this same stack and get the standard back affordance — iOS
            swipe-back and Android system back both work by default. A tab bar
            would be premature with one real screen; add Tabs here once Trends
            / Shopping list / Upload exist as peers. */}
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      </Stack>
    </PaperProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);

  // Always render the tree so the static web export has real markup; the splash
  // screen (held in ThemedApp) covers the font swap on native. A font error
  // still counts as "settled" - headlines fall back to the system face rather
  // than the app sitting on the splash forever.
  const fontsSettled = fontsLoaded || fontError != null;

  return (
    <SafeAreaProvider>
      <ThemePreferenceProvider>
        <AuthProvider>
          <ThemedApp fontsSettled={fontsSettled} />
        </AuthProvider>
      </ThemePreferenceProvider>
    </SafeAreaProvider>
  );
}
