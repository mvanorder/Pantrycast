import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Card, Icon, Text } from 'react-native-paper';

import { heading, radius, spacing, useAppTheme, useResponsive } from '@/theme';

import { Section } from './Section';

type Step = {
  icon: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: 'file-upload-outline',
    title: '1. Upload your order history',
    body: 'Export your Walmart order history and upload it — no manual entry.',
  },
  {
    icon: 'chart-bar',
    title: '2. We detect your patterns',
    body: 'Pantrycast tracks how often you rebuy the things you always need.',
  },
  {
    icon: 'clipboard-check-outline',
    title: '3. Get a projected list',
    body: 'See what’s likely running low, before you notice it yourself.',
  },
];

type HowItWorksSectionProps = {
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function HowItWorksSection({ onLayout }: HowItWorksSectionProps) {
  const theme = useAppTheme();
  const { isCompact, isExpanded } = useResponsive();

  return (
    <Section onLayout={onLayout} background={theme.colors.surface}>
      <Text
        {...heading(2)}
        variant={isExpanded ? 'headlineLarge' : 'headlineMedium'}
        style={[styles.heading, { color: theme.colors.onSurface }]}
      >
        How it works
      </Text>
      <Text
        variant="bodyLarge"
        style={[styles.subheading, { color: theme.colors.onSurfaceVariant }]}
      >
        Three steps from data to peace of mind.
      </Text>

      <View style={[styles.steps, isCompact ? styles.stepsStacked : styles.stepsRow]}>
        {STEPS.map((step) => (
          <Card
            key={step.title}
            mode="outlined"
            style={isCompact ? undefined : styles.cardInRow}
          >
            <Card.Content style={styles.cardContent}>
              <View
                style={[
                  styles.iconTile,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Icon source={step.icon} size={26} color={theme.colors.primary} />
              </View>
              <Text
                {...heading(3)}
                variant="titleMedium"
                style={[styles.stepTitle, { color: theme.colors.onSurface }]}
              >
                {step.title}
              </Text>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {step.body}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  heading: {
    textAlign: 'center',
  },
  subheading: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  steps: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  stepsStacked: {
    flexDirection: 'column',
  },
  cardInRow: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  cardContent: {
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stepTitle: {
    marginTop: spacing.xxs,
  },
});
