import { Text } from 'react-native';

import { act, fireEvent, renderWithProviders, screen } from '../../../test-utils/render';
import { useGetStartedNotice } from '../GetStartedNotice';

function Probe() {
  const notify = useGetStartedNotice();
  return (
    <Text accessibilityRole="button" accessibilityLabel="probe" onPress={() => notify()}>
      probe
    </Text>
  );
}

describe('useGetStartedNotice', () => {
  it('is a harmless no-op when read outside an AppShell provider', async () => {
    await renderWithProviders(<Probe />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('probe'));
    });

    expect(screen.getByText('probe')).toBeOnTheScreen();
  });
});
