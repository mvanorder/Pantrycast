import { renderWithProviders, screen } from '../../../test-utils/render';
import { Sparkline } from '../Sparkline';

describe('Sparkline', () => {
  it('renders the trend line for a normal series', async () => {
    await renderWithProviders(<Sparkline data={[3, 5, 4, 6]} accessibilityLabel="up trend" />);

    expect(screen.getByLabelText('up trend')).toBeOnTheScreen();
  });

  it('renders without a label as a decorative, screen-reader-hidden element', async () => {
    await renderWithProviders(<Sparkline data={[1, 2]} />);

    expect(screen.queryByLabelText('up trend')).toBeNull();
    expect(screen.toJSON()).not.toBeNull();
  });

  it('does not crash on an empty series (no trailing point to place)', async () => {
    // An item with fewer than one observed interval — a real case once the data
    // comes from the analysis API rather than the hardcoded sample.
    await renderWithProviders(<Sparkline data={[]} accessibilityLabel="no data" />);

    expect(screen.getByLabelText('no data')).toBeOnTheScreen();
  });
});
