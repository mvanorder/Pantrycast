import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { layout, spacing, useAppTheme } from '@/theme';

/**
 * Row min-height + bottom margin, so a sibling column can reserve the same
 * vertical space and stay aligned. Derived from the same tokens the style uses
 * so the two can't drift.
 */
export const SECTION_HEADER_HEIGHT = layout.minTouchTarget + spacing.sm;

type Props = {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

/** Section title with an optional trailing text action ("See all"). */
export function SectionHeader({ title, actionLabel, onActionPress }: Props) {
  const theme = useAppTheme();

  return (
    <View style={[styles.row, { marginBottom: theme.spacing.sm }]}>
      <Text variant="titleMedium" accessibilityRole="header" style={{ color: theme.colors.onSurface }}>
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Button
          mode="text"
          compact
          onPress={onActionPress}
          accessibilityLabel={`${actionLabel} ${title.toLowerCase()}`}
          contentStyle={styles.actionContent}
          labelStyle={styles.actionLabel}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouchTarget,
  },
  actionContent: {
    height: layout.minTouchTarget,
    paddingHorizontal: spacing.xxs,
  },
  actionLabel: {
    marginVertical: 0,
  },
});
