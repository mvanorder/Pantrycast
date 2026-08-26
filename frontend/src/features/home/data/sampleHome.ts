/**
 * SAMPLE DATA — placeholder for an analysis pipeline that does not exist yet.
 *
 * The backend currently only accepts a raw CSV upload (`POST /orders/upload`);
 * there is no trend-detection or shopping-list-projection endpoint to call. So
 * the Home screen renders these hand-written figures to show the intended
 * end state. When the real endpoints land, replace this module with a data
 * hook that returns the same shapes — the components below take these types as
 * props and know nothing about where the numbers come from.
 */
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type Period = 'month' | 'week';

export type Kpi = {
  id: string;
  label: string;
  value: string;
  caption: string;
  /** Renders the caption in the success tone (e.g. a spend delta). */
  tone?: 'neutral' | 'success';
  /** Spoken as one phrase by screen readers, since the visual grouping is lost. */
  accessibilityLabel: string;
};

export type TrendingItem = {
  id: string;
  name: string;
  packSize: string;
  icon: MaterialIconName;
  cadence: string;
  /** Days until we expect the household to run out. */
  dueInDays: number;
  dueLabel: string;
  /** Quantity we'd project onto the next list. */
  quantity: string;
  /** Recent purchase intervals/volume, oldest first — drives the sparkline. */
  history: number[];
};

export type HomeData = {
  kpis: Kpi[];
  trending: TrendingItem[];
};

/** A projected item is "due soon" (amber) at or under this many days. */
export const DUE_SOON_DAYS = 5;

const TRENDING: TrendingItem[] = [
  {
    id: 'milk',
    name: 'Milk',
    packSize: '1 gal',
    icon: 'bottle-soda-outline',
    cadence: 'Every ~7 days',
    dueInDays: 2,
    dueLabel: 'in 2 days',
    quantity: '1 gal',
    history: [6, 7, 6, 8, 7, 7, 6, 7],
  },
  {
    id: 'coffee',
    name: 'Coffee',
    packSize: '12 oz bag',
    icon: 'coffee-outline',
    cadence: 'Every ~3 weeks',
    dueInDays: 4,
    dueLabel: 'in 4 days',
    quantity: '1 bag',
    history: [18, 22, 20, 21, 19, 23, 21],
  },
  {
    id: 'paper-towels',
    name: 'Paper Towels',
    packSize: '6-roll',
    icon: 'paper-roll-outline',
    cadence: 'Every ~month',
    dueInDays: 5,
    dueLabel: 'in 5 days',
    quantity: '1 pack',
    history: [30, 28, 34, 29, 31, 30],
  },
  {
    id: 'detergent',
    name: 'Laundry Detergent',
    packSize: '64 oz',
    icon: 'washing-machine',
    cadence: 'Every ~5 weeks',
    dueInDays: 7,
    dueLabel: 'in 1 week',
    quantity: '1 bottle',
    history: [36, 33, 38, 35, 37, 34],
  },
];

export const SAMPLE_HOME_DATA: Record<Period, HomeData> = {
  month: {
    kpis: [
      {
        id: 'spend',
        label: 'Spend',
        value: '$342.18',
        caption: '+$18 vs last mo.',
        tone: 'success',
        accessibilityLabel: 'Spend this month, 342 dollars and 18 cents, up 18 dollars versus last month',
      },
      {
        id: 'orders',
        label: 'Orders',
        value: '9',
        caption: 'this month',
        accessibilityLabel: '9 orders this month',
      },
      {
        id: 'projected',
        label: 'Projected',
        value: '$365',
        caption: 'next month',
        accessibilityLabel: 'Projected spend next month, 365 dollars',
      },
    ],
    trending: TRENDING,
  },
  week: {
    kpis: [
      {
        id: 'spend',
        label: 'Spend',
        value: '$78.40',
        caption: '+$6 vs last wk.',
        tone: 'success',
        accessibilityLabel: 'Spend this week, 78 dollars and 40 cents, up 6 dollars versus last week',
      },
      {
        id: 'orders',
        label: 'Orders',
        value: '2',
        caption: 'this week',
        accessibilityLabel: '2 orders this week',
      },
      {
        id: 'projected',
        label: 'Projected',
        value: '$84',
        caption: 'next week',
        accessibilityLabel: 'Projected spend next week, 84 dollars',
      },
    ],
    trending: TRENDING,
  },
};

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'week', label: 'This week' },
];
