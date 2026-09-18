import logging

from app.main import _configure_logging


def test_configure_logging_gives_app_an_info_level_handler() -> None:
    """Verify ``_configure_logging`` attaches a non-propagating INFO-level handler to ``app``.

    Without this, uvicorn's own logging setup leaves the root logger (and
    therefore the ``app`` namespace, which has no handler of its own)
    unconfigured, so app.* logger.info() calls (e.g. ConsoleEmailSender)
    never reach the console — only warnings/errors would, via Python's
    ``lastResort`` handler. Scoped to ``app`` rather than root so it doesn't
    also un-mute third-party loggers (httpx, sqlalchemy, ...).
    """
    app_logger = logging.getLogger("app")
    original_handlers = list(app_logger.handlers)
    original_level = app_logger.level
    original_propagate = app_logger.propagate
    app_logger.handlers = []
    app_logger.setLevel(logging.NOTSET)

    try:
        assert not logging.getLogger("app.mailer.console").isEnabledFor(logging.INFO)

        _configure_logging()

        assert app_logger.handlers
        assert app_logger.propagate is False
        assert logging.getLogger("app.mailer.console").isEnabledFor(logging.INFO)

        # A no-op the second time: it must not stack up duplicate handlers.
        handler_count = len(app_logger.handlers)
        _configure_logging()
        assert len(app_logger.handlers) == handler_count
    finally:
        app_logger.handlers = original_handlers
        app_logger.setLevel(original_level)
        app_logger.propagate = original_propagate
