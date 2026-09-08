import { useWindowDimensions } from 'react-native';

import { act, fireEvent, renderWithProviders, screen } from '../../../../test-utils/render';
import { setViewport, resetViewport } from '../../../../test-utils/viewport';
import { Dashboard } from '../Dashboard';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

void useWindowDimensions;

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

afterEach(resetViewport);

describe('Dashboard', () => {
  it('renders KPIs, the trending list and the projected list in the loaded state', async () => {
    setViewport(1280);

    await renderWithProviders(<Dashboard state="loaded" />);

    expect(screen.getByText('Here’s what’s trending in your home')).toBeOnTheScreen();
    expect(screen.getByLabelText('9 orders this month')).toBeOnTheScreen();
    expect(screen.getByText('Milk')).toBeOnTheScreen();
    expect(screen.getByText('Projected shopping list')).toBeOnTheScreen();
  });

  it('swaps the figures when the reporting period toggle is used', async () => {
    setViewport(1280);

    await renderWithProviders(<Dashboard state="loaded" />);
    expect(screen.getByLabelText('9 orders this month')).toBeOnTheScreen();

    await press('This week');

    expect(screen.getByLabelText('2 orders this week')).toBeOnTheScreen();
    expect(screen.queryByLabelText('9 orders this month')).not.toBeOnTheScreen();
  });

  it('steps the KPI value type size down on a narrow viewport', async () => {
    // < layout.compactBreakpoint (400) — exercises KpiRow's compact branch.
    setViewport(360);

    await renderWithProviders(<Dashboard state="loaded" />);

    expect(screen.getByLabelText('9 orders this month')).toBeOnTheScreen();
  });

  it('renders the trending card as static content, not a button, with no drill-in yet', async () => {
    setViewport(1280);

    await renderWithProviders(<Dashboard state="loaded" />);

    // No `onPress` is wired until the item-history screen exists, so the row
    // must not claim a button role or announce "opens purchase history".
    expect(screen.getByLabelText('Milk, 1 gal. Every ~7 days. Due in 2 days.')).toBeOnTheScreen();
    expect(screen.queryByHintText('Opens purchase history')).toBeNull();
  });

  it('disables the "view full shopping list" action while that screen does not exist', async () => {
    setViewport(1280);

    await renderWithProviders(<Dashboard state="loaded" />);

    expect(screen.getByLabelText('View full shopping list')).toBeDisabled();
  });

  it('shows the labelled progress region and skeletons in the loading state', async () => {
    setViewport(1280);

    await renderWithProviders(<Dashboard state="loading" />);

    expect(screen.getByLabelText('Loading your dashboard')).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading key figures')).toBeOnTheScreen();
    expect(screen.getByText('Crunching your recent orders…')).toBeOnTheScreen();
  });

  it('stacks the two panels on a narrow viewport in the loading state', async () => {
    setViewport(400);

    await renderWithProviders(<Dashboard state="loading" />);

    expect(screen.getByLabelText('Loading your dashboard')).toBeOnTheScreen();
  });

  it('renders the empty state with its calls-to-action disabled until upload exists', async () => {
    setViewport(1280);

    await renderWithProviders(<Dashboard state="empty" />);

    expect(screen.getByText('No order history yet')).toBeOnTheScreen();
    expect(screen.getByLabelText('Upload order history CSV')).toBeDisabled();
    expect(
      screen.getByLabelText('Learn how to export your orders from Walmart'),
    ).toBeDisabled();
  });

  it('renders the error state and calls onRetry from "Try again"', async () => {
    setViewport(1280);
    const onRetry = jest.fn();

    await renderWithProviders(<Dashboard state="error" onRetry={onRetry} />);

    expect(screen.getByText('We couldn’t load your dashboard')).toBeOnTheScreen();
    await press('Try loading the dashboard again');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
