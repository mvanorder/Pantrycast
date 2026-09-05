import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Snackbar } from 'react-native-paper';

import { useAppTheme } from '@/theme';

import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { GetStartedNoticeContext } from './GetStartedNotice';

/**
 * The persistent frame every route renders inside: the global {@link AppHeader}
 * on top, the active screen in the middle, the global {@link AppFooter} pinned
 * below. The header and footer live here rather than in each screen so they
 * stay put across navigation and are defined once.
 *
 * It also owns the single "sign-up isn't wired up yet" Snackbar, handed to
 * descendants through {@link GetStartedNoticeContext} so the header CTA and the
 * landing page's buttons share one acknowledgement.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const [noticeVisible, setNoticeVisible] = useState(false);

  const showNotice = useCallback(() => setNoticeVisible(true), []);
  const dismissNotice = useCallback(() => setNoticeVisible(false), []);

  return (
    <GetStartedNoticeContext.Provider value={showNotice}>
      <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
        <AppHeader />
        <View style={styles.content}>
          {children}
          <Snackbar
            visible={noticeVisible}
            onDismiss={dismissNotice}
            duration={4000}
            action={{ label: 'OK', onPress: dismissNotice }}
            style={styles.snackbar}
          >
            Sign-up isn&apos;t wired up yet — this is a preview of the landing page.
          </Snackbar>
        </View>
        <AppFooter />
      </View>
    </GetStartedNoticeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  snackbar: {
    alignSelf: 'center',
    maxWidth: 520,
  },
});
