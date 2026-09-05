import { createRef } from 'react';
import { ScrollView, Text } from 'react-native';

import { renderWithProviders, screen } from '../../../test-utils/render';
import { ScreenScrollView } from '../ScreenScrollView';

describe('ScreenScrollView', () => {
  it('renders its children above the global footer', async () => {
    await renderWithProviders(
      <ScreenScrollView>
        <Text>page body</Text>
      </ScreenScrollView>,
    );

    expect(screen.getByText('page body')).toBeOnTheScreen();
    expect(
      screen.getByText(/personal project for understanding your own shopping/i),
    ).toBeOnTheScreen();
  });

  it('forwards a ref to the underlying ScrollView', async () => {
    const ref = createRef<ScrollView>();

    await renderWithProviders(
      <ScreenScrollView scrollRef={ref}>
        <Text>page body</Text>
      </ScreenScrollView>,
    );

    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.scrollTo).toBe('function');
  });
});
