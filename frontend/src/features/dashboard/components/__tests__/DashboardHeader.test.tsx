import { act, fireEvent, renderWithProviders, screen } from '../../../../../test-utils/render';
import { DashboardHeader, greetingForHour } from '../DashboardHeader';

describe('greetingForHour', () => {
  it('picks the greeting for the time of day', () => {
    expect(greetingForHour(6)).toBe('Good morning');
    expect(greetingForHour(13)).toBe('Good afternoon');
    expect(greetingForHour(21)).toBe('Good evening');
  });
});

describe('DashboardHeader', () => {
  it('renders the eyebrow, greeting and subtitle, and no toggle without period props', async () => {
    await renderWithProviders(<DashboardHeader subtitle="A subtitle" />);

    expect(screen.getByText('PANTRYCAST')).toBeOnTheScreen();
    expect(screen.getByText('A subtitle')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Reporting period')).toBeNull();
  });

  it('renders the period toggle as a radio group and reports a change', async () => {
    const onPeriodChange = jest.fn();
    await renderWithProviders(
      <DashboardHeader subtitle="s" period="month" onPeriodChange={onPeriodChange} />,
    );

    expect(screen.getByLabelText('Reporting period')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('This week'));
    });
    expect(onPeriodChange).toHaveBeenCalledWith('week');
  });
});
