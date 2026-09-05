import type { ReactNode } from 'react';
import { Text } from 'react-native';

import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '../../../test-utils/render';
import { AppShell } from '../AppShell';
import { useGetStartedNotice } from '../GetStartedNotice';

jest.mock('../../features/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'unauthenticated', user: null, signOut: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// Paper's Snackbar runs an entrance animation whose `Animated.start()` callback
// lands outside React's act() window. The shell only uses it as a plain
// acknowledgement, so a synchronous stand-in keeps the visible / dismiss / action
// behaviour without the noise. (See the same shim in LandingScreen's tests for
// why this goes through a Proxy rather than a spread.)
jest.mock('react-native-paper', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Actual = jest.requireActual('react-native-paper');
  const { View, Text: RNText, Pressable } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const Snackbar = (props: {
    visible: boolean;
    children: ReactNode;
    onDismiss?: () => void;
    action?: { label: string; onPress: () => void };
  }) => {
    if (!props.visible) return null;
    return (
      <View>
        <RNText>{props.children}</RNText>
        <Pressable accessibilityLabel="dismiss-snackbar" onPress={props.onDismiss}>
          <RNText>dismiss</RNText>
        </Pressable>
        {props.action ? (
          <Pressable onPress={props.action.onPress}>
            <RNText>{props.action.label}</RNText>
          </Pressable>
        ) : null}
      </View>
    );
  };
  return new Proxy(Actual, {
    get: (target, prop) => (prop === 'Snackbar' ? Snackbar : target[prop]),
  });
});

function GetStartedButton() {
  const notify = useGetStartedNotice();
  return (
    <Text accessibilityRole="button" accessibilityLabel="notify" onPress={notify}>
      notify
    </Text>
  );
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

describe('AppShell', () => {
  it('frames its children with the global header', async () => {
    await renderWithProviders(
      <AppShell>
        <Text>route content</Text>
      </AppShell>,
    );

    expect(screen.getByText('route content')).toBeOnTheScreen();
    expect(screen.getByLabelText('Log in to Shopping Analysis')).toBeOnTheScreen();
  });

  it('shows and dismisses the shared "Get started" notice for descendants', async () => {
    await renderWithProviders(
      <AppShell>
        <GetStartedButton />
      </AppShell>,
    );

    expect(screen.queryByText(/Sign-up isn.t wired up yet/)).not.toBeOnTheScreen();

    await press('notify');
    await waitFor(() =>
      expect(screen.getByText(/Sign-up isn.t wired up yet/)).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('OK'));
    });
    await waitFor(() =>
      expect(screen.queryByText(/Sign-up isn.t wired up yet/)).not.toBeOnTheScreen(),
    );
  });

  it('lets the header CTA trigger the same notice', async () => {
    await renderWithProviders(
      <AppShell>
        <Text>route content</Text>
      </AppShell>,
    );

    await press('Get started with Shopping Analysis');

    await waitFor(() =>
      expect(screen.getByText(/Sign-up isn.t wired up yet/)).toBeOnTheScreen(),
    );
  });
});
