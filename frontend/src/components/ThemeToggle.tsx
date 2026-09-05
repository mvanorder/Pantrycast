import { StyleSheet, View } from 'react-native';
import { Icon, Text, TouchableRipple } from 'react-native-paper';

import { layout, radius, spacing, useAppTheme, useThemePreference } from '@/theme';

const SCHEME_ICON = {
  light: 'weather-sunny',
  dark: 'weather-night',
} as const;

/**
 * Theme control for the top bar. Cycles `system -> ... -> system` (see
 * `useThemePreference().cycle`). The icon always shows the scheme in effect
 * right now; in `system` mode an "Auto" tag sits beside it so it's clear the
 * app is following the OS - the icon draws the eye to *which* theme that is,
 * the tag keeps the "system default" fact visible.
 */
export function ThemeToggle() {
  const theme = useAppTheme();
  const { mode, scheme, cycle } = useThemePreference();
  const isSystem = mode === 'system';

  const schemeName = scheme === 'dark' ? 'dark' : 'light';
  const accessibilityLabel = isSystem
    ? `Theme: system default (${schemeName})`
    : `Theme: ${schemeName}`;

  return (
    <TouchableRipple
      onPress={cycle}
      borderless
      style={[
        styles.button,
        isSystem && {
          backgroundColor: theme.colors.surfaceVariant,
          borderColor: theme.colors.outline,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Cycles between system, light and dark themes"
    >
      <View style={styles.content}>
        <Icon source={SCHEME_ICON[schemeName]} size={20} color={theme.colors.onSurface} />
        {isSystem ? (
          <Text
            variant="labelSmall"
            style={[styles.autoTag, { color: theme.colors.onSurfaceVariant }]}
          >
            Auto
          </Text>
        ) : null}
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  autoTag: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
