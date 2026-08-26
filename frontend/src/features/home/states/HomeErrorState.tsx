import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';

import { useAppTheme } from '@/theme';

type Props = {
  message?: string;
  onRetry?: () => void;
};

/** Fetch-failed state: says what broke, offers one obvious way forward. */
export function HomeErrorState({ message, onRetry }: Props) {
  const theme = useAppTheme();

  return (
    <Card mode="outlined">
      <Card.Content
        style={{ padding: theme.spacing.xl, alignItems: 'center' }}
        accessibilityLiveRegion="polite">
        <View
          style={[styles.art, { backgroundColor: theme.colors.errorContainer, borderRadius: theme.radius.pill }]}>
          <MaterialCommunityIcons name="cloud-off-outline" size={32} color={theme.colors.onErrorContainer} />
        </View>
        <Text
          variant="titleMedium"
          accessibilityRole="header"
          style={[styles.centered, { color: theme.colors.onSurface, marginTop: theme.spacing.lg }]}>
          We couldn’t load your dashboard
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.centered, { color: theme.colors.onSurfaceVariant, marginTop: theme.spacing.sm }]}>
          {message ?? 'Something went wrong reaching the server. Your data is safe — this is just this screen.'}
        </Text>
      </Card.Content>
      <Card.Actions style={[styles.actions, { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xl }]}>
        <Button
          mode="contained"
          icon="refresh"
          onPress={onRetry}
          accessibilityLabel="Try loading the dashboard again"
          style={styles.grow}
          contentStyle={styles.buttonContent}>
          Try again
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  art: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
    maxWidth: 420,
  },
  actions: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  grow: {
    alignSelf: 'stretch',
  },
  buttonContent: {
    height: 48,
  },
});
