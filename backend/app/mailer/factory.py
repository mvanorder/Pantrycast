"""Builds the process-wide :class:`~app.mailer.EmailSender` from application settings.

Lives here rather than in :mod:`app.dependencies` for the same reason
``get_settings`` lives in :mod:`app.config` and ``get_db`` in :mod:`app.db`:
it's a plain factory that routes happen to consume via ``Depends(...)``, not
part of the request-auth surface.
"""

import logging
from functools import lru_cache

from app.config import get_settings
from app.mailer import EmailSender
from app.mailer.console import ConsoleEmailSender
from app.mailer.smtp import SmtpEmailSender

logger = logging.getLogger(__name__)


@lru_cache
def get_email_sender() -> EmailSender:
    """Return the cached email sender, chosen from settings.

    A :class:`~app.mailer.smtp.SmtpEmailSender` when an ``SMTP_HOST`` is
    configured (and ``EMAIL_BACKEND`` isn't forced to ``console``); otherwise
    a :class:`~app.mailer.console.ConsoleEmailSender`, which logs instead of
    sending, so local dev and tests need zero mail setup. Routes that send
    mail depend on this and schedule the actual send via ``BackgroundTasks``
    (see :mod:`app.mailer.delivery`).

    :returns: The configured email sender.
    :rtype: EmailSender
    """
    settings = get_settings()
    # Settings normalises a blank SMTP_HOST to None and rejects
    # EMAIL_BACKEND=smtp without a host, so a truthy host here is a real one.
    if settings.email_backend != "console" and settings.smtp_host:
        return SmtpEmailSender(
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password_value,
            security=settings.smtp_security,
            from_addr=settings.email_from,
        )
    if settings.email_backend == "auto":
        logger.error(
            "EMAIL_BACKEND=auto with no SMTP_HOST — falling back to the console sender, "
            "which writes verification/reset tokens to the logs. This is for local dev "
            "only; set EMAIL_BACKEND=smtp in a real deployment."
        )
    elif settings.smtp_host:
        logger.warning(
            "EMAIL_BACKEND=console overrides the configured SMTP_HOST — mail (and its "
            "verification/reset tokens) will be written to the logs, not sent."
        )
    return ConsoleEmailSender()
