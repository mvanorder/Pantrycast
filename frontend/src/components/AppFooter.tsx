import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing, useAppTheme, useResponsive } from '@/theme';

/**
 * Global app footer: one tidy attribution band pinned below every route by
 * {@link AppShell}. Kept deliberately short - it is persistent chrome now, not
 * the tall closing section it used to be at the end of the landing page, so it
 * costs as little vertical space as it can while still reading as a footer.
 */
export function AppFooter() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          paddingLeft: gutter + insets.left,
          paddingRight: gutter + insets.right,
          paddingBottom: spacing.sm + insets.bottom,
        },
      ]}
    >
      <View style={styles.inner}>
        <Text
          variant="bodySmall"
          style={[styles.text, { color: theme.colors.onSurfaceVariant }]}
        >
          Shopping Analysis — a personal project for understanding your own shopping
          habits.
        </Text>
        <Text
          variant="bodySmall"
          style={[styles.text, { color: theme.colors.onSurfaceVariant }]}
        >
          © 2026 Malcolm VanOrder
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.sm,
    rowGap: spacing.xxs,
  },
  text: {
    textAlign: 'center',
  },
});
