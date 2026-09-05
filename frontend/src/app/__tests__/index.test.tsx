import { renderWithProviders, screen } from '../../../test-utils/render';

import Index from '../index';

// `Stack.Screen` only sets navigator options and needs a route context we do
// not mount here; a no-op stand-in keeps the test to the screen's own content.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

describe('Index screen', () => {
  it('renders the marketing landing page at the app root', async () => {
    await renderWithProviders(<Index />);

    expect(
      screen.getByText("Know what you'll need before you run out."),
    ).toBeOnTheScreen();
    expect(screen.getByText('How it works')).toBeOnTheScreen();
  });
});
