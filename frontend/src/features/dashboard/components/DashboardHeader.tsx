import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, useAppTheme } from '@/theme';
import { PERIOD_OPTIONS, type Period } from '../data/sampleDashboard';

type Props = {
  subtitle: string;
  period?: Period;
  onPeriodChange?: (period: Period) => void;
};

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Brand band at the top of the dashboard: eyebrow, time-of-day greeting, subtitle and an
 * optional period toggle. Stays fixed above the scroll area so the period
 * filter is always reachable. Rounded bottom corners tie it to the card stack
 * below.
 *
 * The toggle is a radio group, not a set of buttons: exactly one period is
 * always active, which is what `radio` semantics describe to a screen reader.
 */
export function DashboardHeader({ subtitle, period, onPeriodChange }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const greeting = greetingForHour(new Date().getHours());

  return (
    <View
      style={[
        styles.band,
        {
          backgroundColor: theme.colors.headerBackground,
          paddingTop: insets.top + theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          borderBottomLeftRadius: theme.radius.xl,
          borderBottomRightRadius: theme.radius.xl,
        },
      ]}>
      <View style={[styles.inner, { maxWidth: layout.maxContentWidth }]}>
        <Text
          variant="labelSmall"
          accessibilityRole="header"
          style={[styles.eyebrow, { color: theme.colors.onHeader }]}>
          SHOPPING ANALYSIS
        </Text>
        <Text
          variant="headlineMedium"
          style={[styles.greeting, { color: theme.colors.onHeader, marginTop: theme.spacing.xs }]}>
          {greeting}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onHeader, marginTop: theme.spacing.xs }}>
          {subtitle}
        </Text>

        {period && onPeriodChange ? (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Reporting period"
            style={[styles.toggle, { marginTop: theme.spacing.lg, gap: theme.spacing.sm }]}>
            {PERIOD_OPTIONS.map((option) => {
              const selected = option.value === period;
              return (
                <TouchableRipple
                  key={option.value}
                  onPress={() => onPeriodChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={option.label}
                  style={[
                    styles.chip,
                    {
                      minHeight: layout.minTouchTarget,
                      paddingHorizontal: theme.spacing.lg,
                      borderRadius: theme.radius.pill,
                      backgroundColor: selected ? theme.colors.onHeader : 'transparent',
                      borderColor: theme.colors.onHeader,
                    },
                  ]}>
                  <Text
                    variant="labelLarge"
                    style={{ color: selected ? theme.colors.headerBackground : theme.colors.onHeader }}>
                    {option.label}
                  </Text>
                </TouchableRipple>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    alignItems: 'center',
    width: '100%',
  },
  inner: {
    width: '100%',
  },
  eyebrow: {
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  greeting: {
    fontWeight: '700',
  },
  toggle: {
    flexDirection: 'row',
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
