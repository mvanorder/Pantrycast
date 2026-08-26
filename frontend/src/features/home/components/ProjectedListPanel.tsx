import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Divider, Text } from 'react-native-paper';

import { Skeleton } from '@/components/Skeleton';
import { useAppTheme } from '@/theme';
import { DUE_SOON_DAYS, type TrendingItem } from '../data/sampleHome';

type Props = {
  items: TrendingItem[];
  onViewFullList?: () => void;
};

/**
 * The projected next shopping list: what we expect the household to need, in
 * run-out order. Rows are read-only here (the check circles are a preview of
 * the real list screen), so the panel has exactly one action — the outlined
 * "View full shopping list" button. The screen's single filled/primary action
 * lives elsewhere; this stays outlined so the hierarchy reads correctly.
 */
export function ProjectedShoppingList({ items, onViewFullList }: Props) {
  const theme = useAppTheme();
  const sorted = [...items].sort((a, b) => a.dueInDays - b.dueInDays);

  return (
    <Card mode="outlined">
      <Card.Content style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <View style={styles.headerRow}>
          <Text variant="titleMedium" accessibilityRole="header" style={{ color: theme.colors.onSurface }}>
            Projected shopping list
          </Text>
          <View
            style={[
              styles.countBadge,
              {
                backgroundColor: theme.colors.primaryContainer,
                borderRadius: theme.radius.pill,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 2,
              },
            ]}>
            <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer }}>
              {`${sorted.length} item${sorted.length === 1 ? '' : 's'}`}
            </Text>
          </View>
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: theme.spacing.xs }}>
          Based on your purchase patterns
        </Text>
      </Card.Content>

      <View style={{ marginTop: theme.spacing.md }}>
        {sorted.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <Divider style={{ marginLeft: 56 }} /> : null}
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${item.name}, ${item.quantity}, due ${item.dueLabel}`}
              style={[
                styles.itemRow,
                { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: theme.spacing.md },
              ]}>
              <MaterialCommunityIcons
                name="checkbox-blank-circle-outline"
                size={22}
                color={theme.colors.outline}
              />
              <View style={styles.itemBody}>
                <Text variant="bodyLarge" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
                  {item.name}
                </Text>
                <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.quantity}
                </Text>
              </View>
              <Text
                variant="labelMedium"
                style={{
                  color:
                    item.dueInDays <= DUE_SOON_DAYS ? theme.colors.warning : theme.colors.onSurfaceVariant,
                }}>
                {item.dueLabel}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Card.Actions style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
        <Button
          mode="outlined"
          onPress={onViewFullList}
          icon="format-list-checks"
          accessibilityLabel="View full shopping list"
          style={styles.fullWidthButton}
          contentStyle={styles.buttonContent}>
          View full shopping list
        </Button>
      </Card.Actions>
    </Card>
  );
}

/** Loading twin of `ProjectedShoppingList`. */
export function ProjectedShoppingListSkeleton() {
  const theme = useAppTheme();

  return (
    <Card mode="outlined">
      <Card.Content style={{ padding: theme.spacing.lg }}>
        <Skeleton width="65%" height={18} />
        <Skeleton width="45%" height={12} style={{ marginTop: theme.spacing.sm }} />
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={[styles.itemRow, { marginTop: theme.spacing.lg, gap: theme.spacing.md }]}>
            <Skeleton width={22} height={22} radius={theme.radius.pill} />
            <View style={styles.itemBody}>
              <Skeleton width="50%" height={14} />
            </View>
            <Skeleton width={56} height={12} />
          </View>
        ))}
        <Skeleton width="100%" height={44} radius={theme.radius.pill} style={{ marginTop: theme.spacing.xl }} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  countBadge: {
    alignSelf: 'flex-start',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  fullWidthButton: {
    flex: 1,
  },
  buttonContent: {
    height: 44,
  },
});
