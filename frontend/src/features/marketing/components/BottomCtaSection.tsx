import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { heading, spacing, useAppTheme, useResponsive } from '@/theme';

import { CtaButton } from './CtaButton';
import { Section } from './Section';

type BottomCtaSectionProps = {
  onGetStarted: () => void;
};

export function BottomCtaSection({ onGetStarted }: BottomCtaSectionProps) {
  const theme = useAppTheme();
  const { isCompact, isExpanded } = useResponsive();

  return (
    <Section background={theme.colors.primary} contentStyle={styles.content}>
      <Text
        {...heading(2)}
        variant={isExpanded ? 'headlineLarge' : 'headlineMedium'}
        style={[styles.heading, { color: theme.colors.onPrimary }]}
      >
        Ready to see your own patterns?
      </Text>
      <Text
        variant="bodyLarge"
        style={[styles.body, { color: theme.colors.onPrimary }]}
      >
        It takes a few minutes to upload your history and start seeing what&apos;s
        really going on.
      </Text>
      <CtaButton
        label="Get started free"
        variant="onPrimary"
        onPress={onGetStarted}
        accessibilityLabel="Get started free with Pantrycast"
        style={[styles.cta, isCompact && styles.ctaStretched]}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  heading: {
    textAlign: 'center',
    maxWidth: 640,
  },
  body: {
    textAlign: 'center',
    maxWidth: 520,
    marginTop: spacing.sm,
  },
  cta: {
    marginTop: spacing.lg,
  },
  ctaStretched: {
    alignSelf: 'stretch',
  },
});
