import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Divider, Text } from 'react-native-paper';

import { useAppTheme } from '@/theme';

type Props = {
  onUpload?: () => void;
  onLearnMore?: () => void;
};

const STEPS: { icon: 'download-outline' | 'file-delimited-outline' | 'chart-line'; text: string }[] = [
  { icon: 'download-outline', text: 'Export your order history from Walmart' },
  { icon: 'file-delimited-outline', text: 'Upload the CSV here' },
  { icon: 'chart-line', text: 'See what you buy, how often, and what’s next' },
];

/**
 * First-run state — what a real user sees today, because CSV upload is the only
 * thing the backend actually supports (`POST /orders/upload`). One primary
 * action, plus a low-emphasis "how do I export" escape hatch.
 */
export function HomeEmptyState({ onUpload, onLearnMore }: Props) {
  const theme = useAppTheme();

  return (
    <Card mode="outlined">
      <Card.Content style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
        <View
          style={[
            styles.art,
            { backgroundColor: theme.colors.primaryContainer, borderRadius: theme.radius.pill },
          ]}>
          <MaterialCommunityIcons name="cart-outline" size={40} color={theme.colors.onPrimaryContainer} />
        </View>

        <Text
          variant="titleLarge"
          accessibilityRole="header"
          style={[styles.centered, { color: theme.colors.onSurface, marginTop: theme.spacing.lg }]}>
          No order history yet
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.centered, { color: theme.colors.onSurfaceVariant, marginTop: theme.spacing.sm }]}>
          Upload a Walmart order export and we’ll work out what you buy on repeat, how often you run out, and
          what belongs on your next list.
        </Text>

        <Divider style={{ alignSelf: 'stretch', marginVertical: theme.spacing.xl }} />

        <View style={[styles.steps, { gap: theme.spacing.md }]}>
          {STEPS.map((step, index) => (
            <View key={step.icon} style={[styles.step, { gap: theme.spacing.md }]}>
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.pill },
                ]}>
                <MaterialCommunityIcons name={step.icon} size={18} color={theme.colors.onSurfaceVariant} />
              </View>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
                {`${index + 1}. ${step.text}`}
              </Text>
            </View>
          ))}
        </View>
      </Card.Content>

      <Card.Actions style={[styles.actions, { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xl }]}>
        <Button
          mode="contained"
          icon="tray-arrow-up"
          onPress={onUpload}
          accessibilityLabel="Upload order history CSV"
          style={styles.grow}
          contentStyle={styles.buttonContent}>
          Upload order history
        </Button>
        <Button
          mode="text"
          onPress={onLearnMore}
          accessibilityLabel="Learn how to export your orders from Walmart"
          style={styles.grow}
          contentStyle={styles.buttonContent}>
          How do I export my orders?
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  art: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
    maxWidth: 420,
  },
  steps: {
    alignSelf: 'stretch',
    maxWidth: 420,
    width: '100%',
    alignItems: 'flex-start',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  stepIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  grow: {
    alignSelf: 'stretch',
  },
  buttonContent: {
    height: 48,
  },
});
