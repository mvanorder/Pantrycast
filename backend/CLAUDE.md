# CLAUDE.md (backend)

This file provides guidance to Claude Code when working in `backend/`.

## Project overview

FastAPI backend for the _Pantrycast_ project. It exposes
HTTP endpoints for uploading/inspecting order data and persists to Postgres
via SQLAlchemy's async engine, with Alembic managing schema migrations.

- `app/main.py` — FastAPI app; mounts the routers below plus its own
  `/health`, `/health/db`, `/orders/upload`.
- `app/routers/auth.py` — `POST /auth/{register,verify-email,login,refresh,logout,logout-all}`
  (see `docs/design/uac-design.md` §1 "Authentication endpoints" for the full
  contract: transport, error codes, refresh-token rotation/reuse semantics).
  `register` issues a verification token and schedules the email; `verify-email`
  consumes it (hash + purpose lookup, row-locked against a double-spend race).
- `app/routers/users.py` — `GET /users/me`, the first protected route.
- `app/dependencies.py` — `get_current_user`, the `HTTPBearer`-based
  dependency every protected route depends on.
- `app/security.py` — password hashing/verification (argon2), JWT
  encode/decode (RS256), and refresh-token generate/hash helpers. Pure
  crypto/token logic, no FastAPI imports — shared by both the auth routes
  and `app/cli.py`'s `create-superuser`.
- `app/tokens.py` — single-use email-verification / password-reset token
  generate + SHA-256 hash (`VerificationPurpose` enum), same shape as
  `security.py`'s refresh-token helpers. No FastAPI imports. The
  `verification_tokens` table is `app/models/verification_token.py`. The
  `verify-email` endpoint (`app/routers/auth.py`) is built; `password-reset`
  isn't yet.
- `app/mailer/` — outgoing transactional email (uac-design.md §1). The
  `EmailSender` protocol plus an `aiosmtplib` SMTP sender (`smtp.py`) and a
  console sender (`console.py`, logs instead of sending — the zero-setup
  default when `SMTP_HOST` is unset). `__init__.py` has MIME building and the
  message templates; `delivery.py` has the `BackgroundTasks`-ready send
  helpers a route schedules; `factory.py` has `get_email_sender` (a
  `Depends(...)` target, like `get_settings`). No FastAPI imports below
  `factory.py`. `register` (`app/routers/auth.py`) schedules the
  verification email; the `password-reset` send path isn't wired up yet.
- `app/schemas.py` — Pydantic request/response models for the auth/user API.
- `app/config.py` — `Settings` (pydantic-settings) for Postgres connection,
  JWT signing-key, and SMTP/email config, loaded from `backend/.env` (see
  `.env.example`) or environment variables. The JWT keypair falls back to an
  ephemeral in-process one if `JWT_PRIVATE_KEY[_FILE]`/`JWT_PUBLIC_KEY[_FILE]`
  are unset — zero setup for local dev/tests, but logs a warning, since it's
  unsafe for a real multi-replica deployment (see the property's docstring).
  `SMTP_PASSWORD[_FILE]` uses the same secret + secret-file dual pattern as
  `POSTGRES_PASSWORD`; with `SMTP_HOST` unset the app uses the console sender.
- `app/db.py` — async engine/session setup (`get_engine`, `get_sessionmaker`,
  `get_db`) and the declarative `Base` for ORM models.
- `alembic/`, `alembic.ini` — migrations; `alembic/env.py` builds the DB URL
  from `app.config.Settings` rather than `alembic.ini`'s `sqlalchemy.url`.

## Running

From `backend/`, with the venv active:

- `uvicorn app.main:app --reload` — run the dev server.
- `alembic upgrade head` — apply migrations.
- `alembic revision --autogenerate -m "<message>"` — generate a migration.
- `python -m app.cli create-superuser --email <email>` — create (or promote) a superuser.
  `--email` is prompted for interactively if omitted (and required as a flag when there's no
  terminal). Reads the initial password from `SUPERUSER_PASSWORD` or `SUPERUSER_PASSWORD_FILE`;
  with neither set it prompts for the password (twice, to confirm) when run at a terminal.
  Submitting an empty password — or, in non-interactive automation, leaving both env vars unset —
  bootstraps a Google-OAuth-only account instead (see `docs/design/uac-design.md` §2). Safe to
  re-run — it promotes an existing account rather than duplicating it.
- `python -m app.cli export-openapi [--output <path>]` — write the app's current OpenAPI schema
  to `docs/api/openapi.json` (the default, resolved from the repo root regardless of cwd). Run
  this after any route/schema change and commit the result — see `docs/api/README.md`. No DB
  connection needed; it only introspects the FastAPI app object.

## Docstring conventions

- **Every** Python class and function/method — public or private — must have
  a docstring. At minimum, a one-line summary of its purpose; no exceptions
  for "obvious" or trivial ones.
- **Every** module (`.py` file) must also have a one-line module-level
  docstring as its first statement, e.g. `"""Async SQLAlchemy engine/session
  setup and the declarative ORM base."""` at the top of `app/db.py`.
- Use **reST style** for docstrings (`:param:`, `:type:`, `:returns:`,
  `:rtype:`, `:raises:`), e.g.:

  ```python
  def get_settings() -> Settings:
      """Return the cached application settings singleton.

      :returns: The process-wide ``Settings`` instance.
      :rtype: Settings
      """
  ```

  ```python
  async def upload_orders_csv(file: UploadFile) -> dict:
      """Parse an uploaded Walmart order-history CSV and echo its rows.

      :param file: The uploaded CSV file.
      :type file: UploadFile
      :raises HTTPException: If the file is missing, not a ``.csv``, not
          valid UTF-8, or has no header row.
      :returns: The filename, column names, row count, and parsed rows.
      :rtype: dict
      """
  ```

- Omit a `:param:`/`:returns:`/`:raises:` line only when it doesn't apply
  (e.g. no parameters, no meaningful return value) — don't pad docstrings
  with empty sections.
- FastAPI route docstrings still need `:param:`/`:returns:`/`:raises:` where
  applicable, in addition to serving as the OpenAPI summary.
