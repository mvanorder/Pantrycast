from datetime import timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings, _generate_ephemeral_jwt_keypair, get_settings


def test_db_password_from_postgres_password() -> None:
    """Verify ``_db_password`` returns the plain ``postgres_password`` value."""
    settings = Settings(_env_file=None, postgres_password="pw", postgres_password_file=None)

    assert settings._db_password == "pw"


def test_db_password_from_password_file(tmp_path: Path) -> None:
    """Verify ``_db_password`` reads and strips a configured password file.

    :param tmp_path: Pytest-provided temporary directory.
    :type tmp_path: Path
    """
    password_file = tmp_path / "password"
    password_file.write_text("filepw\n")
    settings = Settings(
        _env_file=None, postgres_password=None, postgres_password_file=str(password_file)
    )

    assert settings._db_password == "filepw"


def test_db_password_file_missing_raises() -> None:
    """Verify a nonexistent ``postgres_password_file`` raises ``ValueError``."""
    settings = Settings(
        _env_file=None,
        postgres_password=None,
        postgres_password_file="C:/nonexistent/password/path",
    )

    with pytest.raises(ValueError, match="Could not read POSTGRES_PASSWORD_FILE"):
        _ = settings._db_password


def test_db_password_unset_raises() -> None:
    """Verify omitting both password sources raises ``ValueError``."""
    settings = Settings(_env_file=None, postgres_password=None, postgres_password_file=None)

    with pytest.raises(ValueError, match="Set POSTGRES_PASSWORD or POSTGRES_PASSWORD_FILE"):
        _ = settings._db_password


def test_database_url_percent_encodes_special_characters() -> None:
    """Verify ``database_url`` percent-encodes special characters in the password."""
    settings = Settings(
        _env_file=None,
        postgres_user="user",
        postgres_password="p@ss:word",
        postgres_password_file=None,
        postgres_host="localhost",
        postgres_port=5432,
        postgres_db="pantrycast",
    )

    url = settings.database_url.render_as_string(hide_password=False)

    assert url.startswith("postgresql+asyncpg://")
    assert "p@ss:word" not in url
    assert "%40" in url  # percent-encoded "@"


def test_database_url_uses_cloud_sql_socket_when_configured() -> None:
    """Verify ``database_url`` switches to the Cloud SQL Auth Proxy socket form."""
    settings = Settings(
        _env_file=None,
        postgres_user="user",
        postgres_password="password",
        postgres_password_file=None,
        postgres_db="pantrycast",
        cloud_sql_connection_name="pantrycast-prod:us-central1:pantrycast-db",
    )

    url = settings.database_url.render_as_string(hide_password=False)

    assert url.startswith("postgresql+asyncpg://user:password@/pantrycast?host=")
    assert "%2Fcloudsql%2Fpantrycast-prod%3Aus-central1%3Apantrycast-db" in url


def test_database_url_ignores_postgres_host_and_port_when_cloud_sql_configured(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify a configured ``postgres_host``/``postgres_port`` is dropped, with a warning.

    :param caplog: Pytest fixture capturing log records.
    :type caplog: pytest.LogCaptureFixture
    """
    settings = Settings(
        _env_file=None,
        postgres_user="user",
        postgres_password="password",
        postgres_password_file=None,
        postgres_db="pantrycast",
        postgres_host="should-be-ignored",
        postgres_port=6543,
        cloud_sql_connection_name="pantrycast-prod:us-central1:pantrycast-db",
    )

    url = settings.database_url.render_as_string(hide_password=False)

    assert "should-be-ignored" not in url
    assert "6543" not in url
    assert "POSTGRES_HOST/POSTGRES_PORT (should-be-ignored:6543) are ignored" in caplog.text


def test_database_url_warns_on_stray_postgres_host_alone(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify a non-default ``postgres_host`` alone (default port) still triggers the warning.

    :param caplog: Pytest fixture capturing log records.
    :type caplog: pytest.LogCaptureFixture
    """
    settings = Settings(
        _env_file=None,
        postgres_user="user",
        postgres_password="password",
        postgres_password_file=None,
        postgres_db="pantrycast",
        postgres_host="should-be-ignored",
        cloud_sql_connection_name="pantrycast-prod:us-central1:pantrycast-db",
    )

    _ = settings.database_url

    assert "POSTGRES_HOST/POSTGRES_PORT (should-be-ignored:5432) are ignored" in caplog.text


def test_cloud_sql_connection_name_rejects_malformed_value() -> None:
    """Verify a ``cloud_sql_connection_name`` without exactly two colons is rejected."""
    with pytest.raises(ValidationError, match="must look like"):
        Settings(_env_file=None, cloud_sql_connection_name="not-a-valid-connection-name")


def test_cloud_sql_connection_name_empty_string_treated_as_unset() -> None:
    """Verify an empty ``cloud_sql_connection_name`` doesn't fail validation or switch modes.

    Matches the truthy-check convention used by ``postgres_password_file`` and
    the other optional settings, so a blank env var (e.g. from
    ``${VAR:-}``-style shell interpolation) behaves as "not configured"
    rather than hard-failing startup.
    """
    settings = Settings(
        _env_file=None,
        postgres_password="password",
        postgres_password_file=None,
        cloud_sql_connection_name="",
    )

    url = settings.database_url.render_as_string(hide_password=False)

    assert "cloudsql" not in url


def test_get_settings_returns_cached_singleton() -> None:
    """Verify ``get_settings`` returns the same cached instance on repeat calls."""
    get_settings.cache_clear()
    try:
        first = get_settings()
        second = get_settings()

        assert first is second
    finally:
        get_settings.cache_clear()


def testjwt_private_key_pem_from_value() -> None:
    """Verify ``jwt_private_key_pem`` returns the plain ``jwt_private_key`` value."""
    settings = Settings(
        _env_file=None,
        jwt_private_key="pem-value",
        jwt_public_key="pem-value",
    )

    assert settings.jwt_private_key_pem == "pem-value"


def testjwt_private_key_pem_from_file(tmp_path: Path) -> None:
    """Verify ``jwt_private_key_pem`` reads and strips a configured key file.

    :param tmp_path: Pytest-provided temporary directory.
    :type tmp_path: Path
    """
    key_file = tmp_path / "jwt_private.pem"
    key_file.write_text("file-pem\n")
    settings = Settings(
        _env_file=None,
        jwt_private_key_file=str(key_file),
        jwt_public_key_file=str(key_file),
    )

    assert settings.jwt_private_key_pem == "file-pem"


def testjwt_private_key_pem_file_missing_raises() -> None:
    """Verify a nonexistent ``jwt_private_key_file`` raises ``ValueError``."""
    settings = Settings(
        _env_file=None,
        jwt_private_key_file="C:/nonexistent/jwt_private.pem",
        jwt_public_key="pem-value",
    )

    with pytest.raises(ValueError, match="Could not read JWT_PRIVATE_KEY_FILE"):
        _ = settings.jwt_private_key_pem


def testjwt_public_key_pem_from_value() -> None:
    """Verify ``jwt_public_key_pem`` returns the plain ``jwt_public_key`` value."""
    settings = Settings(
        _env_file=None,
        jwt_private_key="pem-value",
        jwt_public_key="pem-value",
    )

    assert settings.jwt_public_key_pem == "pem-value"


def testjwt_public_key_pem_from_file(tmp_path: Path) -> None:
    """Verify ``jwt_public_key_pem`` reads and strips a configured key file.

    :param tmp_path: Pytest-provided temporary directory.
    :type tmp_path: Path
    """
    key_file = tmp_path / "jwt_public.pem"
    key_file.write_text("file-pem\n")
    settings = Settings(
        _env_file=None,
        jwt_private_key_file=str(key_file),
        jwt_public_key_file=str(key_file),
    )

    assert settings.jwt_public_key_pem == "file-pem"


def testjwt_public_key_pem_file_missing_raises() -> None:
    """Verify a nonexistent ``jwt_public_key_file`` raises ``ValueError``."""
    settings = Settings(
        _env_file=None,
        jwt_private_key="pem-value",
        jwt_public_key_file="C:/nonexistent/jwt_public.pem",
    )

    with pytest.raises(ValueError, match="Could not read JWT_PUBLIC_KEY_FILE"):
        _ = settings.jwt_public_key_pem


def test_jwt_key_pairing_rejects_private_only() -> None:
    """Verify configuring only a private key is rejected, not silently mismatched."""
    with pytest.raises(ValidationError, match="Set both a JWT private key and public key"):
        Settings(_env_file=None, jwt_private_key="pem-value", jwt_public_key=None)


def test_jwt_key_pairing_rejects_public_only() -> None:
    """Verify configuring only a public key is rejected, not silently mismatched."""
    with pytest.raises(ValidationError, match="Set both a JWT private key and public key"):
        Settings(_env_file=None, jwt_private_key=None, jwt_public_key="pem-value")


def test_jwt_keys_ephemeral_fallback_when_unset() -> None:
    """Verify omitting all four JWT settings falls back to a matching ephemeral keypair."""
    _generate_ephemeral_jwt_keypair.cache_clear()
    settings = Settings(
        _env_file=None,
        jwt_private_key=None,
        jwt_private_key_file=None,
        jwt_public_key=None,
        jwt_public_key_file=None,
    )

    private_pem = settings.jwt_private_key_pem
    public_pem = settings.jwt_public_key_pem

    assert "BEGIN PRIVATE KEY" in private_pem
    assert "BEGIN PUBLIC KEY" in public_pem
    # Cached: a second access (even from a fresh Settings instance) returns
    # the same keypair rather than a new, mismatched one.
    assert Settings(_env_file=None).jwt_private_key_pem == private_pem


def test_jwt_keys_ephemeral_fallback_logs_warning(caplog: pytest.LogCaptureFixture) -> None:
    """Verify the ephemeral fallback logs a warning explaining why and the risk."""
    _generate_ephemeral_jwt_keypair.cache_clear()
    settings = Settings(_env_file=None)

    with caplog.at_level("WARNING"):
        _ = settings.jwt_private_key_pem

    assert any("ephemeral" in record.message for record in caplog.records)


def test_access_token_ttl() -> None:
    """Verify ``access_token_ttl`` converts the configured minutes to a ``timedelta``."""
    settings = Settings(_env_file=None, jwt_access_token_ttl_minutes=42)

    assert settings.access_token_ttl == timedelta(minutes=42)


def test_refresh_token_ttl() -> None:
    """Verify ``refresh_token_ttl`` converts the configured days to a ``timedelta``."""
    settings = Settings(_env_file=None, jwt_refresh_token_ttl_days=7)

    assert settings.refresh_token_ttl == timedelta(days=7)
