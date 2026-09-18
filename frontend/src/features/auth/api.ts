import { apiRequest } from '@/api/client';

/** The access/refresh pair returned by `POST /auth/login` (uac-design.md §1). */
export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
};

/** The caller's own profile, from `GET /users/me`. */
export type UserProfile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  email_verified: boolean;
  is_superuser: boolean;
  created_at: string;
  last_login_at: string | null;
};

/**
 * Exchanges an email + password for a token pair.
 *
 * Rejects with {@link ApiError}: `status` 401 for a bad credential (the API
 * returns one generic message for every failure — unknown email, wrong
 * password, disabled account), `status` 0 if the server was unreachable.
 */
export function login(credentials: { email: string; password: string }): Promise<TokenPair> {
  return apiRequest<TokenPair>('/auth/login', {
    method: 'POST',
    body: { email: credentials.email, password: credentials.password },
  });
}

/** A newly created account, from `POST /auth/register`. */
export type NewAccount = {
  id: string;
  email: string;
  display_name: string | null;
};

/**
 * Creates a new account. Does not sign the caller in — `POST /auth/register`
 * returns no token pair, so a caller that wants a session must follow up
 * with {@link login}.
 *
 * Rejects with {@link ApiError}: `status` 400 if the email is already
 * registered, `status` 0 if the server was unreachable.
 */
export function register(details: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<NewAccount> {
  return apiRequest<NewAccount>('/auth/register', {
    method: 'POST',
    body: {
      email: details.email,
      password: details.password,
      ...(details.displayName ? { display_name: details.displayName } : {}),
    },
  });
}

/**
 * Fetches the signed-in user's profile. Rejects with {@link ApiError} `status`
 * 401 if the access token is missing, expired, or invalid.
 */
export function fetchCurrentUser(accessToken: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/users/me', { token: accessToken });
}

/**
 * Revokes the given refresh token (this session only). The API answers 204 even
 * for an unknown token, so this resolves as long as the request reaches it.
 */
export function logout(accessToken: string, refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    token: accessToken,
    body: { refresh_token: refreshToken },
  });
}

/**
 * Redeems an email-verification token, flipping the account's
 * `email_verified` flag. Does not sign the caller in or require a session.
 *
 * Rejects with {@link ApiError}: `status` 400 if the token is unknown or
 * malformed, `status` 422 if it's a real token that already expired or was
 * already used, `status` 0 if the server was unreachable.
 */
export function verifyEmail(token: string): Promise<void> {
  return apiRequest<void>('/auth/verify-email', {
    method: 'POST',
    body: { token },
  });
}
