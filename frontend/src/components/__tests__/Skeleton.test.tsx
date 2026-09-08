import { Text } from 'react-native';

import { renderWithProviders, screen } from '../../../test-utils/render';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('renders a placeholder block alongside its siblings', async () => {
    await renderWithProviders(
      <>
        <Skeleton width="60%" height={12} />
        <Text>after</Text>
      </>,
    );

    // The block itself is hidden from assistive tech, so assert via a sibling
    // that the subtree mounted at all.
    expect(screen.getByText('after')).toBeOnTheScreen();
  });

  it('starts and cleans up its pulse animation across mount/unmount', async () => {
    const view = await renderWithProviders(
      <Skeleton width={40} height={40} radius={20} style={{ marginTop: 8 }} />,
    );

    // The looping animation registers an unmount cleanup; this just has to not throw.
    expect(() => view.unmount()).not.toThrow();
  });
});
