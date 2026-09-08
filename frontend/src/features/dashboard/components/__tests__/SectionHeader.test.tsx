import { act, fireEvent, renderWithProviders, screen } from '../../../../../test-utils/render';
import { SECTION_HEADER_HEIGHT, SectionHeader } from '../SectionHeader';
import { layout, spacing } from '@/theme';

describe('SectionHeader', () => {
  it('derives its reserved height from the same tokens the row style uses', () => {
    expect(SECTION_HEADER_HEIGHT).toBe(layout.minTouchTarget + spacing.sm);
  });

  it('renders just the title when no action is supplied', async () => {
    await renderWithProviders(<SectionHeader title="Trending consumables" />);

    expect(screen.getByText('Trending consumables')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a trailing text action and fires it', async () => {
    const onActionPress = jest.fn();
    await renderWithProviders(
      <SectionHeader title="Trending consumables" actionLabel="See all" onActionPress={onActionPress} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('See all trending consumables'));
    });
    expect(onActionPress).toHaveBeenCalledTimes(1);
  });
});
