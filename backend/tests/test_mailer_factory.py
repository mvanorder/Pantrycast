import pytest

from app.config import Settings
from app.mailer.console import ConsoleEmailSender
from app.mailer.factory import get_email_sender
from app.mailer.smtp import SmtpEmailSender


def _use_settings(monkeypatch: pytest.MonkeyPatch, settings: Settings) -> None:
    """Point ``get_email_sender`` at a specific ``Settings`` and clear its cache.

    :param monkeypatch: Pytest's monkeypatch fixture.
    :type monkeypatch: pytest.MonkeyPatch
    :param settings: The settings ``get_email_sender`` should read.
    :type settings: Settings
    """
    monkeypatch.setattr("app.mailer.factory.get_settings", lambda: settings)
    get_email_sender.cache_clear()


def test_defaults_to_console_and_logs_an_error(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Verify ``EMAIL_BACKEND=auto`` with no ``SMTP_HOST`` yields a console sender + an error log."""
    _use_settings(monkeypatch, Settings(_env_file=None, smtp_host=None))
    try:
        with caplog.at_level("ERROR", logger="app.mailer.factory"):
            sender = get_email_sender()

        assert isinstance(sender, ConsoleEmailSender)
        assert any(
            r.levelname == "ERROR" and "SMTP_HOST" in r.message for r in caplog.records
        )
    finally:
        get_email_sender.cache_clear()


def test_builds_smtp_sender_when_a_host_is_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify a configured ``SMTP_HOST`` (backend ``auto``) yields an ``SmtpEmailSender``."""
    _use_settings(
        monkeypatch,
        Settings(
            _env_file=None,
            smtp_host="smtp.example.com",
            smtp_user="mailer",
            smtp_password="secret",
        ),
    )
    try:
        assert isinstance(get_email_sender(), SmtpEmailSender)
    finally:
        get_email_sender.cache_clear()


def test_console_backend_overrides_a_configured_host(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Verify ``EMAIL_BACKEND=console`` forces the console sender (with a warning) despite a host."""
    _use_settings(
        monkeypatch,
        Settings(_env_file=None, smtp_host="smtp.example.com", email_backend="console"),
    )
    try:
        with caplog.at_level("WARNING", logger="app.mailer.factory"):
            sender = get_email_sender()

        assert isinstance(sender, ConsoleEmailSender)
        assert any("overrides the configured SMTP_HOST" in r.message for r in caplog.records)
    finally:
        get_email_sender.cache_clear()


def test_explicit_console_backend_without_a_host_is_quiet(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Verify a deliberate ``EMAIL_BACKEND=console`` with no host logs nothing (expected setup)."""
    _use_settings(monkeypatch, Settings(_env_file=None, smtp_host=None, email_backend="console"))
    try:
        with caplog.at_level("WARNING", logger="app.mailer.factory"):
            sender = get_email_sender()

        assert isinstance(sender, ConsoleEmailSender)
        assert not caplog.records
    finally:
        get_email_sender.cache_clear()


def test_sender_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify repeat calls return the same instance (``@lru_cache``)."""
    _use_settings(monkeypatch, Settings(_env_file=None, smtp_host=None))
    try:
        assert get_email_sender() is get_email_sender()
    finally:
        get_email_sender.cache_clear()
