import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import { AuthProvider, useAuth } from '../AuthContext';
import {
  fetchCurrentUser,
  login,
  logout,
  register,
  type NewAccount,
  type TokenPair,
  type UserProfile,
} from '../api';
import {
  clearTokenPair,
  getAccessToken,
  getRefreshToken,
  storeTokenPair,
} from '../tokenStorage';

jest.mock('../api', () => ({
  login: jest.fn(),
  fetchCurrentUser: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
}));

jest.mock('../tokenStorage', () => ({
  storeTokenPair: jest.fn(),
  clearTokenPair: jest.fn(),
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
}));

const mockLogin = login as jest.MockedFunction<typeof login>;
const mockFetchCurrentUser = fetchCurrentUser as jest.MockedFunction<typeof fetchCurrentUser>;
const mockLogout = logout as jest.MockedFunction<typeof logout>;
const mockRegister = register as jest.MockedFunction<typeof register>;
const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;
const mockGetRefreshToken = getRefreshToken as jest.MockedFunction<typeof getRefreshToken>;
const mockStoreTokenPair = storeTokenPair as jest.MockedFunction<typeof storeTokenPair>;
const mockClearTokenPair = clearTokenPair as jest.MockedFunction<typeof clearTokenPair>;

const tokenPair: TokenPair = {
  access_token: 'access-jwt',
  refresh_token: 'refresh-opaque',
  token_type: 'bearer',
  expires_in: 900,
};

const profile: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'shopper@example.com',
  display_name: 'Sam Shopper',
  avatar_url: null,
  is_active: true,
  email_verified: false,
  is_superuser: false,
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
};

async function mountAuth() {
  const view = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(view.result.current.status).not.toBe('loading'));
  return view;
}

beforeEach(() => {
  mockGetAccessToken.mockResolvedValue(null);
  mockGetRefreshToken.mockResolvedValue(null);
  mockStoreTokenPair.mockResolvedValue();
  mockClearTokenPair.mockResolvedValue();
  mockLogout.mockResolvedValue();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('AuthProvider startup', () => {
  it('settles to unauthenticated when no token is stored', async () => {
    const { result } = await mountAuth();

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();
  });

  it('restores the session from a stored token', async () => {
    mockGetAccessToken.mockResolvedValue('access-jwt');
    mockFetchCurrentUser.mockResolvedValue(profile);

    const { result } = await mountAuth();

    expect(mockFetchCurrentUser).toHaveBeenCalledWith('access-jwt');
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(profile);
  });

  it('drops a stored token the server rejects and starts signed out', async () => {
    mockGetAccessToken.mockResolvedValue('stale-jwt');
    mockFetchCurrentUser.mockRejectedValue(new ApiError(401, 'Invalid or expired access token'));

    const { result } = await mountAuth();

    expect(mockClearTokenPair).toHaveBeenCalled();
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });
});

describe('signIn', () => {
  it('stores the token pair, loads the profile, and becomes authenticated', async () => {
    mockLogin.mockResolvedValue(tokenPair);
    mockFetchCurrentUser.mockResolvedValue(profile);

    const { result } = await mountAuth();

    await act(async () => {
      await result.current.signIn({ email: 'shopper@example.com', password: 's3cret-pass' });
    });

    expect(mockLogin).toHaveBeenCalledWith({
      email: 'shopper@example.com',
      password: 's3cret-pass',
    });
    expect(mockStoreTokenPair).toHaveBeenCalledWith(tokenPair);
    expect(mockFetchCurrentUser).toHaveBeenCalledWith('access-jwt');
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(profile);
  });

  it('propagates a bad-credential rejection without changing state', async () => {
    mockLogin.mockRejectedValue(new ApiError(401, 'Invalid email or password'));

    const { result } = await mountAuth();

    await expect(
      act(async () => {
        await result.current.signIn({ email: 'shopper@example.com', password: 'wrong' });
      }),
    ).rejects.toThrow('Invalid email or password');

    expect(mockStoreTokenPair).not.toHaveBeenCalled();
    expect(result.current.status).toBe('unauthenticated');
  });
});

describe('signUp', () => {
  const newAccount: NewAccount = {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'shopper@example.com',
    display_name: 'Sam Shopper',
  };

  it('registers then signs in, becoming authenticated', async () => {
    mockRegister.mockResolvedValue(newAccount);
    mockLogin.mockResolvedValue(tokenPair);
    mockFetchCurrentUser.mockResolvedValue(profile);

    const { result } = await mountAuth();

    await act(async () => {
      await result.current.signUp({
        email: 'shopper@example.com',
        password: 's3cret-pass',
        displayName: 'Sam Shopper',
      });
    });

    expect(mockRegister).toHaveBeenCalledWith({
      email: 'shopper@example.com',
      password: 's3cret-pass',
      displayName: 'Sam Shopper',
    });
    expect(mockLogin).toHaveBeenCalledWith({
      email: 'shopper@example.com',
      password: 's3cret-pass',
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(profile);
  });

  it('propagates a registration failure (e.g. email already taken) without signing in', async () => {
    mockRegister.mockRejectedValue(new ApiError(400, 'Email already registered'));

    const { result } = await mountAuth();

    await expect(
      act(async () => {
        await result.current.signUp({ email: 'taken@example.com', password: 's3cret-pass' });
      }),
    ).rejects.toThrow('Email already registered');

    expect(mockLogin).not.toHaveBeenCalled();
    expect(result.current.status).toBe('unauthenticated');
  });
});

describe('signOut', () => {
  it('revokes the refresh token and clears the session', async () => {
    mockGetAccessToken.mockResolvedValue('access-jwt');
    mockGetRefreshToken.mockResolvedValue('refresh-opaque');
    mockFetchCurrentUser.mockResolvedValue(profile);

    const { result } = await mountAuth();
    expect(result.current.status).toBe('authenticated');

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockLogout).toHaveBeenCalledWith('access-jwt', 'refresh-opaque');
    expect(mockClearTokenPair).toHaveBeenCalled();
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('still clears locally when the revocation call fails', async () => {
    mockGetAccessToken.mockResolvedValue('access-jwt');
    mockGetRefreshToken.mockResolvedValue('refresh-opaque');
    mockFetchCurrentUser.mockResolvedValue(profile);
    mockLogout.mockRejectedValue(new ApiError(0, 'offline'));

    const { result } = await mountAuth();

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockClearTokenPair).toHaveBeenCalled();
    expect(result.current.status).toBe('unauthenticated');
  });

  it('skips the revocation call when no tokens are stored', async () => {
    const { result } = await mountAuth();

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockClearTokenPair).toHaveBeenCalled();
    expect(result.current.status).toBe('unauthenticated');
  });
});

describe('useAuth outside a provider', () => {
  it('throws a helpful error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(renderHook(() => useAuth())).rejects.toThrow(
      /must be used within an AuthProvider/,
    );
  });
});
