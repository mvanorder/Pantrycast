import { apiRequest } from '../../../api/client';
import {
  confirmPasswordReset,
  fetchCurrentUser,
  login,
  logout,
  register,
  requestPasswordReset,
  verifyEmail,
} from '../api';

jest.mock('../../../api/client', () => ({ apiRequest: jest.fn() }));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const tokenPair = {
  access_token: 'a',
  refresh_token: 'r',
  token_type: 'bearer' as const,
  expires_in: 900,
};

afterEach(() => {
  mockApiRequest.mockReset();
});

describe('login', () => {
  it('POSTs the credentials to /auth/login and returns the token pair', async () => {
    mockApiRequest.mockResolvedValue(tokenPair);

    await expect(
      login({ email: 'shopper@example.com', password: 'pw' }),
    ).resolves.toEqual(tokenPair);

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'shopper@example.com', password: 'pw' },
    });
  });

  it('propagates a rejected request', async () => {
    mockApiRequest.mockRejectedValue(new Error('boom'));

    await expect(login({ email: 'x@y.co', password: 'bad' })).rejects.toThrow('boom');
  });
});

describe('register', () => {
  it('POSTs the account details to /auth/register, omitting a blank display name', async () => {
    mockApiRequest.mockResolvedValue({ id: '1', email: 'shopper@example.com', display_name: null });

    await register({ email: 'shopper@example.com', password: 'password123' });

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: { email: 'shopper@example.com', password: 'password123' },
    });
  });

  it('includes display_name when a display name is given', async () => {
    mockApiRequest.mockResolvedValue({ id: '1', email: 'shopper@example.com', display_name: 'Sam' });

    await register({ email: 'shopper@example.com', password: 'password123', displayName: 'Sam' });

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: { email: 'shopper@example.com', password: 'password123', display_name: 'Sam' },
    });
  });

  it('propagates a rejected request (e.g. email already registered)', async () => {
    mockApiRequest.mockRejectedValue(new Error('boom'));

    await expect(
      register({ email: 'taken@example.com', password: 'password123' }),
    ).rejects.toThrow('boom');
  });
});

describe('fetchCurrentUser', () => {
  it('GETs /users/me with the access token', async () => {
    mockApiRequest.mockResolvedValue({ id: '1', email: 'a@b.co' });

    await fetchCurrentUser('access-jwt');

    expect(mockApiRequest).toHaveBeenCalledWith('/users/me', { token: 'access-jwt' });
  });
});

describe('logout', () => {
  it('POSTs the refresh token to /auth/logout with the access token', async () => {
    mockApiRequest.mockResolvedValue(undefined);

    await logout('access-jwt', 'refresh-opaque');

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      token: 'access-jwt',
      body: { refresh_token: 'refresh-opaque' },
    });
  });
});

describe('verifyEmail', () => {
  it('POSTs the token to /auth/verify-email', async () => {
    mockApiRequest.mockResolvedValue(undefined);

    await verifyEmail('a-raw-token');

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/verify-email', {
      method: 'POST',
      body: { token: 'a-raw-token' },
    });
  });

  it('propagates a rejected request (e.g. expired or already-used token)', async () => {
    mockApiRequest.mockRejectedValue(new Error('boom'));

    await expect(verifyEmail('stale-token')).rejects.toThrow('boom');
  });
});

describe('requestPasswordReset', () => {
  it('POSTs the email to /auth/password-reset', async () => {
    mockApiRequest.mockResolvedValue(undefined);

    await requestPasswordReset('shopper@example.com');

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/password-reset', {
      method: 'POST',
      body: { email: 'shopper@example.com' },
    });
  });

  it('resolves for an address with no account, exactly as for one with', async () => {
    // The endpoint answers 204 either way (anti-enumeration), so there is
    // nothing here that could tell the two apart — and nothing a caller
    // could branch on if it wanted to.
    mockApiRequest.mockResolvedValue(undefined);

    await expect(requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
  });

  it('propagates a rejected request (e.g. the server was unreachable)', async () => {
    mockApiRequest.mockRejectedValue(new Error('boom'));

    await expect(requestPasswordReset('shopper@example.com')).rejects.toThrow('boom');
  });
});

describe('confirmPasswordReset', () => {
  it('POSTs the token and the snake_cased new password to /auth/password-reset/confirm', async () => {
    mockApiRequest.mockResolvedValue(undefined);

    await confirmPasswordReset('a-raw-token', 'new-passphrase');

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/password-reset/confirm', {
      method: 'POST',
      body: { token: 'a-raw-token', new_password: 'new-passphrase' },
    });
  });

  it('propagates a rejected request (e.g. expired or already-used token)', async () => {
    mockApiRequest.mockRejectedValue(new Error('boom'));

    await expect(confirmPasswordReset('stale-token', 'new-passphrase')).rejects.toThrow('boom');
  });
});
