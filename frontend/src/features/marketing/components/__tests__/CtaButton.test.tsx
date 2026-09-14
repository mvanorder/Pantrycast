import { renderWithProviders, fireEvent, screen } from '../../../../../test-utils/render';
import { lightTheme } from '@/theme/theme';
import { CtaButton } from '../CtaButton';

describe('CtaButton', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<CtaButton label="Get started free" onPress={onPress} />);

    fireEvent.press(screen.getByText('Get started free'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('falls back to the label for the accessibility name', async () => {
    await renderWithProviders(<CtaButton label="Upload" onPress={jest.fn()} />);

    expect(screen.getByLabelText('Upload')).toBeOnTheScreen();
  });

  it('uses an explicit accessibility label when given', async () => {
    await renderWithProviders(
      <CtaButton
        label="Continue"
        onPress={jest.fn()}
        accessibilityLabel="Get started free with Pantrycast"
      />,
    );

    expect(
      screen.getByLabelText('Get started free with Pantrycast'),
    ).toBeOnTheScreen();
  });

  it('inverts its colours on a filled primary band', async () => {
    await renderWithProviders(
      <CtaButton label="Get started free" variant="onPrimary" onPress={jest.fn()} />,
    );

    const label = screen.getByText('Get started free');
    expect(label).toHaveStyle({ color: lightTheme.colors.primary });
  });

  it('renders a low-emphasis text variant with a trailing icon', async () => {
    await renderWithProviders(
      <CtaButton
        label="See how it works"
        variant="text"
        icon="arrow-down"
        iconTrailing
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('See how it works')).toBeOnTheScreen();
  });
});
