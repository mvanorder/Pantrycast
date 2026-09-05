import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { radius, spacing, useAppTheme } from '@/theme';

type BrandMarkProps = {
  /** Hide the wordmark — the top bar drops it on compact widths so the row fits. */
  showWordmark?: boolean;
};

/**
 * Logo lockup: a rounded-square cart glyph plus the wordmark. Treated as a
 * single image for assistive tech so it is announced once, as "Shopping
 * Analysis", rather than as a stray icon followed by text.
 */
export function BrandMark({ showWordmark = true }: BrandMarkProps) {
  const theme = useAppTheme();

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Shopping Analysis"
      style={styles.container}
    >
      <View
        // Decorative fill only - no text sits on it, so the brighter splash
        // blue is safe here.
        style={[styles.mark, { backgroundColor: theme.colors.primaryBright }]}
      >
        <Icon source="cart-outline" size={22} color={theme.colors.onPrimary} />
      </View>
      {showWordmark ? (
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
          Shopping Analysis
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
