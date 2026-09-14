from typing import Any

import aiosmtplib
import pytest

from app.mailer import EmailDeliveryError, OutgoingEmail
from app.mailer.smtp import SmtpEmailSender


class _RecordingSend:
    """A stand-in for ``aiosmtplib.send`` that records its kwargs (or raises)."""

    def __init__(self, error: Exception | None = None) -> None:
        """Store an optional exception to raise on call.

        :param error: An exception to raise instead of recording, or ``None``.
        :type error: Exception | None
        """
        self._error = error
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, message: object, **kwargs: Any) -> None:
        """Record the call, or raise the configured error.

        :param message: The MIME message (recorded positionally).
        :param kwargs: The keyword arguments ``aiosmtplib.send`` was called with.
        :raises Exception: The configured error, if any.
        """
        if self._error is not None:
            raise self._error
        self.calls.append({"message": message, **kwargs})


def _sender(security: str = "starttls") -> SmtpEmailSender:
    """Build an ``SmtpEmailSender`` with throwaway connection details.

    :param security: The transport security mode to configure.
    :type security: str
    :returns: A configured sender.
    :rtype: SmtpEmailSender
    """
    return SmtpEmailSender(
        host="smtp.example.com",
        port=587,
        username="mailer",
        password="secret",
        security=security,  # type: ignore[arg-type]
        from_addr="no-reply@example.com",
    )


_MESSAGE = OutgoingEmail(to="user@example.com", subject="Hi", text_body="Body")


async def test_send_passes_the_message_and_connection_params(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify a happy-path send calls ``aiosmtplib.send`` once with host/port/credentials."""
    recorder = _RecordingSend()
    monkeypatch.setattr("app.mailer.smtp.aiosmtplib.send", recorder)

    await _sender().send(_MESSAGE)

    assert len(recorder.calls) == 1
    call = recorder.calls[0]
    assert call["hostname"] == "smtp.example.com"
    assert call["port"] == 587
    assert call["username"] == "mailer"
    assert call["password"] == "secret"
    assert call["message"]["To"] == "user@example.com"


@pytest.mark.parametrize(
    ("security", "start_tls", "use_tls"),
    [("starttls", True, False), ("tls", False, True), ("plaintext", False, False)],
)
async def test_send_maps_security_mode_to_tls_flags(
    monkeypatch: pytest.MonkeyPatch, security: str, start_tls: bool, use_tls: bool
) -> None:
    """Verify each ``smtp_security`` value sets the right ``start_tls``/``use_tls`` flags."""
    recorder = _RecordingSend()
    monkeypatch.setattr("app.mailer.smtp.aiosmtplib.send", recorder)

    await _sender(security).send(_MESSAGE)

    assert recorder.calls[0]["start_tls"] is start_tls
    assert recorder.calls[0]["use_tls"] is use_tls


async def test_send_passes_none_credentials_for_an_unauthenticated_relay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify blank username/password become ``None`` (aiosmtplib skips AUTH)."""
    recorder = _RecordingSend()
    monkeypatch.setattr("app.mailer.smtp.aiosmtplib.send", recorder)

    sender = SmtpEmailSender(
        host="localhost",
        port=1025,
        username=None,
        password=None,
        security="plaintext",
        from_addr="dev@example.com",
    )
    await sender.send(_MESSAGE)

    assert recorder.calls[0]["username"] is None
    assert recorder.calls[0]["password"] is None


@pytest.mark.parametrize(
    "error", [aiosmtplib.SMTPException("nope"), OSError("connection refused")]
)
async def test_send_wraps_transport_failures_in_email_delivery_error(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    """Verify an SMTP or socket error surfaces as ``EmailDeliveryError``, not the raw exception."""
    monkeypatch.setattr("app.mailer.smtp.aiosmtplib.send", _RecordingSend(error=error))

    with pytest.raises(EmailDeliveryError):
        await _sender().send(_MESSAGE)


async def test_send_wraps_a_mime_build_failure_in_email_delivery_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify a message that can't be built (bad From header) surfaces as ``EmailDeliveryError``.

    The background send helpers only catch ``EmailDeliveryError``, so MIME-build
    failures must come through that channel too, not as a raw ``ValueError``.
    """
    monkeypatch.setattr("app.mailer.smtp.aiosmtplib.send", _RecordingSend())
    sender = SmtpEmailSender(
        host="smtp.example.com",
        port=587,
        username=None,
        password=None,
        security="starttls",
        from_addr="no-reply@example.com\nBcc: evil@example.com",
    )

    with pytest.raises(EmailDeliveryError):
        await sender.send(_MESSAGE)
