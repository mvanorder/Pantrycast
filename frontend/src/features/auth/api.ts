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
 * Exchanges a refresh token for a new access/refresh pair, rotating the
 * refresh token server-side (uac-design.md §1 "Sessions and tokens" — the old
 * token is revoked as part of issuing the new one, and presenting it again
 * afterward is treated as theft and revokes every session on the account).
 *
 * Rejects with {@link ApiError}: `status` 401 if the refresh token is
 * unknown, expired, or already rotated out, `status` 0 if the server was
 * unreachable.
 */
export function refresh(refreshToken: string): Promise<TokenPair> {
  return apiRequest<TokenPair>('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
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

/**
 * Asks for a password-reset link to be emailed to `email`.
 *
 * Resolving says only that the request was accepted — never that the address
 * belongs to an account. `POST /auth/password-reset` answers 204 either way
 * (anti-enumeration, uac-design.md §1): a match schedules the email, a
 * non-match silently does nothing, and the two are indistinguishable from
 * here. Callers must word their success state accordingly ("if that address
 * has an account…") and must not treat a resolution as confirmation.
 *
 * Rejects with {@link ApiError}: `status` 422 if the body isn't a well-formed
 * email address, `status` 0 if the server was unreachable. There is
 * deliberately no "email not found" rejection to handle.
 */
export function requestPasswordReset(email: string): Promise<void> {
  return apiRequest<void>('/auth/password-reset', {
    method: 'POST',
    body: { email },
  });
}

/**
 * Redeems a single-use password-reset token and sets `newPassword` on the
 * account. Does not sign the caller in — `POST /auth/password-reset/confirm`
 * returns no token pair, and it revokes every refresh token the account
 * holds, so the user must {@link login} again with the new password.
 *
 * Rejects with {@link ApiError}: `status` 400 if the token is unknown,
 * malformed, or issued for a different purpose, `status` 422 if it's a real
 * reset token that already expired or was already used, `status` 0 if the
 * server was unreachable.
 *
 * Note that 422 is shared: the API also answers 422 when `newPassword` falls
 * outside its 8–128 character bound, so callers must enforce that bound
 * client-side or risk reporting a length problem as an expired link.
 */
export function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/auth/password-reset/confirm', {
    method: 'POST',
    body: { token, new_password: newPassword },
  });
}
