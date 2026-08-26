import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Card, Text, TouchableRipple } from 'react-native-paper';

import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { useAppTheme } from '@/theme';
import type { TrendingItem } from '../data/sampleHome';
import { DuePill } from './DuePill';

type Props = {
  item: TrendingItem;
  onPress?: () => void;
};

/**
 * One consumable: tinted icon, name + pack size, cadence caption, sparkline and
 * a due pill. The whole row is one touch target (>=44pt tall) that will later
 * drill into the item's purchase history.
 */
export function TrendingItemCard({ item, onPress }: Props) {
  const theme = useAppTheme();

  return (
    <Card mode="outlined" style={styles.card}>
      <TouchableRipple
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.packSize}. ${item.cadence}. Due ${item.dueLabel}.`}
        accessibilityHint="Opens purchase history"
        borderless={false}
        style={[styles.ripple, { borderRadius: theme.roundness * 4, padding: theme.spacing.md }]}>
        <View style={[styles.row, { gap: theme.spacing.md }]}>
          <View
            style={[
              styles.iconWell,
              { backgroundColor: theme.colors.primaryContainer, borderRadius: theme.radius.pill },
            ]}>
            <MaterialCommunityIcons name={item.icon} size={22} color={theme.colors.onPrimaryContainer} />
          </View>

          <View style={styles.body}>
            <Text variant="titleSmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
              {item.name}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {`  ·  ${item.packSize}`}
              </Text>
            </Text>
            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
              {item.cadence}
            </Text>
          </View>

          <View style={[styles.trailing, { gap: theme.spacing.xs }]}>
            <Sparkline data={item.history} />
            <DuePill label={item.dueLabel} dueInDays={item.dueInDays} />
          </View>
        </View>
      </TouchableRipple>
    </Card>
  );
}

/** Loading twin of `TrendingItemCard`. */
export function TrendingItemSkeleton() {
  const theme = useAppTheme();

  return (
    <Card mode="outlined" style={styles.card}>
      <View style={[styles.row, { padding: theme.spacing.md, gap: theme.spacing.md }]}>
        <Skeleton width={40} height={40} radius={theme.radius.pill} />
        <View style={styles.body}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="35%" height={11} style={{ marginTop: theme.spacing.sm }} />
        </View>
        <View style={[styles.trailing, { gap: theme.spacing.xs }]}>
          <Skeleton width={56} height={22} />
          <Skeleton width={64} height={18} radius={theme.radius.pill} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  ripple: {
    minHeight: 64,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  trailing: {
    alignItems: 'flex-end',
  },
});
