/**
 * @jest-environment jsdom
 */
import { Platform } from 'react-native';

import { renderWithProviders } from '../../../../test-utils/render';
import { VerifyEmailScreen } from '../VerifyEmailScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'unauthenticated', user: null, signIn: jest.fn(), signOut: jest.fn() }),
}));

describe('VerifyEmailScreen on web', () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    Platform.OS = 'web';
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('strips the token from the URL once redemption starts, so it never lingers in history or a Referer header', async () => {
    // expo-router's web history layer keeps its own `{ id }` bookkeeping in
    // `history.state`; a real navigation here would have set something like
    // this rather than `null`.
    const routerState = { id: 'expo-router-entry-id' };
    window.history.replaceState(routerState, '', '/verify-email?token=a-token');
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');
    const onVerify = jest.fn().mockResolvedValue(undefined);

    await renderWithProviders(<VerifyEmailScreen token="a-token" onVerify={onVerify} />);

    // Passes the existing state through rather than `null`, so expo-router's
    // bookkeeping for this history entry survives the URL change.
    expect(replaceStateSpy).toHaveBeenCalledWith(routerState, '', '/verify-email');

    replaceStateSpy.mockRestore();
  });

  it('leaves the URL alone when there is no token to strip', async () => {
    window.history.replaceState(null, '', '/verify-email');
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

    await renderWithProviders(<VerifyEmailScreen onVerify={jest.fn()} />);

    expect(replaceStateSpy).not.toHaveBeenCalled();

    replaceStateSpy.mockRestore();
  });
});
