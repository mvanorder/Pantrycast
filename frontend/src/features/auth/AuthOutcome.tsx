import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { heading, layout, radius, spacing, useAppTheme } from '@/theme';

/** One full-width button in an {@link AuthOutcome}'s action stack. */
export type AuthOutcomeAction = {
  label: string;
  onPress: () => void;
  /** Paper button variant. Defaults to `contained` — give secondary actions `outlined` or `text`. */
  mode?: 'contained' | 'outlined' | 'text';
  /** Greys the button out and swallows presses (e.g. while the session is still being restored). */
  disabled?: boolean;
};

type AuthOutcomeProps = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Picks the art's colour pair: the primary container for good news, the error container for bad. */
  tone: 'success' | 'error';
  title: string;
  body: string;
  /**
   * Rendered top to bottom. The first entry reads as the primary action, so
   * it should be the `contained` one and the rest `outlined`/`text` — one
   * obvious next step per settled screen.
   */
  actions: AuthOutcomeAction[];
};

/**
 * The settled state of an auth screen: a round icon, a headline, one line of
 * explanation, and a stack of next steps.
 *
 * Shared by every auth screen that ends in a dead end rather than a
 * navigation — email verification, a requested reset link, a completed or
 * failed reset — so "we're done here, do this next" looks and reads the same
 * wherever a user lands on it.
 */
export function AuthOutcome({ icon, tone, title, body, actions }: AuthOutcomeProps) {
  const theme = useAppTheme();

  const iconBackground =
    tone === 'success' ? theme.colors.primaryContainer : theme.colors.errorContainer;
  const iconColor =
    tone === 'success' ? theme.colors.onPrimaryContainer : theme.colors.onErrorContainer;

  return (
    <View style={styles.section}>
      <View style={[styles.art, { backgroundColor: iconBackground }]}>
        <MaterialCommunityIcons name={icon} size={32} color={iconColor} />
      </View>
      <Text
        {...heading(1)}
        variant="headlineMedium"
        style={[styles.title, { color: theme.colors.onSurface }]}
      >
        {title}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
      >
        {body}
      </Text>
      {actions.map((action) => (
        <Button
          key={action.label}
          mode={action.mode ?? 'contained'}
          onPress={action.onPress}
          disabled={action.disabled}
          style={styles.action}
          contentStyle={styles.actionContent}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          {action.label}
        </Button>
      ))}
    </View>
  );
}

type LiveAnnouncementProps = {
  testID: string;
  /** Empty until there is something to announce. */
  message: string;
};

/**
 * A visually hidden, always-mounted polite live region.
 *
 * `accessibilityLiveRegion` only reliably announces a *change* to an
 * already-present region's content — not a region that appears at the same
 * moment its content does, which is what putting it on an {@link AuthOutcome}
 * directly would do (settling unmounts the form or spinner and mounts the
 * outcome). So mount this from the very first render with an empty `message`
 * and fill it once the screen settles; the visible copy stays plain, non-live
 * text so it isn't announced a second time.
 */
export function LiveAnnouncement({ testID, message }: LiveAnnouncementProps) {
  return (
    <Text testID={testID} accessibilityLiveRegion="polite" style={styles.srOnly}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: {
    alignItems: 'center',
  },
  art: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 360,
  },
  action: {
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  actionContent: {
    height: layout.minTouchTarget,
  },
  // Present in the accessibility tree (so `accessibilityLiveRegion` can
  // announce it) but not visible or laid out for sighted users — the
  // standard "visually hidden" shape.
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
});
