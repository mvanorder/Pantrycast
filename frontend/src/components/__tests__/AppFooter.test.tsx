import { renderWithProviders, screen } from '../../../test-utils/render';
import { AppFooter } from '../AppFooter';

describe('AppFooter', () => {
  it('renders the attribution and copyright lines', async () => {
    await renderWithProviders(<AppFooter />);

    expect(
      screen.getByText(/personal project for understanding your own shopping/i),
    ).toBeOnTheScreen();
    expect(screen.getByText(/© 2026 Malcolm VanOrder/)).toBeOnTheScreen();
  });
});
