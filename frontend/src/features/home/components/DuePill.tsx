import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useAppTheme } from '@/theme';
import { DUE_SOON_DAYS } from '../data/sampleHome';

type Props = {
  label: string;
  dueInDays: number;
};

/**
 * Status pill for a projected run-out date. Amber = needs attention within
 * `DUE_SOON_DAYS`, neutral grey otherwise. Both pairs are container/on-container
 * colours from the theme (6.9:1 and 6.4:1), so the text is legible without
 * relying on the pill colour alone to carry the meaning — the label still says
 * "in 2 days".
 */
export function DuePill({ label, dueInDays }: Props) {
  const theme = useAppTheme();
  const soon = dueInDays <= DUE_SOON_DAYS;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: soon ? theme.colors.warningContainer : theme.colors.neutralContainer,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        },
      ]}>
      <Text
        variant="labelSmall"
        numberOfLines={1}
        style={{ color: soon ? theme.colors.onWarningContainer : theme.colors.onNeutralContainer }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
  },
});
