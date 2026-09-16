import logging
from datetime import timedelta

import pytest

from app.mailer.delivery import send_password_reset_email, send_verification_email
from tests.fakes import FakeEmailSender

_TTL = timedelta(hours=12)


async def test_send_verification_email_delivers_one_addressed_message() -> None:
    """Verify the helper renders and sends a single verification message with the token link."""
    sender = FakeEmailSender()

    await send_verification_email(
        sender, to_email="new@example.com", token="tok", base_url="https://app.example.com", ttl=_TTL
    )

    assert len(sender.sent) == 1
    assert sender.sent[0].to == "new@example.com"
    assert "https://app.example.com/verify-email?token=tok" in sender.sent[0].text_body


async def test_send_password_reset_email_delivers_one_addressed_message() -> None:
    """Verify the helper renders and sends a single reset message with the token link."""
    sender = FakeEmailSender()

    await send_password_reset_email(
        sender, to_email="u@example.com", token="r", base_url="https://app.example.com", ttl=_TTL
    )

    assert len(sender.sent) == 1
    assert "https://app.example.com/reset-password?token=r" in sender.sent[0].text_body


async def test_send_verification_email_swallows_and_logs_a_delivery_failure(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify a failed send is logged at ERROR and does not propagate (response is already sent)."""
    sender = FakeEmailSender(raise_error=True)

    with caplog.at_level(logging.ERROR, logger="app.mailer.delivery"):
        await send_verification_email(
            sender, to_email="new@example.com", token="t", base_url="https://x", ttl=_TTL
        )

    assert any(record.levelno == logging.ERROR for record in caplog.records)
    assert "new@example.com" in caplog.text


async def test_send_password_reset_email_swallows_and_logs_a_delivery_failure(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify the reset helper also logs and swallows a delivery failure."""
    sender = FakeEmailSender(raise_error=True)

    with caplog.at_level(logging.ERROR, logger="app.mailer.delivery"):
        await send_password_reset_email(
            sender, to_email="u@example.com", token="t", base_url="https://x", ttl=_TTL
        )

    assert "u@example.com" in caplog.text


async def test_send_verification_email_swallows_a_render_time_value_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify a malformed recipient (rejected when the message is built) is logged, not raised."""
    sender = FakeEmailSender()

    with caplog.at_level(logging.ERROR, logger="app.mailer.delivery"):
        await send_verification_email(
            sender, to_email="a@b.c\nBcc: evil@x", token="t", base_url="https://x", ttl=_TTL
        )

    assert sender.sent == []
    assert any(record.levelno == logging.ERROR for record in caplog.records)
