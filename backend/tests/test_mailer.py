import logging
from datetime import timedelta

import pytest

from app.mailer import (
    EmailSender,
    OutgoingEmail,
    render_password_reset_email,
    render_verification_email,
    to_mime,
)
from app.mailer.console import ConsoleEmailSender
from tests.fakes import FakeEmailSender


def test_outgoing_email_is_frozen() -> None:
    """Verify ``OutgoingEmail`` is immutable so a rendered message can't be mutated in flight."""
    message = OutgoingEmail(to="a@example.com", subject="Hi", text_body="Body")

    with pytest.raises((AttributeError, TypeError)):
        message.subject = "Changed"  # type: ignore[misc]


def test_to_mime_sets_headers_and_plain_body() -> None:
    """Verify ``to_mime`` fills From/To/Subject and a text/plain body."""
    message = OutgoingEmail(to="user@example.com", subject="Confirm", text_body="Open the link")

    mime = to_mime(message, "Shopping Analysis <no-reply@example.com>")

    assert mime["From"] == "Shopping Analysis <no-reply@example.com>"
    assert mime["To"] == "user@example.com"
    assert mime["Subject"] == "Confirm"
    assert mime.get_content_type() == "text/plain"
    assert "Open the link" in mime.get_content()


def test_outgoing_email_rejects_a_recipient_with_a_newline() -> None:
    """Verify a newline in the recipient address is refused at construction (header injection)."""
    with pytest.raises(ValueError, match="newline"):
        OutgoingEmail(to="a@example.com\nBcc: evil@example.com", subject="S", text_body="T")


def test_outgoing_email_rejects_a_subject_with_a_newline() -> None:
    """Verify a newline in the subject is refused at construction too."""
    with pytest.raises(ValueError, match="newline"):
        OutgoingEmail(to="a@example.com", subject="Hi\nX-Evil: 1", text_body="T")


def test_to_mime_rejects_a_from_address_with_a_newline() -> None:
    """Verify the caller-supplied From header is guarded even though OutgoingEmail can't be."""
    message = OutgoingEmail(to="a@example.com", subject="S", text_body="T")

    with pytest.raises(ValueError, match="newline"):
        to_mime(message, "from@example.com\nBcc: evil@example.com")


def test_to_mime_without_html_body_has_no_alternative() -> None:
    """Verify a text-only message stays a single-part text/plain message."""
    mime = to_mime(OutgoingEmail(to="u@example.com", subject="S", text_body="T"), "f@example.com")

    assert not mime.is_multipart()


def test_to_mime_with_html_body_adds_an_alternative() -> None:
    """Verify an HTML body is attached as a multipart/alternative part."""
    message = OutgoingEmail(
        to="u@example.com", subject="S", text_body="plain", html_body="<p>rich</p>"
    )

    mime = to_mime(message, "f@example.com")

    assert mime.is_multipart()
    assert {part.get_content_type() for part in mime.iter_parts()} == {
        "text/plain",
        "text/html",
    }


def test_render_verification_email_contains_the_tokenised_link() -> None:
    """Verify the verification email is addressed right and links to the frontend with the token."""
    message = render_verification_email(
        to_email="new@example.com",
        token="tok-123",
        base_url="https://app.example.com/",
        ttl=timedelta(hours=24),
    )

    assert message.to == "new@example.com"
    assert message.subject
    assert "https://app.example.com/verify-email?token=tok-123" in message.text_body
    assert "24 hours" in message.text_body


def test_render_password_reset_email_contains_the_tokenised_link() -> None:
    """Verify the reset email links to the reset page with the token and states the TTL."""
    message = render_password_reset_email(
        to_email="user@example.com",
        token="reset-abc",
        base_url="https://app.example.com",
        ttl=timedelta(hours=2),
    )

    assert message.to == "user@example.com"
    assert "https://app.example.com/reset-password?token=reset-abc" in message.text_body
    assert "2 hours" in message.text_body


def test_render_clamps_sub_hour_ttl_to_one_hour() -> None:
    """Verify a short TTL still reads as a whole number of hours, never zero."""
    message = render_verification_email(
        to_email="u@example.com", token="t", base_url="https://x", ttl=timedelta(minutes=30)
    )

    assert "1 hours" in message.text_body


async def test_console_sender_logs_instead_of_sending(caplog: pytest.LogCaptureFixture) -> None:
    """Verify ``ConsoleEmailSender`` logs the message and does not raise."""
    message = OutgoingEmail(to="u@example.com", subject="Subject line", text_body="the body")

    with caplog.at_level(logging.INFO, logger="app.mailer.console"):
        await ConsoleEmailSender().send(message)

    assert "u@example.com" in caplog.text
    assert "Subject line" in caplog.text
    assert "the body" in caplog.text


def test_console_and_fake_senders_satisfy_the_email_sender_protocol() -> None:
    """Verify both concrete senders are recognised as ``EmailSender`` (runtime-checkable)."""
    assert isinstance(ConsoleEmailSender(), EmailSender)
    assert isinstance(FakeEmailSender(), EmailSender)
