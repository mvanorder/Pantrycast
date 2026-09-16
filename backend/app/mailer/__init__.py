"""Outgoing transactional email: the sender seam, MIME building, and message templates.

FastAPI-free, like :mod:`app.security` — usable from scripts and the CLI. The
one abstraction is :class:`EmailSender`; :mod:`app.mailer.smtp` and
:mod:`app.mailer.console` implement it, and a queue-backed sender can be added
later without touching call sites. :mod:`app.mailer.delivery` has the
``BackgroundTasks``-ready send helpers the auth routes will schedule.
"""

from dataclasses import dataclass
from datetime import timedelta
from email.message import EmailMessage
from typing import Protocol, runtime_checkable

_VERIFICATION_SUBJECT = "Confirm your email address"
_VERIFICATION_BODY = (
    "Welcome to Shopping Analysis!\n\n"
    "Confirm this email address by opening the link below:\n\n"
    "{link}\n\n"
    "The link expires in {ttl_hours} hours. If you didn't create an account, "
    "you can ignore this message."
)

_PASSWORD_RESET_SUBJECT = "Reset your password"
_PASSWORD_RESET_BODY = (
    "We received a request to reset your Shopping Analysis password.\n\n"
    "Choose a new password by opening the link below:\n\n"
    "{link}\n\n"
    "The link expires in {ttl_hours} hours. If you didn't request this, "
    "you can ignore this message — your password won't change."
)


class EmailDeliveryError(Exception):
    """A transport-level failure sending an email.

    Framework-agnostic on purpose (like :class:`app.security.TokenError`) —
    callers decide whether that's fatal (a synchronous send) or just logged
    (a background send).
    """


@dataclass(frozen=True, slots=True)
class OutgoingEmail:
    """A rendered message ready to hand to an :class:`EmailSender`.

    :param to: The recipient address.
    :type to: str
    :param subject: The subject line.
    :type subject: str
    :param text_body: The plain-text body.
    :type text_body: str
    :param html_body: An optional HTML alternative body.
    :type html_body: str | None
    """

    to: str
    subject: str
    text_body: str
    html_body: str | None = None

    def __post_init__(self) -> None:
        """Reject a recipient/subject with an embedded newline (header injection).

        Callers own address validation (in this app recipients trace back to a
        pydantic ``EmailStr``); this is a defense-in-depth stop, applied at
        construction so both the SMTP and console senders are covered.

        :raises ValueError: If ``to`` or ``subject`` contains ``\\r`` or ``\\n``.
        """
        for label, field in (("Recipient address", self.to), ("Subject", self.subject)):
            if "\n" in field or "\r" in field:
                raise ValueError(f"{label} must not contain a newline.")


@runtime_checkable
class EmailSender(Protocol):  # pylint: disable=too-few-public-methods
    """Sends an :class:`OutgoingEmail`. The seam every email backend implements."""

    async def send(self, message: OutgoingEmail) -> None:
        """Deliver ``message``.

        :param message: The rendered email to send.
        :type message: OutgoingEmail
        :raises EmailDeliveryError: If the message could not be handed off for
            delivery.
        """


def to_mime(message: OutgoingEmail, from_addr: str) -> EmailMessage:
    """Build an :class:`~email.message.EmailMessage` from an :class:`OutgoingEmail`.

    :class:`OutgoingEmail` already guards its ``to``/``subject`` against
    embedded newlines; this checks the caller-supplied ``from_addr`` too, so a
    malformed ``EMAIL_FROM`` can't inject a header.

    :param message: The rendered email.
    :type message: OutgoingEmail
    :param from_addr: The ``From`` header value (may be a ``Name <addr>`` form).
    :type from_addr: str
    :raises ValueError: If ``from_addr`` contains a newline (header injection).
    :returns: A MIME message with a plain-text body and, when
        ``message.html_body`` is set, an HTML alternative.
    :rtype: email.message.EmailMessage
    """
    if "\n" in from_addr or "\r" in from_addr:
        raise ValueError("From address must not contain a newline.")
    mime = EmailMessage()
    mime["From"] = from_addr
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime.set_content(message.text_body)
    if message.html_body is not None:
        mime.add_alternative(message.html_body, subtype="html")
    return mime


def _ttl_hours(ttl: timedelta) -> int:
    """Render a token lifetime as a whole number of hours for email copy.

    :param ttl: The token lifetime.
    :type ttl: timedelta
    :returns: ``ttl`` in hours, rounded down, at least 1.
    :rtype: int
    """
    return max(1, int(ttl.total_seconds() // 3600))


def _link(base_url: str, path: str, token: str) -> str:
    """Build a tokenised link to a frontend page.

    :param base_url: The public web origin (``Settings.email_base_url``).
    :type base_url: str
    :param path: The page path, e.g. ``"/verify-email"``.
    :type path: str
    :param token: The URL-safe token to append as ``?token=``.
    :type token: str
    :returns: The absolute link.
    :rtype: str
    """
    return f"{base_url.rstrip('/')}{path}?token={token}"


def render_verification_email(
    *, to_email: str, token: str, base_url: str, ttl: timedelta
) -> OutgoingEmail:
    """Render the "confirm your email address" message.

    :param to_email: The recipient address.
    :type to_email: str
    :param token: The plaintext verification token (goes in the link).
    :type token: str
    :param base_url: The public web origin the link points at.
    :type base_url: str
    :param ttl: How long the token stays valid (shown in the copy).
    :type ttl: timedelta
    :returns: The rendered email.
    :rtype: OutgoingEmail
    """
    link = _link(base_url, "/verify-email", token)
    return OutgoingEmail(
        to=to_email,
        subject=_VERIFICATION_SUBJECT,
        text_body=_VERIFICATION_BODY.format(link=link, ttl_hours=_ttl_hours(ttl)),
    )


def render_password_reset_email(
    *, to_email: str, token: str, base_url: str, ttl: timedelta
) -> OutgoingEmail:
    """Render the "reset your password" message.

    :param to_email: The recipient address.
    :type to_email: str
    :param token: The plaintext reset token (goes in the link).
    :type token: str
    :param base_url: The public web origin the link points at.
    :type base_url: str
    :param ttl: How long the token stays valid (shown in the copy).
    :type ttl: timedelta
    :returns: The rendered email.
    :rtype: OutgoingEmail
    """
    link = _link(base_url, "/reset-password", token)
    return OutgoingEmail(
        to=to_email,
        subject=_PASSWORD_RESET_SUBJECT,
        text_body=_PASSWORD_RESET_BODY.format(link=link, ttl_hours=_ttl_hours(ttl)),
    )
