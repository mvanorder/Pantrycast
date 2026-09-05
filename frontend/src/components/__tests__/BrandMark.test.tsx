import { renderWithProviders, screen } from '../../../test-utils/render';
import { BrandMark } from '../BrandMark';

describe('BrandMark', () => {
  it('announces itself once as a single image for assistive tech', async () => {
    await renderWithProviders(<BrandMark />);

    expect(screen.getByLabelText('Shopping Analysis')).toBeOnTheScreen();
    expect(screen.getByText('Shopping Analysis')).toBeOnTheScreen();
  });

  it('can hide the wordmark', async () => {
    await renderWithProviders(<BrandMark showWordmark={false} />);

    expect(screen.getByLabelText('Shopping Analysis')).toBeOnTheScreen();
    expect(screen.queryByText('Shopping Analysis')).not.toBeOnTheScreen();
  });
});
