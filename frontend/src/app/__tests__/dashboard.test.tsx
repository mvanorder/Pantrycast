import { renderWithProviders, screen } from '../../../test-utils/render';

import DashboardRoute from '../dashboard';

describe('Dashboard route', () => {
  it('renders the loaded dashboard by default', async () => {
    await renderWithProviders(<DashboardRoute />);

    expect(screen.getByText('Here’s what’s trending in your home')).toBeTruthy();
  });
});
