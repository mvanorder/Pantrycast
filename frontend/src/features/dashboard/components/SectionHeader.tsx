import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { useAppTheme } from '@/theme';

/** Row height + bottom margin, so other columns can align to it. */
export const SECTION_HEADER_HEIGHT = 52;

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
    minHeight: 44,
  },
  actionContent: {
    height: 44,
    paddingHorizontal: 4,
  },
  actionLabel: {
    marginVertical: 0,
  },
});
