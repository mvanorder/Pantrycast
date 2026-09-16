from collections.abc import Callable, Generator

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.mailer import EmailSender
from app.mailer.factory import get_email_sender
from app.main import app
from tests.fakes import FakeAsyncSession, FakeSession


@pytest.fixture
def client() -> Generator[TestClient]:
    """Provide a ``TestClient`` for routes that don't depend on ``get_db``.

    :returns: A generator yielding a ``TestClient`` bound to the app.
    :rtype: Generator[TestClient]
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_client_factory() -> Generator[Callable[[bool], TestClient]]:
    """Provide a factory for a ``TestClient`` with ``get_db`` stubbed out.

    Overrides FastAPI's ``get_db`` dependency with a ``FakeAsyncSession``
    so ``/health/db`` tests never touch ``app.db.get_engine``/settings.

    :returns: A generator yielding a factory that takes ``raise_error``
        and returns a configured ``TestClient``.
    :rtype: Generator[Callable[[bool], TestClient]]
    """

    def _make_client(raise_error: bool) -> TestClient:
        """Build a ``TestClient`` whose ``get_db`` yields a fake session.

        :param raise_error: Whether the stubbed session's ``execute``
            should raise ``SQLAlchemyError``.
        :type raise_error: bool
        :returns: A ``TestClient`` with the dependency override applied.
        :rtype: TestClient
        """

        async def _override_get_db():
            """Yield a fake session in place of the real ``get_db``.

            :returns: An async generator yielding a ``FakeAsyncSession``.
            :rtype: AsyncGenerator[FakeAsyncSession]
            """
            yield FakeAsyncSession(raise_error=raise_error)

        app.dependency_overrides[get_db] = _override_get_db
        return TestClient(app)

    yield _make_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def session_client_factory() -> Generator[Callable[..., TestClient]]:
    """Provide a factory for a ``TestClient`` backed by a caller-built ``FakeSession``.

    Unlike :func:`db_client_factory` (a plain success/failure toggle for
    ``/health/db``), auth endpoints need a session that tracks queued query
    results, staged inserts, and commit/rollback calls — so the caller
    builds and configures the :class:`~tests.fakes.FakeSession` itself and
    this fixture just wires it in as ``get_db``. An optional ``sender``
    additionally overrides ``get_email_sender`` — only ``register`` needs
    this, so every other call site keeps passing just a session.

    :returns: A generator yielding a factory that takes a ``FakeSession``
        (and optionally a fake ``EmailSender``) and returns a ``TestClient``
        using them for every request.
    :rtype: Generator[Callable[..., TestClient]]
    """

    def _make_client(session: FakeSession, sender: EmailSender | None = None) -> TestClient:
        """Build a ``TestClient`` whose ``get_db`` always yields ``session``.

        :param session: The fake session every request should receive.
        :type session: FakeSession
        :param sender: A fake email sender to override ``get_email_sender``
            with, or ``None`` to let the real (console, by default) sender run.
        :type sender: EmailSender | None
        :returns: A ``TestClient`` with the dependency override(s) applied.
        :rtype: TestClient
        """

        async def _override_get_db():
            """Yield the configured fake session in place of the real ``get_db``.

            :returns: An async generator yielding ``session``.
            :rtype: AsyncGenerator[FakeSession]
            """
            yield session

        app.dependency_overrides[get_db] = _override_get_db
        if sender is not None:
            app.dependency_overrides[get_email_sender] = lambda: sender
        return TestClient(app)

    yield _make_client
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_email_sender, None)
