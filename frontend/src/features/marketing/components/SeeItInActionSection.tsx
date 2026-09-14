import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { heading, layout, spacing, useAppTheme, useResponsive } from '@/theme';

import { CtaButton } from './CtaButton';
import { DashboardPreview } from './DashboardPreview';
import { PHONE_FRAME_STATUS_BAR, PhoneFrame } from './PhoneFrame';
import { Section } from './Section';

type SeeItInActionSectionProps = {
  onGetStarted: () => void;
};

export function SeeItInActionSection({ onGetStarted }: SeeItInActionSectionProps) {
  const theme = useAppTheme();
  const { isCompact, isExpanded, showDeviceFrame } = useResponsive();

  const preview = showDeviceFrame ? (
    <PhoneFrame>
      <DashboardPreview
        rounded={false}
        elevated={false}
        topInset={PHONE_FRAME_STATUS_BAR}
      />
    </PhoneFrame>
  ) : (
    <View style={styles.plainPreview}>
      <DashboardPreview />
    </View>
  );

  return (
    <Section>
      <View style={[styles.layout, isExpanded ? styles.layoutRow : styles.layoutStacked]}>
        <View style={[styles.copy, isExpanded && styles.copyInRow]}>
          <Text
            {...heading(2)}
            variant={isExpanded ? 'headlineLarge' : 'headlineMedium'}
            style={{ color: theme.colors.onSurface }}
          >
            A live look at your trends.
          </Text>
          <Text
            variant="bodyLarge"
            style={[
              styles.body,
              {
                color: theme.colors.onSurfaceVariant,
                fontSize: isCompact ? 16 : 17,
                lineHeight: isCompact ? 26 : 28,
              },
            ]}
          >
            Once your history is in, your home screen shows exactly what Pantrycast
            noticed — cadence, next-due dates, and a shopping list built from your
            own habits, not guesswork.
          </Text>
          <CtaButton
            label="Get started free"
            onPress={onGetStarted}
            accessibilityLabel="Get started free with Pantrycast"
            style={[styles.cta, isCompact && styles.ctaStretched]}
          />
        </View>

        <View style={[styles.previewColumn, isExpanded && styles.previewColumnInRow]}>
          {preview}
          <Text
            variant="labelSmall"
            style={[styles.caption, { color: theme.colors.onSurfaceVariant }]}
          >
            Example preview — your own history fills this in.
          </Text>
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  layout: {
    gap: spacing.xl,
  },
  layoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  layoutStacked: {
    flexDirection: 'column',
  },
  copy: {
    maxWidth: layout.maxProseWidth,
  },
  copyInRow: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  body: {
    marginTop: spacing.sm,
  },
  cta: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
  },
  ctaStretched: {
    alignSelf: 'stretch',
  },
  previewColumn: {
    alignItems: 'center',
    gap: spacing.md,
  },
  previewColumnInRow: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  plainPreview: {
    width: '100%',
    maxWidth: 380,
  },
  caption: {
    textAlign: 'center',
  },
});
