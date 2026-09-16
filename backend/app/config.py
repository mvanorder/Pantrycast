"""Application settings loaded from environment variables or ``backend/.env``."""

import logging
from datetime import timedelta
from email.utils import parseaddr
from functools import lru_cache
from pathlib import Path
from typing import Literal

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"  # backend/.env

# Hosts for which SMTP_SECURITY=plaintext is tolerated — a local dev catcher
# (Mailpit, aiosmtpd) never leaves the machine/compose network. Anything else
# on plaintext would put verification/reset tokens on the wire in the clear.
_LOCAL_SMTP_HOSTS = {"localhost", "127.0.0.1", "::1", "mailpit"}

logger = logging.getLogger(__name__)


def _read_required_file(path: str, env_var_name: str) -> str:
    """Read and strip a secret/config file, raising a clear error if it's missing.

    :param path: Filesystem path taken from the configuring env var.
    :type path: str
    :param env_var_name: The env var's name, used only in the error message.
    :type env_var_name: str
    :raises ValueError: If no file exists at ``path``.
    :returns: The file's contents, stripped of surrounding whitespace.
    :rtype: str
    """
    file_path = Path(path)
    if not file_path.exists():
        raise ValueError(f"Could not read {env_var_name}: {path}")
    return file_path.read_text(encoding="utf-8").strip()


@lru_cache
def _generate_ephemeral_jwt_keypair() -> tuple[str, str]:
    """Generate and cache a process-local RSA keypair for JWT signing.

    Used only when neither a JWT private key nor public key is configured —
    local dev and tests get a working keypair with zero setup, and no private
    key material is ever committed to git. **Not safe for a real deployment**:
    every replica would mint a different keypair (tokens wouldn't verify
    across instances) and every process restart would invalidate every
    access token — see ``docs/design/uac-design.md`` §1. Cached via
    ``lru_cache`` (mirroring ``get_engine``/``get_sessionmaker`` below) so the
    same keypair is reused for the life of the process, not regenerated on
    every access/refresh-token operation.

    :returns: A ``(private_key_pem, public_key_pem)`` pair — unencrypted
        PKCS8 / SubjectPublicKeyInfo PEM, respectively.
    :rtype: tuple[str, str]
    """
    logger.warning(
        "No JWT signing key configured (JWT_PRIVATE_KEY/JWT_PUBLIC_KEY) — "
        "generating an ephemeral in-memory RSA keypair. This is fine for "
        "local dev/tests; it is NOT safe for a real deployment, since tokens "
        "won't survive a restart or verify across replicas. Set "
        "JWT_PRIVATE_KEY_FILE/JWT_PUBLIC_KEY_FILE to fix."
    )
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_pem, public_pem


class Settings(BaseSettings):
    """Application settings loaded from environment variables or ``backend/.env``."""

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "pantrycast"
    postgres_db: str = "pantrycast"
    postgres_password: SecretStr | None = None
    # Mirrors the db container's own POSTGRES_PASSWORD_FILE convention
    # (see database/Dockerfile) so the same Settings code works unchanged
    # once the backend is containerized for staging/prod.
    postgres_password_file: str | None = None
    # Set on Cloud Run to reach Cloud SQL over the Auth Proxy's Unix socket
    # (mounted at /cloudsql/<connection-name>, e.g.
    # "my-project:us-central1:my-instance") instead of postgres_host/port.
    # Leaving this unset preserves the existing TCP behavior for
    # local/docker-compose. See the database_url property below.
    cloud_sql_connection_name: str | None = None

    # Same SETTING/SETTING_FILE dual pattern as postgres_password, applied to
    # the RS256 keypair used to sign/verify access tokens (uac-design.md §1).
    # Leaving all four unset falls back to _generate_ephemeral_jwt_keypair()
    # above, for zero-setup local dev/tests.
    jwt_private_key: SecretStr | None = None
    jwt_private_key_file: str | None = None
    jwt_public_key: str | None = None
    jwt_public_key_file: str | None = None
    jwt_access_token_ttl_minutes: int = 15
    jwt_refresh_token_ttl_days: int = 30

    # Outgoing email (uac-design.md §1 "Password handling"). With SMTP_HOST
    # unset the app falls back to a console sender that logs instead of
    # sending — zero-setup local dev/tests, same spirit as the ephemeral JWT
    # keypair above. SMTP_PASSWORD/_FILE is the same SecretStr + secret-file
    # dual pattern as POSTGRES_PASSWORD.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_password_file: str | None = None
    smtp_security: Literal["starttls", "tls", "plaintext"] = "starttls"
    email_from: str = "Shopping Analysis <no-reply@localhost>"
    # Public base URL the verification/reset links point at — a frontend page
    # (the proxy origin in dev), not the API endpoint.
    email_base_url: str = "http://localhost:8080"
    email_backend: Literal["auto", "smtp", "console"] = "auto"
    verification_token_ttl_hours: int = Field(default=24, gt=0)

    @field_validator(
        "smtp_host", "smtp_user", "smtp_password", "smtp_password_file", mode="before"
    )
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        """Treat a blank/whitespace-only optional SMTP string as unset.

        ``.env`` templates ship keys like ``SMTP_HOST=`` with an empty value;
        without this an empty string would read as "configured" and slip past
        the ``is None`` / truthiness checks below.

        :param value: The raw field value from the environment or ``.env``.
        :type value: object
        :returns: ``None`` for an empty/whitespace string, else ``value`` as-is.
        :rtype: object
        """
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _validate_jwt_key_pairing(self) -> "Settings":
        """Reject a half-configured JWT keypair rather than silently mismatching it.

        Configuring only one of the private/public key would otherwise make
        ``jwt_private_key_pem``/``jwt_public_key_pem`` independently fall
        back to the ephemeral keypair for whichever side is missing — i.e. a
        real configured private key paired with an unrelated ephemeral
        public key, so every token it signs would fail verification.

        :raises ValueError: If exactly one of the private/public key sources
            is configured.
        :returns: ``self``, unchanged, once validated.
        :rtype: Settings
        """
        has_private = bool(self.jwt_private_key or self.jwt_private_key_file)
        has_public = bool(self.jwt_public_key or self.jwt_public_key_file)
        if has_private != has_public:
            raise ValueError(
                "Set both a JWT private key and public key (JWT_PRIVATE_KEY[_FILE] and "
                "JWT_PUBLIC_KEY[_FILE]), or neither to use an ephemeral dev/test keypair — "
                "configuring only one would silently verify tokens against an unrelated key."
            )
        return self

    @model_validator(mode="after")
    def _validate_cloud_sql_connection_name(self) -> "Settings":
        """Reject a malformed ``cloud_sql_connection_name`` rather than failing at connect time.

        The Cloud SQL Auth Proxy's socket directory is named
        ``<project>:<region>:<instance>``. Catching a typo'd value here
        surfaces a clear startup error instead of an opaque "socket not
        found" failure from asyncpg on first database access.

        :raises ValueError: If set but not exactly three colon-separated
            non-empty parts.
        :returns: ``self``, unchanged, once validated.
        :rtype: Settings
        """
        name = self.cloud_sql_connection_name
        if name:
            parts = name.split(":")
            if len(parts) != 3 or not all(parts):
                raise ValueError(
                    "CLOUD_SQL_CONNECTION_NAME must look like "
                    "'<project>:<region>:<instance>' (Cloud SQL's own connection-name format), "
                    f"got: {name!r}"
                )
        return self

    @model_validator(mode="after")
    def _validate_email_config(self) -> "Settings":
        """Reject a half- or mis-configured email setup at startup, not on the first send.

        A background email send logs and swallows failures (see
        ``app.mailer.delivery``), so a silently broken config would make email
        verification / password reset fail with only a log line. Catch the
        knowable cases here instead, in the spirit of
        :meth:`_validate_jwt_key_pairing`. Reachability of a *given* host can't
        be checked here — only that the config is internally coherent.

        :raises ValueError: If ``EMAIL_FROM`` has no address; if
            ``EMAIL_BASE_URL`` isn't ``http(s)``; if both ``SMTP_PASSWORD`` and
            ``SMTP_PASSWORD_FILE`` are set; if ``EMAIL_BACKEND=smtp`` without an
            ``SMTP_HOST``; or, once SMTP is in use, if the ``SMTP_USER`` /
            ``SMTP_PASSWORD[_FILE]`` pair is half-configured, if
            ``SMTP_PASSWORD_FILE`` names a missing file, or if
            ``SMTP_SECURITY=plaintext`` is used with a non-local ``SMTP_HOST``
            or with credentials.
        :returns: ``self``, unchanged, once validated.
        :rtype: Settings
        """
        if "@" not in parseaddr(self.email_from)[1]:
            raise ValueError(f"EMAIL_FROM is not a valid address: {self.email_from!r}")
        if not self.email_base_url.startswith(("http://", "https://")):
            raise ValueError(f"EMAIL_BASE_URL must be an http(s) URL: {self.email_base_url!r}")
        if self.smtp_password and self.smtp_password_file:
            raise ValueError("Set SMTP_PASSWORD or SMTP_PASSWORD_FILE, not both.")
        if self.email_backend == "smtp" and not self.smtp_host:
            raise ValueError("EMAIL_BACKEND=smtp requires SMTP_HOST to be set.")

        # The rest only matters when mail actually goes over SMTP — blanking
        # SMTP_HOST while leaving a stray SMTP_USER shouldn't fail the boot.
        if self.email_backend == "console" or not self.smtp_host:
            return self

        has_user = bool(self.smtp_user)
        has_password = bool(self.smtp_password or self.smtp_password_file)
        if has_user != has_password:
            raise ValueError(
                "Set both SMTP_USER and SMTP_PASSWORD[_FILE] (an authenticated relay) "
                "or neither (an unauthenticated relay)."
            )
        if self.smtp_security == "plaintext":
            if self.smtp_host not in _LOCAL_SMTP_HOSTS:
                raise ValueError(
                    "SMTP_SECURITY=plaintext is only allowed for a local relay "
                    f"({', '.join(sorted(_LOCAL_SMTP_HOSTS))}) — otherwise the message, "
                    "including its verification/reset token, crosses the network unencrypted."
                )
            if has_password:
                raise ValueError(
                    "SMTP_SECURITY=plaintext with credentials would send the SMTP password "
                    "in the clear even to a local relay — use starttls/tls or drop the credentials."
                )
        if self.smtp_password_file and not Path(self.smtp_password_file).exists():
            raise ValueError(f"Could not read SMTP_PASSWORD_FILE: {self.smtp_password_file}")
        return self

    @property
    def smtp_password_value(self) -> str | None:
        """Get the SMTP password, or ``None`` if the sender needs no auth.

        :raises ValueError: If ``SMTP_PASSWORD_FILE`` is set but the file it
            names doesn't exist.
        :returns: The password from ``SMTP_PASSWORD``, then
            ``SMTP_PASSWORD_FILE``, else ``None``.
        :rtype: str | None
        """
        if self.smtp_password:
            return self.smtp_password.get_secret_value()
        if self.smtp_password_file:
            return _read_required_file(self.smtp_password_file, "SMTP_PASSWORD_FILE")
        return None

    @property
    def verification_token_ttl(self) -> timedelta:
        """Get how long an issued email-verification / password-reset token stays valid.

        :returns: The verification token lifetime.
        :rtype: timedelta
        """
        return timedelta(hours=self.verification_token_ttl_hours)

    @property
    def _db_password(self) -> str:
        """Get and return the database password.

        :raises ValueError: If the file specified in POSTGRES_PASSWORD_FILE
            does not exist.
        :raises ValueError: If POSTGRES_PASSWORD and POSTGRES_PASSWORD_FILE
            are both not set.
        :returns: The plaintext database password.
        :rtype: str
        """
        if self.postgres_password:
            return self.postgres_password.get_secret_value()
        if self.postgres_password_file:
            return _read_required_file(self.postgres_password_file, "POSTGRES_PASSWORD_FILE")

        raise ValueError("Set POSTGRES_PASSWORD or POSTGRES_PASSWORD_FILE")

    @property
    def jwt_private_key_pem(self) -> str:
        """Get the PEM-encoded RSA private key used to sign access tokens.

        :raises ValueError: If JWT_PRIVATE_KEY_FILE is set but the file it
            names doesn't exist.
        :returns: The private key, from JWT_PRIVATE_KEY, JWT_PRIVATE_KEY_FILE,
            or (if neither is set) an ephemeral per-process keypair.
        :rtype: str
        """
        if self.jwt_private_key:
            return self.jwt_private_key.get_secret_value()
        if self.jwt_private_key_file:
            return _read_required_file(self.jwt_private_key_file, "JWT_PRIVATE_KEY_FILE")
        return _generate_ephemeral_jwt_keypair()[0]

    @property
    def jwt_public_key_pem(self) -> str:
        """Get the PEM-encoded RSA public key used to verify access tokens.

        :raises ValueError: If JWT_PUBLIC_KEY_FILE is set but the file it
            names doesn't exist.
        :returns: The public key, from JWT_PUBLIC_KEY, JWT_PUBLIC_KEY_FILE,
            or (if neither is set) an ephemeral per-process keypair.
        :rtype: str
        """
        if self.jwt_public_key:
            return self.jwt_public_key
        if self.jwt_public_key_file:
            return _read_required_file(self.jwt_public_key_file, "JWT_PUBLIC_KEY_FILE")
        return _generate_ephemeral_jwt_keypair()[1]

    @property
    def access_token_ttl(self) -> timedelta:
        """Get how long an issued access token remains valid.

        :returns: The access token lifetime.
        :rtype: timedelta
        """
        return timedelta(minutes=self.jwt_access_token_ttl_minutes)

    @property
    def refresh_token_ttl(self) -> timedelta:
        """Get how long an issued refresh token remains valid.

        :returns: The refresh token lifetime.
        :rtype: timedelta
        """
        return timedelta(days=self.jwt_refresh_token_ttl_days)

    @property
    def database_url(self) -> URL:
        """Build the Postgres connection URL from the configured settings.

        Uses ``URL.create``, which percent-encodes the username/password,
        so special characters (e.g. "@" or ":" in a password) don't get
        misparsed as URL syntax.

        If ``cloud_sql_connection_name`` is set, connects over the Cloud SQL
        Auth Proxy's Unix socket (``/cloudsql/<connection-name>``, mounted
        into the container by Cloud Run) instead of TCP — asyncpg takes the
        socket directory via a ``host`` query param rather than the URL's
        host/port fields. ``postgres_host``/``postgres_port`` are ignored in
        that case (the socket path fully determines the target instance).

        :returns: The async Postgres connection URL.
        :rtype: URL
        """
        if self.cloud_sql_connection_name:
            if self.postgres_host != "localhost" or self.postgres_port != 5432:
                logger.warning(
                    "POSTGRES_HOST/POSTGRES_PORT (%s:%s) are ignored because "
                    "CLOUD_SQL_CONNECTION_NAME is set — the Cloud SQL Auth Proxy "
                    "socket doesn't use them.",
                    self.postgres_host,
                    self.postgres_port,
                )
            return URL.create(
                drivername="postgresql+asyncpg",
                username=self.postgres_user,
                password=self._db_password,
                database=self.postgres_db,
                query={"host": f"/cloudsql/{self.cloud_sql_connection_name}"},
            )
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.postgres_user,
            password=self._db_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings singleton.

    :returns: The process-wide ``Settings`` instance.
    :rtype: Settings
    """
    return Settings()
