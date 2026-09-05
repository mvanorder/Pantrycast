import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Text } from 'react-native-paper';

import { Skeleton } from '@/components/Skeleton';
import { layout, useAppTheme } from '@/theme';
import type { Kpi } from '../data/sampleDashboard';

type Props = {
  kpis: Kpi[];
};

/**
 * Three equal-width metric cards. Paper `Card` (outlined) gives us the surface,
 * radius and elevation tokens for free and keeps these visually identical to
 * every other card on the screen.
 */
export function KpiRow({ kpis }: Props) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < layout.compactBreakpoint;

  return (
    <View style={[styles.row, { gap: theme.spacing.sm }]}>
      {kpis.map((kpi) => (
        <Card key={kpi.id} mode="outlined" style={styles.card} accessible accessibilityLabel={kpi.accessibilityLabel}>
          <Card.Content style={[styles.content, { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md }]}>
            <Text variant="labelMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
              {kpi.label}
            </Text>
            <Text
              variant={compact ? 'titleMedium' : 'headlineSmall'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.value, { color: theme.colors.onSurface, marginTop: theme.spacing.xs }]}>
              {kpi.value}
            </Text>
            <Text
              variant="labelSmall"
              numberOfLines={2}
              style={{
                color: kpi.tone === 'success' ? theme.colors.success : theme.colors.onSurfaceVariant,
                marginTop: theme.spacing.xs,
              }}>
              {kpi.caption}
            </Text>
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}

/** Loading twin of `KpiRow` — same card geometry so nothing jumps on load. */
export function KpiRowSkeleton() {
  const theme = useAppTheme();

  return (
    <View style={[styles.row, { gap: theme.spacing.sm }]} accessibilityLabel="Loading key figures">
      {[0, 1, 2].map((index) => (
        <Card key={index} mode="outlined" style={styles.card}>
          <Card.Content style={[styles.content, { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md }]}>
            <Skeleton width="60%" height={12} />
            <Skeleton width="85%" height={24} style={{ marginTop: theme.spacing.sm }} />
            <Skeleton width="70%" height={10} style={{ marginTop: theme.spacing.sm }} />
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  card: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    minHeight: 92,
  },
  value: {
    fontWeight: '700',
  },
});
