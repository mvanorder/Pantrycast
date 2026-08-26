import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, useAppTheme } from '@/theme';
import { HomeHeader } from './components/HomeHeader';
import { KpiRow, KpiRowSkeleton } from './components/KpiRow';
import { ProjectedShoppingList, ProjectedShoppingListSkeleton } from './components/ProjectedListPanel';
import { SECTION_HEADER_HEIGHT, SectionHeader } from './components/SectionHeader';
import { TrendingItemCard, TrendingItemSkeleton } from './components/TrendingItemCard';
import { SAMPLE_HOME_DATA, type Period } from './data/sampleHome';
import { HomeEmptyState } from './states/HomeEmptyState';
import { HomeErrorState } from './states/HomeErrorState';

export type HomeViewState = 'loaded' | 'loading' | 'empty' | 'error';

type Props = {
  /**
   * Which of the four designed states to render. There is no analysis endpoint
   * to fetch from yet, so this is a prop rather than the output of a data hook;
   * swapping in `const { state, data } = useHomeSummary()` later shouldn't
   * require touching anything below.
   */
  state?: HomeViewState;
  onRetry?: () => void;
};

const SUBTITLE: Record<HomeViewState, string> = {
  loaded: 'Here’s what’s trending in your home',
  loading: 'Crunching your recent orders…',
  empty: 'Let’s get your order history in',
  error: 'We hit a snag loading your data',
};

export function HomeScreen({ state = 'loaded', onRetry }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>('month');

  const twoColumn = width >= layout.twoColumnBreakpoint;
  const data = SAMPLE_HOME_DATA[period];

  const gutter = theme.spacing.lg;
  const contentStyle = {
    width: '100%' as const,
    maxWidth: layout.maxContentWidth,
    gap: theme.spacing.xl,
  };
  // `flex: 1` only means "share the row" in the two-column layout; when the
  // panels stack it would fight the column's intrinsic height.
  const columnStyle = twoColumn ? styles.column : styles.columnStacked;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <HomeHeader
        subtitle={SUBTITLE[state]}
        period={state === 'loaded' ? period : undefined}
        onPeriodChange={state === 'loaded' ? setPeriod : undefined}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: gutter,
            paddingTop: theme.spacing.xl,
            paddingBottom: insets.bottom + theme.spacing.xxl,
          },
        ]}>
        <View style={contentStyle}>
          {state === 'loaded' ? (
            <>
              <KpiRow kpis={data.kpis} />

              <View style={[twoColumn ? styles.columns : styles.stack, { gap: theme.spacing.xl }]}>
                <View style={columnStyle}>
                  <SectionHeader
                    title="Trending consumables"
                    actionLabel="See all"
                    // Stub: the trends screen doesn't exist yet.
                    onActionPress={() => {}}
                  />
                  <View style={{ gap: theme.spacing.md }}>
                    {data.trending.map((item) => (
                      <TrendingItemCard key={item.id} item={item} onPress={() => {}} />
                    ))}
                  </View>
                </View>

                <View style={columnStyle}>
                  {/* Spacer keeps the panel's top edge aligned with the first
                      trending card when the two columns sit side by side. */}
                  {twoColumn ? <View style={{ height: SECTION_HEADER_HEIGHT }} /> : null}
                  <ProjectedShoppingList items={data.trending} onViewFullList={() => {}} />
                </View>
              </View>
            </>
          ) : null}

          {state === 'loading' ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Loading your dashboard"
              style={{ gap: theme.spacing.xl }}>
              <KpiRowSkeleton />
              <View style={[twoColumn ? styles.columns : styles.stack, { gap: theme.spacing.xl }]}>
                <View style={columnStyle}>
                  <SectionHeader title="Trending consumables" />
                  <View style={{ gap: theme.spacing.md }}>
                    {[0, 1, 2, 3].map((index) => (
                      <TrendingItemSkeleton key={index} />
                    ))}
                  </View>
                </View>
                <View style={columnStyle}>
                  {twoColumn ? <View style={{ height: SECTION_HEADER_HEIGHT }} /> : null}
                  <ProjectedShoppingListSkeleton />
                </View>
              </View>
            </View>
          ) : null}

          {state === 'empty' ? <HomeEmptyState /> : null}
          {state === 'error' ? <HomeErrorState onRetry={onRetry} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    // Without an explicit width the web scroll container shrink-wraps to its
    // widest child, which breaks the percentage widths inside it.
    width: '100%',
  },
  stack: {
    flexDirection: 'column',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
    minWidth: 0,
  },
  columnStacked: {
    width: '100%',
  },
});
