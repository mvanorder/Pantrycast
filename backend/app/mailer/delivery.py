"""Fire-and-forget send helpers the auth routes schedule via ``BackgroundTasks``.

A background task runs *after* the response is sent and *after* the request's
DB session has closed, so these helpers take only plain values — never an ORM
row or a session. Any failure — a transport error (``EmailDeliveryError``) or a
message that can't even be built (``ValueError`` from a malformed address) — is
logged, not raised: the response the user saw has already gone out, and there's
no queue to retry on yet (that's the deferred ``worker`` image, uac-design.md
§6). Pass primitives rather than a ``Settings`` object, matching :mod:`app.security`.
"""

import logging
from datetime import timedelta

from app.mailer import (
    EmailDeliveryError,
    EmailSender,
    render_password_reset_email,
    render_verification_email,
)

logger = logging.getLogger(__name__)


async def send_verification_email(
    sender: EmailSender, *, to_email: str, token: str, base_url: str, ttl: timedelta
) -> None:
    """Send the email-verification message, logging (never raising) a build or delivery failure.

    :param sender: The configured email sender.
    :type sender: EmailSender
    :param to_email: The recipient address.
    :type to_email: str
    :param token: The plaintext verification token.
    :type token: str
    :param base_url: The public web origin the link points at
        (``Settings.email_base_url``).
    :type base_url: str
    :param ttl: The token lifetime (``Settings.verification_token_ttl``).
    :type ttl: timedelta
    """
    try:
        message = render_verification_email(
            to_email=to_email, token=token, base_url=base_url, ttl=ttl
        )
        await sender.send(message)
    except (EmailDeliveryError, ValueError):
        logger.exception("Failed to send verification email to %s", to_email)


async def send_password_reset_email(
    sender: EmailSender, *, to_email: str, token: str, base_url: str, ttl: timedelta
) -> None:
    """Send the password-reset message, logging (never raising) a build or delivery failure.

    :param sender: The configured email sender.
    :type sender: EmailSender
    :param to_email: The recipient address.
    :type to_email: str
    :param token: The plaintext reset token.
    :type token: str
    :param base_url: The public web origin the link points at
        (``Settings.email_base_url``).
    :type base_url: str
    :param ttl: The token lifetime (``Settings.verification_token_ttl``).
    :type ttl: timedelta
    """
    try:
        message = render_password_reset_email(
            to_email=to_email, token=token, base_url=base_url, ttl=ttl
        )
        await sender.send(message)
    except (EmailDeliveryError, ValueError):
        logger.exception("Failed to send password-reset email to %s", to_email)
