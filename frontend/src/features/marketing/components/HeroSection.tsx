import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { heading, spacing, useAppTheme, useResponsive } from '@/theme';

import { CtaButton } from './CtaButton';
import { Section } from './Section';

type HeroSectionProps = {
  onGetStarted: () => void;
  onSeeHowItWorks: () => void;
};

export function HeroSection({ onGetStarted, onSeeHowItWorks }: HeroSectionProps) {
  const theme = useAppTheme();
  const { isCompact, isExpanded } = useResponsive();

  const headlineVariant = isExpanded
    ? 'displayLarge'
    : isCompact
      ? 'displaySmall'
      : 'displayMedium';

  return (
    <Section density={isCompact ? 1.25 : 1.5} contentStyle={styles.content}>
      <Text
        variant="labelMedium"
        style={[styles.eyebrow, { color: theme.colors.primary }]}
      >
        PERSONAL SHOPPING INTELLIGENCE
      </Text>

      <Text
        {...heading(1)}
        variant={headlineVariant}
        style={[styles.headline, { color: theme.colors.onSurface }]}
      >
        Know what you&apos;ll need before you run out.
      </Text>

      <Text
        variant="bodyLarge"
        style={[
          styles.subhead,
          {
            color: theme.colors.onSurfaceVariant,
            fontSize: isCompact ? 16 : 18,
            lineHeight: isCompact ? 26 : 30,
          },
        ]}
      >
        Pantrycast reads your own order history and quietly learns how often
        you rebuy the things you always need — so it can tell you what&apos;s coming
        next.
      </Text>

      <View style={[styles.actions, isCompact && styles.actionsStacked]}>
        <CtaButton
          label="Get started free"
          onPress={onGetStarted}
          accessibilityLabel="Get started free with Pantrycast"
          style={isCompact ? styles.fullWidthAction : undefined}
        />
        <CtaButton
          label="See how it works"
          variant="text"
          icon="arrow-down"
          iconTrailing
          onPress={onSeeHowItWorks}
          accessibilityLabel="See how it works"
          accessibilityHint="Scrolls down to the three-step explanation"
          style={styles.secondaryAction}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  eyebrow: {
    textAlign: 'center',
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  headline: {
    textAlign: 'center',
    maxWidth: 820,
  },
  subhead: {
    textAlign: 'center',
    maxWidth: 620,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionsStacked: {
    flexDirection: 'column',
    alignSelf: 'stretch',
    // Wrapping only makes sense in the row variant. Left on in a column, the
    // single flex line shrinks to the widest child and `alignSelf` on the
    // children resolves against that line instead of the full width.
    flexWrap: 'nowrap',
  },
  fullWidthAction: {
    alignSelf: 'stretch',
  },
  // Explicit rather than relying on the row's `alignItems`, which does not
  // centre reliably once the row wraps into the stacked (column) variant.
  secondaryAction: {
    alignSelf: 'center',
  },
});
