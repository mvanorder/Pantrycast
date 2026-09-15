import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme';

import { AppHeader } from './AppHeader';

/**
 * The persistent frame every route renders inside: the global {@link AppHeader}
 * fixed on top, the active screen filling the rest. The header lives here
 * rather than in each screen so it stays put across navigation and is defined
 * once. The matching footer ({@link AppFooter}) rides each screen's scroll via
 * {@link ScreenScrollView} instead of being pinned here, so it never covers
 * content on a long page.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <AppHeader />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
