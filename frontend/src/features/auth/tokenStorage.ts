import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TokenPair } from './api';

const ACCESS_TOKEN_KEY = 'pantrycast/auth/access-token';
const REFRESH_TOKEN_KEY = 'pantrycast/auth/refresh-token';

/**
 * Persists the token pair from a successful login.
 *
 * AsyncStorage is a deliberate placeholder and the single seam to change: on
 * native this should move to `expo-secure-store`, and the web story is an open
 * question in uac-design.md §1 (`localStorage` is readable by any injected
 * script). Nothing else in the app touches these keys directly.
 */
export async function storeTokenPair(tokens: TokenPair): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, tokens.access_token],
    [REFRESH_TOKEN_KEY, tokens.refresh_token],
  ]);
}

/** The stored access token, or `null` if the user is not signed in. */
export function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

/** The stored refresh token, or `null` if the user is not signed in. */
export function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Clears the stored pair (logout, or after a refresh is rejected). */
export async function clearTokenPair(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}
