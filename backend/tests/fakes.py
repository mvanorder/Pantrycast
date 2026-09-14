import uuid

from sqlalchemy.exc import SQLAlchemyError

from app.mailer import EmailDeliveryError, OutgoingEmail


class FakeAsyncSession:
    """A minimal stand-in for ``AsyncSession`` used to drive ``/health/db``.

    :param raise_error: Whether ``execute`` should raise ``SQLAlchemyError``
        to simulate a database outage.
    :type raise_error: bool
    """

    def __init__(self, raise_error: bool = False) -> None:
        """Initialize the fake session's configured failure behavior.

        :param raise_error: Whether ``execute`` should raise
            ``SQLAlchemyError`` to simulate a database outage.
        :type raise_error: bool
        """
        self._raise_error = raise_error

    async def execute(self, *args: object, **kwargs: object) -> None:
        """Simulate running a query, optionally raising like a dead DB would.

        :param args: Ignored positional arguments (mirrors ``AsyncSession.execute``).
        :param kwargs: Ignored keyword arguments (mirrors ``AsyncSession.execute``).
        :raises SQLAlchemyError: If configured via ``raise_error=True``.
        :returns: ``None`` — callers in this codebase discard the result.
        :rtype: None
        """
        if self._raise_error:
            raise SQLAlchemyError("simulated database failure")


class FakeScalars:
    """A minimal stand-in for SQLAlchemy's ``ScalarResult``, wrapping a fixed list of rows.

    :param rows: The rows iterating/``.all()``-ing this should yield.
    :type rows: list[object]
    """

    def __init__(self, rows: list[object]) -> None:
        """Store the rows this fake scalar result will hand back.

        :param rows: The rows iterating/``.all()``-ing this should yield.
        :type rows: list[object]
        """
        self._rows = list(rows)

    def all(self) -> list[object]:
        """Return every row, mimicking ``ScalarResult.all()``.

        :returns: The configured rows.
        :rtype: list[object]
        """
        return list(self._rows)

    def __iter__(self):
        """Iterate the configured rows, mimicking ``for row in result.scalars()``.

        :returns: An iterator over the configured rows.
        :rtype: Iterator[object]
        """
        return iter(self._rows)


class FakeResult:
    """A minimal stand-in for SQLAlchemy's ``Result``, wrapping one queued value.

    The same queued value backs both single-row access (:meth:`scalar_one_or_none`)
    and multi-row access (:meth:`scalars`) — which one a given query uses
    determines whether the test should queue a single object/``None`` or a
    list of rows for it.

    :param value: The value to hand back — a single row (or ``None``) for
        :meth:`scalar_one_or_none`, or a list of rows for :meth:`scalars`.
    :type value: object
    """

    def __init__(self, value: object) -> None:
        """Store the value this fake result will hand back.

        :param value: The value to hand back from :meth:`scalar_one_or_none`
            or :meth:`scalars`.
        :type value: object
        """
        self._value = value

    def scalar_one_or_none(self) -> object:
        """Return the configured value, mimicking a single-row (or no-row) query.

        :returns: The value passed to the constructor.
        :rtype: object
        """
        return self._value

    def scalars(self) -> FakeScalars:
        """Return the configured value as a fake multi-row scalar result.

        :returns: A ``FakeScalars`` wrapping the configured value (expected
            to be a list).
        :rtype: FakeScalars
        """
        return FakeScalars(self._value)


class FakeSession:
    """A minimal stand-in for ``AsyncSession`` driving DB-touching business logic.

    Each call to :meth:`execute` pops the next value off ``execute_results``
    and wraps it in a :class:`FakeResult` — callers don't inspect the
    statement itself, so tests configure results in the order the function
    under test is expected to query them.

    :param execute_results: Values to return from successive ``execute`` calls.
    :type execute_results: list[object] | None
    :param flush_error: An exception to raise from the *next* ``flush()``
        call only (then cleared), for simulating a unique-constraint race
        caught at insert time.
    :type flush_error: Exception | None
    """

    def __init__(
        self,
        execute_results: list[object] | None = None,
        flush_error: Exception | None = None,
    ) -> None:
        """Queue up scripted ``execute``/``flush`` behavior.

        :param execute_results: Values to return from successive ``execute`` calls.
        :type execute_results: list[object] | None
        :param flush_error: An exception to raise from the next ``flush()``
            call only.
        :type flush_error: Exception | None
        """
        self._execute_results = list(execute_results or [])
        self._flush_error: Exception | None = flush_error
        self.added: list[object] = []
        self.committed = False
        self.rolled_back = False
        self.executed_statements: list[object] = []

    async def execute(self, stmt: object) -> FakeResult:
        """Record the statement, then pop and wrap the next queued result.

        Recording ``stmt`` (in :attr:`executed_statements`) lets a test
        assert on properties of the query itself — e.g. that a
        concurrency-sensitive lookup was built with ``.with_for_update()`` —
        not just on the canned result it was given back.

        :param stmt: The statement passed to ``execute`` (kept as-is; this
            fake doesn't run it against anything).
        :type stmt: object
        :raises AssertionError: If called more often than the test scripted.
        :returns: The next queued value, wrapped in a ``FakeResult``.
        :rtype: FakeResult
        """
        self.executed_statements.append(stmt)
        assert self._execute_results, "code under test ran more queries than the test scripted"
        return FakeResult(self._execute_results.pop(0))

    def add(self, obj: object) -> None:
        """Record a row as staged for insert.

        :param obj: The ORM object being added.
        :type obj: object
        """
        self.added.append(obj)

    async def flush(self) -> None:
        """Assign a fake id to any newly-added row that doesn't have one.

        :raises Exception: The configured ``flush_error``, once, if set.
        """
        if self._flush_error is not None:
            error, self._flush_error = self._flush_error, None
            raise error
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()

    async def commit(self) -> None:
        """Record that the transaction was committed."""
        self.committed = True

    async def rollback(self) -> None:
        """Record that the transaction was rolled back."""
        self.rolled_back = True


class FakeEmailSender:  # pylint: disable=too-few-public-methods
    """An ``EmailSender`` that records messages instead of sending them.

    :param raise_error: Whether :meth:`send` should raise
        ``EmailDeliveryError`` to simulate a transport failure.
    :type raise_error: bool
    """

    def __init__(self, raise_error: bool = False) -> None:
        """Initialize the fake's recorded state and failure behavior.

        :param raise_error: Whether :meth:`send` should raise
            ``EmailDeliveryError``.
        :type raise_error: bool
        """
        self._raise_error = raise_error
        self.sent: list[OutgoingEmail] = []

    async def send(self, message: OutgoingEmail) -> None:
        """Record ``message``, or raise if configured to fail.

        :param message: The email that would have been sent.
        :type message: OutgoingEmail
        :raises EmailDeliveryError: If configured via ``raise_error=True``.
        """
        if self._raise_error:
            raise EmailDeliveryError("simulated email delivery failure")
        self.sent.append(message)
