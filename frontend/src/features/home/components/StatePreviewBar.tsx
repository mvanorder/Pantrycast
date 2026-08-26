import { StyleSheet } from 'react-native';
import { Surface, Text, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme';
import type { HomeViewState } from '../HomeScreen';

type Props = {
  state: HomeViewState;
  onChange: (state: HomeViewState) => void;
};

const STATES: HomeViewState[] = ['loaded', 'loading', 'empty', 'error'];

/**
 * DEV ONLY. Renders nothing in a production build. Lets a reviewer flip through
 * the four designed states without a data layer to fake.
 */
export function StatePreviewBar({ state, onChange }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  if (!__DEV__) return null;

  return (
    <Surface
      elevation={3}
      style={[
        styles.bar,
        {
          bottom: insets.bottom + theme.spacing.md,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          gap: theme.spacing.xs,
        },
      ]}>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 6 }}>
        DEV
      </Text>
      {STATES.map((option) => {
        const selected = option === state;
        return (
          <TouchableRipple
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Preview ${option} state`}
            style={[
              styles.chip,
              {
                borderRadius: theme.radius.pill,
                paddingHorizontal: theme.spacing.md,
                backgroundColor: selected ? theme.colors.primaryContainer : 'transparent',
              },
            ]}>
            <Text
              variant="labelMedium"
              style={{ color: selected ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}>
              {option}
            </Text>
          </TouchableRipple>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
