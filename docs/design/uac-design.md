# UAC Design — User Management, Access Control & Deployment

Status: draft, for review. Partially implemented: most of §5's schema (`users`,
`auth_identities`, `refresh_tokens`, `roles`, `permissions`, `role_permissions`, `user_roles`,
`audit_log`) exists as an ORM model + migration, and the container/compose scaffolding (§6–§8) is
built. `orders`/`order_items` are deliberately excluded pending plan refinement (see §5). The
`create-superuser` bootstrap CLI (§2) is built, including argon2 password hashing. The core
password-auth HTTP loop is also now built and verified end-to-end against a real Postgres instance:
`register`/`login`/`refresh`/`logout`/`logout-all`, JWT issuance/verification, and the
`get_current_user` dependency (§1 "Authentication endpoints"). On the frontend, login/session
restore/route-guarding are built (§1 "Frontend integration"); signup, account management, and
silent token refresh on 401 are not. The **email sender** that email
verification and password reset were blocked on now exists: a provider-agnostic SMTP sender
behind an `EmailSender` protocol, a console fallback for local dev, message templates, the
`verification_tokens` table + migration, and token generate/hash helpers (`backend/app/mailer/`,
`backend/app/tokens.py`, `backend/app/models/verification_token.py`). `POST /auth/verify-email`
is now built too, along with `register`'s token-issuing/send wiring — the full signup → email →
verify loop is reachable end to end (`backend/app/routers/auth.py`). Still design-only: RBAC
enforcement (§3), the Google OAuth flow (§4), and the `password-reset` endpoints (same sender/token
infra, just not wired to endpoints yet).
Scope: user accounts, authentication, authorization (RBAC), and the container/deployment
architecture needed to run this at anywhere from single-user to millions-of-users scale.

This builds on prior decisions: Postgres + SQLAlchemy 2.0 (async) as the ORM layer, FastAPI
backend, stateless API instances so the app can scale horizontally.

---

## 1. User management

### Identity model

A user's login identity is kept separate from *how* they authenticate, so one account can have
a password, a Google login, or both, without schema changes later:

- **`users`** — the account itself. `id` (UUID), `email` (unique, citext), `display_name`,
  `avatar_url`, `is_active`, `email_verified`, `is_superuser`, `created_at`, `updated_at`,
  `last_login_at`. No password column here.
- **`auth_identities`** — one row per login method linked to a user. `id`, `user_id` (FK),
  `provider` (`password` | `google`), `provider_user_id` (the Google `sub`, or the user's own
  `id` for password auth), `secret_hash` (bcrypt/argon2 hash, only for `provider='password'`),
  `created_at`. Unique on `(provider, provider_user_id)`.

This split is what lets Google OAuth (§4) bolt on without a redesign, and lets a user later add
a password to an OAuth-only account or vice versa.

**Implemented** (`backend/app/models/user.py`): `User`, `AuthIdentity`, and `RefreshToken` ORM
models matching this shape, with a few concrete choices the design above left open:

- `users.id` / `auth_identities.id` / `refresh_tokens.id` are Postgres `UUID` columns with
  `server_default=gen_random_uuid()` (no extension needed on PG13+, so `pgcrypto` isn't required).
- `users.email` uses Postgres `CITEXT` for case-insensitive uniqueness, which does require the
  `citext` extension — provisioned via `database/init/001-extensions.sql`, run at DB init time
  (see §6).
- `auth_identities.provider` is constrained with a DB-level `CHECK (provider IN ('password',
  'google'))` in addition to whatever the app layer enforces, so an invalid provider value can't
  reach the table even from a bug or a manual `INSERT`.
- `refresh_tokens.ip_address` is a Postgres `INET` column rather than plain text.
- Argon2 password hashing and JWT issuance/verification are both implemented and used by the
  `create-superuser` bootstrap path (§2) *and* the `register`/`login`/`refresh` HTTP endpoints
  (§1 "Authentication endpoints") — only the Google OAuth flow (§4) remains schema-only.
- The `roles`/`permissions`/`role_permissions`/`user_roles` (§3) and `audit_log` (§5) tables are
  also now built as models (`app/models/rbac.py`, `app/models/audit.py`) — see §5 for the
  specifics. `orders`/`order_items` are not built yet, pending plan refinement (§5). RBAC
  *enforcement* (the `require_permission` dependency, §3) is not built either.

### Password handling

- Hash with **argon2** (via `argon2-cffi` / `passlib[argon2]`) — memory-hard, the current
  recommended default for new systems (bcrypt is an acceptable fallback if a dependency issue
  rules argon2 out).
- Password reset and email verification use short-lived, single-use signed tokens (JWT or random
  token + hash stored in a `verification_tokens` table with an `expires_at`), delivered by email.

**Implemented** (`backend/app/tokens.py`, `backend/app/models/verification_token.py`): the random
token + hash approach, not JWT. `generate_verification_token()` is `secrets.token_urlsafe(32)` and
`hash_verification_token()` is SHA-256 hex — identical rationale to the refresh token
(`hash_refresh_token`, Sessions and tokens below): high-entropy value, looked up by exact hash
equality. The `verification_tokens` table has `token_hash` (unique), `purpose` (`email_verify` |
`password_reset`, DB-`CHECK`-constrained like `auth_identities.provider`), `expires_at`,
`consumed_at` (set on redemption, so reuse is detectable), and a `user_id` FK
(`ON DELETE CASCADE`). Delivery is `backend/app/mailer/` — see the endpoints table for what still
isn't built.

### Sessions and tokens

Given the "unknown number of users, possibly millions" target, **avoid server-side session
storage as the primary mechanism** — it becomes a shared-state bottleneck across horizontally
scaled API instances. Instead:

- **Access token**: short-lived JWT (10–15 min), signed (RS256 so verification doesn't require
  hitting the DB or a shared secret store from every instance), carries `sub` (user id) and a
  cached snapshot of role/permission claims (§3) to avoid a permissions query on every request.
- **Refresh token**: long-lived (e.g. 30 days), opaque random value, stored **hashed** in a
  `refresh_tokens` table (`user_id`, `token_hash`, `expires_at`, `revoked_at`, `user_agent`,
  `ip_address`). Rotated on every use (old one revoked, new one issued) so a stolen refresh
  token has a limited window and reuse is detectable.
- This means logout / "sign out all devices" / admin-forced revocation all just delete or mark
  rows in `refresh_tokens` — no server-side session store needed for the hot path.

**Implemented** (`backend/app/security.py`): `create_access_token`/`decode_access_token` (RS256,
via `pyjwt[crypto]`) and `generate_refresh_token`/`hash_refresh_token`. Two simplifications versus
the design above, both because RBAC (§3) isn't built yet: the access token's payload today is only
`sub`/`iat`/`exp` — no role/permission claims, since there are no roles to cache — and refresh
tokens are hashed with **SHA-256, not argon2** (deliberately: they're already 256 bits of uniform
random data, not a low-entropy human password, and `POST /auth/refresh` needs to find a row by
exact hash equality, which a per-call-salted hash can't support without a full-table scan — see
the function's docstring). Revisit the access-token payload once §3 lands.

### Authentication endpoints [core password loop implemented; see below for what isn't]

Everything above describes the token *strategy*; this is the HTTP surface that actually issues
and consumes them. `register`/`verify-email`/`login`/`refresh`/`logout`/`logout-all`/
`GET /users/me` are built (`backend/app/routers/auth.py`, `backend/app/routers/users.py`,
`backend/app/dependencies.py`); `password-reset` and the Google OAuth endpoints (§4) are not —
see the table below for which is which. This is separate from the `create-superuser` CLI (§2),
which writes `users`/`auth_identities` rows directly rather than going through this API.

**Transport.** The access token travels as a standard `Authorization: Bearer <token>` header —
not a cookie — because Expo Router (`frontend/`) ships the same codebase to native iOS/Android and
web, and a header is the one mechanism that works identically across all three without a
web-only/native-only branch in the HTTP client. The refresh token is returned once, in the
`POST /auth/login` response body, and the client is responsible for storing it. The design intent
was Expo `SecureStore` on native, with **web storage as an open question** — `localStorage` is
readable by any injected script, so it carries real XSS exposure that SecureStore doesn't. What's
actually built (`frontend/src/features/auth/tokenStorage.ts`) stores both tokens in
`@react-native-async-storage/async-storage` on *every* platform, including native — a deliberate
placeholder per the file's own comment, not yet the SecureStore split described above. See
"Frontend integration" below.

**Endpoints:**

| Endpoint | Auth required | Does |
|---|---|---|
| `POST /auth/register` **[built]** | none | Create a `users` row + a `password` `auth_identities` row. Simplification: leaves `email_verified=False` but does **not** block login on it (no verification flow exists — see Account states below) — the account behaves as fully active immediately. |
| `POST /auth/verify-email` **[built]** | none (token in body) | Consume a verification token: looked up by exact hash + `purpose='email_verify'` (row-locked against a double-spend race), then flip `email_verified` to true. Unknown token, malformed token, or one belonging to a different purpose (e.g. `password_reset`) → 400, indistinguishable from each other. A real token that's expired or already consumed → 422. Does not gate login and does not issue a new session (see Account states below). `register` (above) is what issues these tokens and schedules the email. |
| `POST /auth/login` **[built]** | none | Verify `email`+`password` against `auth_identities.secret_hash` (argon2), reject if the account is `is_active=False`; on success, update `last_login_at` and issue an access/refresh token pair. Every failure mode (unknown email, wrong password, Google-only account, disabled account) returns the *same* generic 401 — deliberate anti-enumeration, not an oversight. |
| `POST /auth/refresh` **[built]** | refresh token (body) | Validate + rotate the refresh token; issue a new pair. See the reuse-detection note below. |
| `POST /auth/logout` **[built]** | access token | Revoke the refresh token tied to the current session/device — silently a no-op (still 204) if that token doesn't exist or belongs to someone else, so an authenticated caller can't use this to force-log-out another user or probe whether a token exists. |
| `POST /auth/logout-all` **[built]** | access token | Revoke every `refresh_tokens` row for the user ("sign out all devices"). |
| `POST /auth/password-reset` / `POST /auth/password-reset/confirm` | none | Same short-lived-token pattern as email verification (`purpose='password_reset'`). **Not built** — same status: sender + token infra ready, endpoints are the remaining work. |
| `GET /auth/google/login`, `GET /auth/google/callback` | none | The OAuth flow specified in §4. **Not built.** |
| `GET /users/me` **[built]** | access token | Return the caller's own profile, re-fetched from the DB by the token's `sub` rather than trusting cached claims — the simplest possible exercise of the dependency below. |

**Refresh-token rotation/reuse, concretely** (`backend/app/routers/auth.py`): looked up by exact
SHA-256 hash equality. An unknown hash, or a not-yet-revoked-but-expired token, is a plain 401 (the
latter is also opportunistically marked revoked). A token that's already revoked being presented
again is treated as theft: **every** other active `refresh_tokens` row for that user is revoked
too (whole-account, not just the affected device — a `family_id` column to scope this down to one
device chain is a deliberate, documented follow-up, not built), a warning is logged, and the same
generic 401 is returned. Verified against a real dev Postgres instance end-to-end: reusing a
rotated-out token 401s, and the token issued by that same rotation is also revoked as a result.

**Enforcement dependency [built]** (`backend/app/dependencies.py`). `get_current_user` does the
verification any protected route needs:

1. Extract the bearer token via `HTTPBearer(auto_error=False)` — **not** `OAuth2PasswordBearer`,
   which assumes a spec-compliant form-encoded `/token` endpoint; `POST /auth/login` takes JSON.
2. Verify the JWT signature and expiry (RS256 public key, no DB hit — §1 Sessions and tokens).
3. Return a lightweight claims object (`user_id`, `expires_at`) — *not* a `users` row fetch on
   every request. (No cached role/permission snapshot yet — see the note under Sessions and
   tokens above; that's added once §3 is built.)
4. `require_permission("orders:write")` (§3) is **not built** — it would wrap this same
   dependency and add the permission check on top once RBAC lands.

**Error contract**, so the frontend can branch on it without parsing prose:

- **401** — missing, malformed, expired, or signature-invalid access token. The intended frontend
  response is always the same regardless of *which* of those it was: silently attempt
  `POST /auth/refresh`, and only surface a login prompt if that also fails. **Not built yet** — see
  "Frontend integration" below; today a 401 just signs the user out.
- **403** — the token is valid but `require_permission` says no (§3's "can this role do this" or
  the ownership check both land here). The frontend should *not* retry or refresh on 403 — retrying
  a refresh won't fix an authorization gap. **Not reachable yet** — nothing returns 403 until §3's
  `require_permission` exists.
- Login/register/refresh failures use **400** (malformed request, e.g. duplicate email on
  register) vs **401** (bad credentials/token) as built today; **429** (rate-limited) is **not
  built** — no Redis exists yet to back one (§7) — but `backend/app/routers/auth.py` marks exactly
  where a rate-limiting `Depends(...)` would slot into `login`/`register`/`refresh`.

### Email delivery [sender built; used by register (send) and verify-email (consume)]

`register` issues a `verification_tokens` row, **commits**, then hands the send to FastAPI
`BackgroundTasks` so a slow SMTP exchange never blocks the response; `verify-email` consumes it.
The still-unbuilt `password-reset` endpoints will follow the identical pattern.
`backend/app/mailer/` is built for this:

- **`EmailSender` protocol** — the single seam. `SmtpEmailSender` (`aiosmtplib`, provider-agnostic
  — SES SMTP, Postmark, Mailgun, a self-run relay) is the real one; `ConsoleEmailSender` logs
  instead of sending and is the zero-setup default when `SMTP_HOST` is unset (same spirit as the
  ephemeral JWT keypair). A queue-backed sender for the future `worker` (§6) drops in here with no
  call-site changes.
- **`delivery.py`** — `send_verification_email` / `send_password_reset_email`, the functions a
  route passes to `background_tasks.add_task(...)`. They take plain values only (a background task
  runs after the request's DB session has closed) and **log, not raise**, on a delivery failure —
  the response is already sent and there's no queue to retry on yet.
- **Config** — `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_SECURITY`/`EMAIL_FROM`/`EMAIL_BASE_URL`
  plus `SMTP_PASSWORD`/`SMTP_PASSWORD_FILE` (the same secret-file convention as `POSTGRES_PASSWORD`
  — a Docker secret in staging/prod, §6). Since a background send only logs its failures,
  `Settings` validates the email config at startup — `EMAIL_BACKEND=smtp` (set in the staging/prod
  env templates) makes a missing host a boot error; a half-configured `SMTP_USER`/`SMTP_PASSWORD`
  pair, a missing `SMTP_PASSWORD_FILE`, `SMTP_SECURITY=plaintext` to a non-local host, a malformed
  `EMAIL_FROM`, and a scheme-less `EMAIL_BASE_URL` are all rejected there too. Links point at a
  **frontend** page (`{EMAIL_BASE_URL}/verify-email?token=…`), not the API endpoint.

### Account states

`pending_verification` → `active` → `disabled` (admin action) — enforced as a check in the auth
dependency, not scattered across endpoints.

**Implementation note:** there's no `pending_verification` state actually enforced today.
`POST /auth/verify-email` (built) flips `email_verified` to true on redemption, but nothing gates
login or any other endpoint on it — `POST /auth/register` leaves the account immediately usable
(`email_verified=False`, but login doesn't check it) rather than blocking it in limbo, and
redeeming the token afterward doesn't unlock anything new either. `pending_verification`/`active`
remain conceptual, not enforced, states — a deliberate scope decision, not a gap to fix
incidentally here. The one gate that *is* enforced is `is_active` (→ `disabled`), checked in
`_authenticate_password` (`backend/app/routers/auth.py`). No new column was added for either flag —
`users.is_active`/`email_verified` (already migrated, §5) are enough to approximate the state
machine until a real reason to enforce it exists.

### Frontend integration

**Built** (`frontend/src/features/auth/`, `frontend/src/app/login.tsx`,
`frontend/src/app/dashboard.tsx`, `frontend/src/app/_layout.tsx`):

- `frontend/src/api/client.ts` / `frontend/src/api/config.ts` — a thin `fetch`-based JSON client
  (`apiRequest<T>()`), base URL from `EXPO_PUBLIC_API_URL`.
- `frontend/src/features/auth/api.ts` — `login()` → `POST /auth/login`, `fetchCurrentUser()` →
  `GET /users/me`, `logout()` → `POST /auth/logout`.
- `frontend/src/features/auth/AuthContext.tsx` — `AuthProvider`/`useAuth()`, tracking
  `status: 'loading' | 'authenticated' | 'unauthenticated'`. Restores the session on app start from
  a stored access token via `fetchCurrentUser`; mounted around the whole app in `_layout.tsx`.
- `frontend/src/app/login.tsx` (route `/login`) and route-guarding on
  `frontend/src/app/dashboard.tsx`, which redirects unauthenticated visitors to `/`.
- Token storage: see the correction under "Transport" above — actual storage is
  `AsyncStorage` on every platform today, not the SecureStore/web-TBD split originally designed.

**Known gaps**, called out explicitly so they don't read as accidental omissions:

- No signup/registration screen exists, even though `POST /auth/register` is built server-side —
  there is currently no way to create an account through the app itself.
- No account/profile/settings screen exists.
- No silent-refresh-on-401 flow (see the 401 bullet under "Error contract" above) — a
  rejected/expired stored access token just forces sign-out today.

---

## 2. Superuser / root

**No shared "root" login.** A superuser is a normal `users` row with `is_superuser = true`.
Reasons:

- Every privileged action is attributable to a real person in the audit log (§5) — a shared root
  credential makes that impossible.
- `is_superuser` is checked as a bypass *before* the RBAC permission lookup (§3) — superusers
  don't need explicit role/permission rows, which keeps the "break glass" path simple and hard
  to accidentally lock out.

Bootstrapping the first superuser:

- A one-off CLI command (`python -m app.cli create-superuser --email ... `) run at deploy time,
  reading the initial password (or nothing, if the first login will be via Google) from an
  environment variable or secret manager — **never** a seeded row with a fixed default password
  committed to a migration.
- Recommend MFA (TOTP) be **mandatory** for any account with `is_superuser = true`, enforced at
  login, given the blast radius of that credential.
- Superuser actions (role grants, user disable/enable, impersonation) are written to the
  `audit_log` table (§5) with actor, action, target, and timestamp.

**Implemented** (`backend/app/cli.py`, tested in `backend/tests/test_cli.py`):
`python -m app.cli create-superuser [--email <email>]`.

- **Email.** `--email` is validated with a deliberately loose plausibility check (rejects a
  missing `@`, stray whitespace, a bare hostname) — not full RFC 5322 — so an obvious typo
  doesn't become a permanent `users` row no one can log into. If `--email` is omitted, the
  command prompts for it interactively and re-prompts until the value passes that check; when
  there's no terminal (CI / deploy automation) the flag is required and its absence is a usage
  error.
- **Password source, in precedence order:** `SUPERUSER_PASSWORD`, then `SUPERUSER_PASSWORD_FILE`
  (a path — mirroring the `POSTGRES_PASSWORD` / `POSTGRES_PASSWORD_FILE` convention and the
  staging/prod Docker secret in §6), then — only at a terminal — an interactive prompt that
  asks twice and re-prompts on a mismatch. A value from the env var or the file is stripped; a
  prompted value is used verbatim apart from the blank check. A set-but-blank env var or an
  unreadable / non-UTF-8 secret file is a hard error, not a silent fallback.
- **Google-only bootstrap.** A blank password at the prompt — or, in non-interactive automation,
  leaving both env vars unset — creates the account with **no `password` `auth_identities`
  row**. First login then goes through the Google flow, which links a `google` identity to the
  existing row by verified email (§4).
- **Password identity.** When a password is supplied it's hashed with **argon2**
  (`argon2.PasswordHasher`, matching §1's "Password handling") and written to `auth_identities`
  as `provider='password'`, `provider_user_id = users.id`.
- **Idempotent, sequential.** With no matching account the command inserts one
  (`is_superuser=true`, `email_verified=true` — the operator is trusted to have verified the
  address out of band); with a matching account it promotes that row in place
  (`is_superuser=true`) and, if a password was supplied, creates or updates (rotates) its
  `password` identity. Safe to re-run (e.g. on every deploy). It is **not** safe to run
  concurrently for the same not-yet-existing email — both invocations would insert and the loser
  hits the `users.email` unique constraint.

Not yet built / open decisions:

- **MFA (TOTP)** for superuser accounts — still design-only (open question 2).
- The **promotion path** flips only `is_superuser`; it does not set `email_verified` on an
  existing (possibly unverified) row, and it trusts whatever row matches the email. Once a login
  layer exists that gates on `email_verified` or on account state (§1 "Account states"), decide
  whether promotion should also verify the address and whether it should refuse a disabled
  account.
- The prompted password has **no strength or length floor** beyond "not blank". Consider a
  minimum length with a re-prompt, given this is the one credential that bypasses RBAC.
- **Audit logging** of the bootstrap action — the command prints what it did but writes no
  `audit_log` row (there's no actor yet at bootstrap time).

---

## 3. RBAC

### Schema

- **`roles`** (`id`, `name` unique, `description`) — e.g. `user`, `admin`.
- **`permissions`** (`id`, `resource`, `action`, unique on the pair) — e.g. `orders:read`,
  `orders:write`, `users:manage`, `roles:manage`.
- **`role_permissions`** (`role_id`, `permission_id`) — many-to-many.
- **`user_roles`** (`user_id`, `role_id`) — many-to-many, so a user can hold more than one role.

Default roles to ship with:

| Role | Intent |
|---|---|
| `user` | CRUD on their own orders/items only |
| `admin` | manage users and roles within the system |
| *(implicit)* `superuser` | `is_superuser=true` bypasses RBAC entirely — not a row in `roles` |

**Implemented** (`backend/app/models/rbac.py`): `Role`, `Permission`, `RolePermission`,
`UserRole` matching this schema exactly — `role_permissions`/`user_roles` use composite primary
keys (`(role_id, permission_id)` / `(user_id, role_id)`) rather than a surrogate `id`, since
they're pure join tables. No default rows (`user`/`admin`) are seeded yet, and nothing reads these
tables — that's the `require_permission` dependency below, not yet written.

### Enforcement

- A FastAPI dependency, e.g. `Depends(require_permission("orders:write"))`, checks the JWT's
  cached permission claims first (fast path, no DB hit); falls back to a DB lookup only when
  claims are stale or absent (e.g. right after a role change, before the next token refresh).
- **RBAC answers "can this role do this kind of thing"; it does not answer "on this specific
  row."** Every business table (`orders`, `order_items`) carries an `owner_user_id`, and every
  query that isn't an admin/superuser action filters on it server-side — the client never
  supplies whose data to return. This ownership check is a second, separate gate from RBAC and
  both must pass.
- Start with hand-rolled permission checks against the tables above — it's a handful of tables
  and one dependency function. Reach for a policy engine (Casbin, Oso) only if authorization
  rules grow more relational than "own it or don't" (e.g. sharing an order with another user,
  team/org-scoped roles) — not needed for the current scope.

---

## 4. OAuth with Google

- Use **Authlib** rather than hand-rolling the OAuth2/OIDC flow — it handles PKCE, state/CSRF
  validation, and ID-token verification correctly.
- Standard Authorization Code + PKCE flow:
  1. `GET /auth/google/login` → redirect to Google's consent screen.
  2. `GET /auth/google/callback` → exchange code for tokens, verify the ID token signature and
     `email_verified` claim, extract `sub` (Google's stable user id — **never key off email**,
     which can change) and profile fields.
  3. Look up `auth_identities` by `(provider='google', provider_user_id=sub)`.
     - Match → log in as that user.
     - No match, but `email` matches an existing `users` row with a verified email → link a new
       `auth_identities` row to that user (only because Google's `email_verified` claim can be
       trusted; never auto-link on an unverified email).
     - No match at all → create a new `users` row + `auth_identities` row.
  4. Issue the app's own access/refresh token pair (§1) — downstream code never needs to know
     whether the user logged in with a password or Google.
- Secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) come from environment variables backed by
  GCP Secret Manager or AWS Secrets Manager in deployed environments — never committed, never in
  a plain `.env` outside local dev (already `.gitignore`d per `backend/.gitignore`).

---

## 5. Database design

Postgres, accessed via SQLAlchemy 2.0 async ORM, migrations via Alembic (autogenerate + manual
review, applied as an explicit pre-deploy step or init job — **not** on every app-instance
startup, to avoid concurrent-migration races when multiple replicas boot at once).

### Core tables

The `users`/`auth_identities`/`refresh_tokens`/`verification_tokens`/`roles`/`permissions`/
`role_permissions`/`user_roles`/`audit_log` tables below are SQLAlchemy models
(`backend/app/models/{user,verification_token,rbac,audit}.py`) with generated migrations
(`0e452124ee78_add_uac_tables.py` for the first eight, `ceec9dedc42b_add_verification_tokens_table.py`
for `verification_tokens`) — schema is done; the RBAC-enforcement *code* that uses these tables is
not (§3), and the `password-reset` endpoints that would write/consume `verification_tokens` rows
alongside `register`/`verify-email` aren't either (§1). `orders`/`order_items` are intentionally **not yet
implemented** — that part of the schema needs its plan refined before implementation (open
questions: import-time dedup key, whether `order_number` is unique per-user or globally, final
shape of `tracking_numbers`) — so they're listed below as design-only, matching everything else
in §5 that predates this session's work.

```
users              id (uuid, gen_random_uuid()), email (citext, unique), display_name,
                   avatar_url, is_active, email_verified, is_superuser,
                   created_at, updated_at, last_login_at

auth_identities    id (uuid), user_id FK (cascade), provider (check: 'password'|'google'),
                   provider_user_id, secret_hash, created_at
                   — unique(provider, provider_user_id)

refresh_tokens     id (uuid), user_id FK (cascade), token_hash (unique), expires_at,
                   revoked_at, user_agent, ip_address (inet), created_at

verification_tokens id (uuid), user_id FK (cascade, indexed), token_hash (unique),
                   purpose (check: 'email_verify'|'password_reset'), expires_at,
                   consumed_at, created_at

roles              id (uuid), name (unique), description
permissions        id (uuid), resource, action              — unique(resource, action)
role_permissions   role_id FK (cascade, composite PK), permission_id FK (cascade, composite PK)
user_roles         user_id FK (cascade, composite PK), role_id FK (cascade, composite PK)

orders             id, user_id FK (indexed), order_number, order_date,       -- design only,
                   subtotal, savings, tax, tip, order_total, fulfillment,       plan not final
                   tracking_numbers, created_at                                (see below)

order_items        id, order_id FK (indexed), product_name, generic_name,   -- design only
                   quantity, price, delivery_status, product_link

audit_log          id (uuid), actor_user_id FK (set null, indexed), action, target_type,
                   target_id, metadata (jsonb, mapped as `metadata_`), created_at
```

### Notes

- Every user-owned table gets `user_id`/`order_id` FKs with `ON DELETE CASCADE`, and the owning
  user id is always derived from the authenticated session server-side, never trusted from the
  client — this is the multi-tenancy boundary.
- Indexes: `users.email`, `orders.user_id`, `orders(user_id, order_date)` for time-range queries,
  `order_items.order_id`.
- `audit_log.metadata` as JSONB keeps it flexible for different action types without a schema
  migration per new admin action.
- `Base.metadata` (`backend/app/db.py`) sets an explicit Alembic naming convention (`ix_`, `uq_`,
  `uq_%(table_name)s_%(column_0_name)s`, `ck_`, `fk_`, `pk_` patterns) so autogenerate produces
  stable, deterministic constraint/index names instead of DB-assigned ones, which differ across
  dialects and can't be reliably referenced from a migration's `downgrade()`.
- The `citext` extension required by `users.email` (above) is provisioned by
  `database/init/001-extensions.sql`, baked into the custom Postgres image (§6) and applied once
  at first container init — not run per-migration.
- Three Alembic revisions exist: `be408b09e448_baseline_no_models_yet` (empty baseline),
  `0e452124ee78_add_uac_tables` (the eight tables above except `orders`/`order_items`, which are
  pending plan refinement), and `ceec9dedc42b_add_verification_tokens_table`. Each was exercised
  `upgrade head` / `downgrade -1` / `upgrade head` against the dev Postgres container and
  `alembic check` shows no drift; `backend/tests/test_models.py` additionally asserts schema shape
  (PK/FK/unique/check constraints, cascade rules, index shapes) directly against
  `Base.metadata`/`__table__` with no live DB required, for fast CI feedback.
- `AuditLog.metadata_` is deliberately misspelled relative to the DB column: SQLAlchemy's
  `Declarative` base reserves the `metadata` attribute name for the class's own `MetaData` object,
  so the Python attribute is `metadata_` while `mapped_column("metadata", JSONB)` keeps the actual
  column named `metadata`.

---

## 6. Container design

- **`backend` image** [built, `backend/Dockerfile`]: multi-stage — a `chainguard/python:latest-dev`
  builder stage (has a shell/pip) that runs `uv sync --frozen --no-dev` into a `.venv`, copied into
  a `chainguard/python:latest` (Wolfi-based, distroless) runtime stage. This supersedes the
  originally-proposed `python:3.12-slim` runtime: Chainguard's image ships no shell and no package
  manager, which shrinks attack surface further than slim but also means there's no `docker exec
  sh` for interactive debugging (swap the runtime `FROM` to the `-dev` variant locally if needed).
  Only the `:latest` tag is available without a paid Chainguard subscription, and it floats, so the
  Dockerfile builds and tags its own image rather than depending on the upstream tag directly.
  `ENTRYPOINT` is reset to `[]` (Chainguard bakes in `ENTRYPOINT ["/usr/bin/python"]`, which would
  otherwise swallow `CMD`). The `HEALTHCHECK` against `/health` lives in docker-compose (§7) rather
  than the Dockerfile itself. Alembic migrations are copied into the image but **not** run on
  container start, per the no-concurrent-migration-races rule below — apply them explicitly
  (`docker compose exec backend alembic upgrade head`).
- **`database` image** [built, `database/Dockerfile`]: same Chainguard/Wolfi rationale as the
  backend image, applied to Postgres (`chainguard/postgres:latest`) instead of the stock
  `postgres:<version>` image assumed implicitly above. Init SQL (`database/init/*.sql`, currently
  just the `citext` extension needed by `users.email`, §5) is baked into the image at
  `/var/lib/postgres/initdb/` — Chainguard's entrypoint reads from that path, not the
  `/docker-entrypoint-initdb.d/` path the official postgres image uses — and only runs against a
  freshly-initialized (empty) `PGDATA`. Alpine's official `postgres:<version>-alpine` is the
  documented fallback if a needed extension is ever missing from Wolfi.
- **`worker` image** [not yet built]: same codebase/base image as `backend`, different entrypoint —
  processes background jobs (CSV import parsing, email sending) off a queue, so a large upload
  never blocks a request-handling process. Keeping the same base image avoids dependency drift
  between the two. Transactional email (verification/reset) doesn't wait for this: it sends inline
  via FastAPI `BackgroundTasks` today (§1 "Email delivery"), and the `EmailSender` protocol is the
  seam to move it onto the queue later — a queue-backed sender drops in with no call-site changes.
  The SMTP password uses the same Docker-secret-file convention as `POSTGRES_PASSWORD`
  (`secrets/smtp_password_{staging,prod}.txt`, mounted as `SMTP_PASSWORD_FILE`).
- **`proxy` image** [built, `proxy/Dockerfile`]: Wolfi/Chainguard Nginx (same base rationale as
  `backend`/`database`), doubling as the frontend static host and the reverse proxy in front of
  the API — **not** a Python container. Two build targets: `dev` reverse-proxies `/` to a live
  Expo dev-server container for hot reload; `static` (default, staging/prod) bakes the Expo web
  export (`npx expo export --platform web`, `web.output=static`) into the image and serves it
  from disk. Backend routes are reverse-proxied in every target. `EXPO_PUBLIC_API_URL` is a
  build arg (Expo inlines it into the bundle). In the cloud, the static assets instead go to
  object storage + CDN (§7) since static assets don't need compute; the API reverse-proxy role
  is taken over by the cloud load balancer. The original design assumed an Angular frontend;
  the app is Expo/React-Native-Web, but the "static build served by Nginx, not Python" shape is
  unchanged.
- Config exclusively via environment variables (12-factor) — `backend`'s `Settings`
  (`app/config.py`) reads a `POSTGRES_PASSWORD_FILE` path mirroring the `database` image's own
  Docker-secret convention, so the same code path handles a plain env var locally and a mounted
  secret in staging/prod (§7) unchanged; no secrets baked into images. Images aren't yet tagged by
  git SHA — compose currently builds and tags them `:local`.

---

## 7. Container orchestration — docker-compose and cloud

**Important framing:** docker-compose and "GCP or AWS" aren't two orchestrators for the same
target — compose is for **local dev and the single-server deployment path**; the cloud path uses
the cloud provider's own container runtime (Cloud Run / ECS), which doesn't consume a compose
file directly. Both paths build from the *same* Dockerfiles, which is the actual portability win.

### docker-compose (local dev + single server)

**Built**, as a base file + per-environment overlay rather than one monolithic file:
`docker-compose.yml` defines the `db` and `backend` services (build context, healthchecks, the
shared `pantrycast` network) and is never run alone; `docker-compose.dev.yml` /
`docker-compose.staging.yml` / `docker-compose.prod.yml` layer environment-specific config on top
via `-f`:

- **dev**: plain password via `.env.dev`, Postgres port published to the host for local
  `psql`/DBeaver access, source-mounted `backend/app` + `backend/alembic` with `uvicorn --reload`,
  disposable volume. `start.sh` at the repo root wraps
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` as the one-command dev
  entrypoint.
- **staging**: mirrors prod's secret handling (Docker secret file, not a plain env var) and network
  isolation — no host port on `db`, so it's only reachable from other containers.
- **prod**: same secret-file pattern as staging, `restart: always`, and explicit CPU/memory
  `deploy.resources` limits+reservations. `proxy` publishes `:8080` as the app entry point;
  `backend` still also publishes `:8000` for direct access.
- **`proxy` + `frontend`**: every environment runs the `proxy` service (`proxy/Dockerfile`,
  §6). Dev also runs a `frontend` service (Expo dev server) that `proxy` targets for hot
  reload; staging/prod bake the static web build into the `proxy` image instead, so they run
  no `frontend` service. `EXPO_PUBLIC_API_URL` must be exported before a staging/prod
  `docker compose build`.

**Not yet built**: a `worker` service, `redis` (job queue + refresh-token/rate-limit cache),
and a TLS-terminating reverse proxy (Traefik or Caddy) doing automatic HTTPS via Let's Encrypt
in front of `proxy:8080`. The compose stack is now DB + API + frontend/reverse-proxy.

### Cloud path — GCP (recommended) vs AWS

| Concern | GCP | AWS |
|---|---|---|
| Backend/worker compute | Cloud Run (scale-to-zero, pay-per-request) | ECS Fargate (or EKS for k8s parity) |
| Database | Cloud SQL for Postgres | RDS for Postgres |
| Cache/queue | Memorystore (Redis) | ElastiCache (Redis) |
| Load balancing | Cloud Load Balancing | ALB |
| Registry | Artifact Registry | ECR |
| CI | Cloud Build / GitHub Actions | CodeBuild / GitHub Actions |
| Frontend static hosting | Cloud Storage + Cloud CDN | S3 + CloudFront |

**Recommendation: start on GCP with Cloud Run.** It scales to zero (fits "unknown number of
users" — no cost while idle, no capacity planning up front) and scales up to handle bursty or
high traffic without managing a Kubernetes cluster or fixed instance fleet. AWS ECS Fargate is
the equivalent fallback if there's existing AWS infra, credits, or team familiarity — the
Dockerfiles and app code don't change either way, only the deployment manifests (Cloud Run
service YAML / Terraform vs. ECS task definitions).

---

## 8. Single server and cloud deployment

### Single server (MVP / cost-sensitive start)

A single VPS running `docker-compose up`, Caddy/Traefik for automatic HTTPS, Postgres and Redis
as containers with persistent volumes, `pg_dump` on a cron for backups. Cheap, simple, entirely
adequate until real traffic shows up — matches "unknown number of users" by not over-building
before there's evidence of scale.

### Cloud deployment

Stateless backend/worker containers on Cloud Run (or ECS Fargate) behind a managed load
balancer/autoscaler, managed Postgres (read replicas added only once query load justifies it),
managed Redis, CI/CD (GitHub Actions) building images on merge, pushing to the registry, and
deploying via `gcloud run deploy` / `aws ecs update-service` with rolling or blue/green releases.

### The migration path between them

Both environments run the *same* container images — that's the point of containerizing in the
first place. What changes between "single server" and "cloud" is only the orchestrator/config
(a compose file vs. a cloud service definition) and where Postgres/Redis live (containers with a
volume vs. managed services). This is also the deployment-side answer to the earlier
"database-agnostic" goal: SQLAlchemy makes the *database engine* swappable; containerizing makes
the *deployment environment* swappable — together they mean starting cheap on one VPS doesn't
lock the project out of moving to Cloud Run/ECS later without a rewrite.

---

## Open questions for review

1. GCP vs AWS as the committed cloud target (recommendation: GCP/Cloud Run, above) — or keep
   both live as a genuine requirement rather than a fallback?
2. MFA for superuser accounts: mandatory at launch, or phased in after basic auth ships?
3. Job queue choice for the `worker` image — Celery (mature, heavier) vs RQ (simpler, Redis-only)?
   Lower-stakes now: transactional email already sends inline via `BackgroundTasks` behind the
   `EmailSender` protocol (§1), so the queue only gates retrying failed sends, bulk/high-volume
   email, and offloading CSV-import parsing.
4. Do we need org/team-scoped sharing of order data in the medium term? It doesn't change §1–3
   much now, but affects whether RBAC roles should be scoped per-resource sooner rather than later.
5. `orders`/`order_items` schema (§5) needs its plan refined before implementation: what's the
   import-time dedup key for a re-uploaded CSV (order number alone, or order number + retailer)?
   Is `order_number` unique per-user or globally, given different retailers can reuse the same
   numbering scheme? What's the final shape of `tracking_numbers` — a Postgres array, a JSONB list,
   or a separate `order_shipments` table if a single order can ship in multiple packages with
   different carriers?
6. `create-superuser` promotion semantics (§2), to settle when the login layer lands: should
   promoting an existing account also set `email_verified = true`, and should it refuse a
   `disabled` account rather than silently re-enabling privileges? Should the interactive
   password prompt enforce a minimum length?
