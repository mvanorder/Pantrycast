"""An :class:`~app.mailer.EmailSender` that logs messages instead of sending them."""

import logging

from app.mailer import OutgoingEmail

logger = logging.getLogger(__name__)


class ConsoleEmailSender:  # pylint: disable=too-few-public-methods
    """Logs each message at ``INFO`` rather than delivering it.

    The zero-setup default when no ``SMTP_HOST`` is configured (local dev and
    tests) — the same spirit as the ephemeral JWT keypair in
    :mod:`app.config`. Never raises :class:`~app.mailer.EmailDeliveryError`.
    """

    async def send(self, message: OutgoingEmail) -> None:
        """Log the message's recipient, subject, and body.

        :param message: The rendered email that would have been sent.
        :type message: OutgoingEmail
        """
        logger.info(
            "Email not sent (console backend) — to=%s subject=%r\n%s",
            message.to,
            message.subject,
            message.text_body,
        )
