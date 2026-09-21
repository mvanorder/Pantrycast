/**
 * @jest-environment jsdom
 */
import { Platform } from 'react-native';

import { act, fireEvent, renderWithProviders, screen } from '../../../../test-utils/render';
import { ResetPasswordScreen } from '../ResetPasswordScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

describe('ResetPasswordScreen on web', () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    Platform.OS = 'web';
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('strips the token from the URL on mount, so a still-spendable token never lingers in history or a Referer header', async () => {
    // expo-router's web history layer keeps its own `{ id }` bookkeeping in
    // `history.state`; a real navigation here would have set something like
    // this rather than `null`.
    const routerState = { id: 'expo-router-entry-id' };
    window.history.replaceState(routerState, '', '/reset-password?token=a-token');
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    await renderWithProviders(<ResetPasswordScreen token="a-token" onSubmit={jest.fn()} />);

    // Passes the existing state through rather than `null`, so expo-router's
    // bookkeeping for this history entry survives the URL change.
    expect(replaceStateSpy).toHaveBeenCalledWith(routerState, '', '/reset-password');

    replaceStateSpy.mockRestore();
  });

  it('still submits the token after stripping it, since the form reads it from props', async () => {
    window.history.replaceState(null, '', '/reset-password?token=a-token');
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    await renderWithProviders(<ResetPasswordScreen token="a-token" onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('New password'), 'new-passphrase');
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-passphrase');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save new password'));
    });

    expect(window.location.search).toBe('');
    expect(onSubmit).toHaveBeenCalledWith('a-token', 'new-passphrase');
  });

  it('leaves the URL alone when there is no token to strip', async () => {
    window.history.replaceState(null, '', '/reset-password');
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    await renderWithProviders(<ResetPasswordScreen onSubmit={jest.fn()} />);

    expect(replaceStateSpy).not.toHaveBeenCalled();

    replaceStateSpy.mockRestore();
  });
});
