import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, Surface, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthContext';
import { layout, radius, spacing, useAppTheme, useResponsive } from '@/theme';

import { BrandMark } from './BrandMark';
import { ThemeToggle } from './ThemeToggle';
import { useGetStartedNotice } from './GetStartedNotice';

/**
 * Global app header: brand lockup left, theme toggle plus the session actions
 * right. Rendered once by {@link AppShell} so it sits above every route rather
 * than each screen drawing its own.
 *
 * Deliberately not a Paper `Appbar.Header` - this app is a public web-style
 * site with no per-screen back affordance, and an Appbar would imply navigation
 * chrome that does not exist here.
 *
 * Signed out it shows "Log in" (routes to `/login`) and "Get started"; since
 * sign-up does not exist yet, "Get started" acknowledges the tap with the
 * shared Snackbar {@link AppShell} owns rather than silently doing nothing.
 * Once a session is authenticated the bar shows the signed-in identity and a
 * "Log out" action in its place.
 */
export function AppHeader() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { gutter, isCompact } = useResponsive();
  const router = useRouter();
  const { status, user, signOut } = useAuth();
  const notifyGetStarted = useGetStartedNotice();

  const account =
    status === 'authenticated' && user
      ? { label: user.display_name ?? user.email, onLogOut: () => void signOut() }
      : undefined;

  return (
    <Surface
      elevation={0}
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.outline,
          paddingTop: insets.top + spacing.xs,
          // Same formula as Section, so the brand mark lines up with every
          // section's content edge (notch insets included, in landscape).
          paddingLeft: gutter + insets.left,
          paddingRight: gutter + insets.right,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Drop the wordmark on phones so the brand mark, theme toggle and CTA
            all fit on one row without the label wrapping. */}
        <BrandMark showWordmark={!isCompact} />
        <View style={styles.actions}>
          <ThemeToggle />
          {account ? (
            <>
              {/* The person glyph is the at-a-glance "you're signed in" cue on
                  every width; the address itself only fits alongside it once
                  the wordmark is back (non-compact). */}
              <View
                accessible
                accessibilityLabel={`Signed in as ${account.label}`}
                style={styles.account}
              >
                <Icon
                  source="account-circle"
                  size={22}
                  color={theme.colors.onSurfaceVariant}
                />
                {isCompact ? null : (
                  <Text
                    variant="bodyMedium"
                    numberOfLines={1}
                    style={[styles.accountLabel, { color: theme.colors.onSurface }]}
                  >
                    {account.label}
                  </Text>
                )}
              </View>
              <Button
                mode="text"
                onPress={account.onLogOut}
                compact
                style={styles.cta}
                contentStyle={styles.logInContent}
                labelStyle={styles.ctaLabel}
                accessibilityRole="button"
                accessibilityLabel="Log out"
              >
                Log out
              </Button>
            </>
          ) : (
            <>
              {/* Text button with a slim hit area so brand mark, toggle and both
                  actions still fit one row on the narrowest phones. */}
              <Button
                mode="text"
                onPress={() => router.push('/login')}
                compact
                style={styles.cta}
                contentStyle={styles.logInContent}
                labelStyle={styles.ctaLabel}
                accessibilityRole="button"
                accessibilityLabel="Log in to Shopping Analysis"
              >
                Log in
              </Button>
              <Button
                mode="contained"
                onPress={notifyGetStarted}
                compact={isCompact}
                style={styles.cta}
                contentStyle={styles.ctaContent}
                labelStyle={styles.ctaLabel}
                accessibilityRole="button"
                accessibilityLabel="Get started with Shopping Analysis"
              >
                Get started
              </Button>
            </>
          )}
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.xs,
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    flexShrink: 1,
    maxWidth: 220,
  },
  accountLabel: {
    flexShrink: 1,
  },
  cta: {
    borderRadius: radius.pill,
  },
  ctaContent: {
    height: layout.minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  logInContent: {
    height: layout.minTouchTarget,
    paddingHorizontal: spacing.xs,
  },
  ctaLabel: {
    marginHorizontal: spacing.xs,
  },
});
