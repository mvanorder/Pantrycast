"""Application settings loaded from environment variables or ``backend/.env``."""

import logging
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"  # backend/.env

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

        :returns: The async Postgres connection URL.
        :rtype: URL
        """
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
