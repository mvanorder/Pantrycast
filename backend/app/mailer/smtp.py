"""An :class:`~app.mailer.EmailSender` backed by an SMTP server via ``aiosmtplib``."""

from typing import Literal

import aiosmtplib

from app.mailer import EmailDeliveryError, OutgoingEmail, to_mime

SmtpSecurity = Literal["starttls", "tls", "plaintext"]


class SmtpEmailSender:  # pylint: disable=too-few-public-methods
    """Sends mail through a provider-agnostic SMTP server.

    Works with any SMTP relay — a hosted provider's SMTP endpoint (SES,
    Postmark, Mailgun), a self-run relay on a single server, or a local
    catcher (Mailpit) in dev. One connection is opened per :meth:`send`,
    which is fine for the current inline / ``BackgroundTasks`` delivery.
    """

    # An SMTP connection genuinely has this many independent parameters; a
    # config object would just be indirection.
    def __init__(  # pylint: disable=too-many-arguments
        self,
        *,
        host: str,
        port: int,
        username: str | None,
        password: str | None,
        security: SmtpSecurity,
        from_addr: str,
    ) -> None:
        """Store the connection parameters for later :meth:`send` calls.

        :param host: SMTP server hostname.
        :type host: str
        :param port: SMTP server port (typically 587 for STARTTLS, 465 for TLS).
        :type port: int
        :param username: SMTP auth username, or ``None`` for an unauthenticated relay.
        :type username: str | None
        :param password: SMTP auth password, or ``None`` for an unauthenticated relay.
        :type password: str | None
        :param security: ``"starttls"``, ``"tls"`` (implicit), or ``"plaintext"``
            (local/dev relays only).
        :type security: SmtpSecurity
        :param from_addr: The ``From`` header value (may be a ``Name <addr>`` form).
        :type from_addr: str
        """
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._security = security
        self._from_addr = from_addr

    async def send(self, message: OutgoingEmail) -> None:
        """Deliver ``message`` over SMTP.

        :param message: The rendered email to send.
        :type message: OutgoingEmail
        :raises EmailDeliveryError: If the message can't be built (bad address
            header) or the SMTP exchange fails for any reason (connection, TLS,
            auth, or a rejected recipient). This is the one failure channel the
            background send helpers (:mod:`app.mailer.delivery`) swallow.
        """
        try:
            mime = to_mime(message, self._from_addr)
            await aiosmtplib.send(
                mime,
                hostname=self._host,
                port=self._port,
                username=self._username or None,
                password=self._password or None,
                start_tls=self._security == "starttls",
                use_tls=self._security == "tls",
                # Fail fast on a stalled relay — there's no queue behind this,
                # so a background send shouldn't hold a task for the 60s default.
                timeout=15,
            )
        except (aiosmtplib.SMTPException, OSError, ValueError) as exc:
            raise EmailDeliveryError(f"SMTP delivery to {self._host} failed: {exc}") from exc
