import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.models import User, VerificationToken
from app.routers.auth import verify_email
from app.schemas import VerifyEmailRequest
from app.tokens import VerificationPurpose, hash_verification_token
from tests.fakes import FakeSession

_RAW_TOKEN = "the-raw-verification-token"


def _make_stored_token(
    *,
    purpose: str = VerificationPurpose.EMAIL_VERIFY,
    consumed: bool = False,
    expired: bool = False,
    raw_token: str = _RAW_TOKEN,
) -> tuple[User, VerificationToken]:
    """Build a matching ``User``/``VerificationToken`` pair for a given raw token value.

    :param purpose: The stored token's purpose.
    :type purpose: str
    :param consumed: Whether the stored token should already be consumed.
    :type consumed: bool
    :param expired: Whether the stored token should already be expired.
    :type expired: bool
    :param raw_token: The plaintext verification token this row should hash from.
    :type raw_token: str
    :returns: A ``(user, stored_token)`` pair.
    :rtype: tuple[User, VerificationToken]
    """
    user = User(email="user@example.com", email_verified=False)
    user.id = uuid.uuid4()
    now = datetime.now(UTC)
    stored = VerificationToken(
        user_id=user.id,
        token_hash=hash_verification_token(raw_token),
        purpose=purpose,
        expires_at=now - timedelta(hours=1) if expired else now + timedelta(hours=23),
        consumed_at=now - timedelta(hours=1) if consumed else None,
    )
    stored.id = uuid.uuid4()
    return user, stored


def test_verify_email_locks_the_token_row_for_update(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify the token lookup uses FOR UPDATE (guards the consume race).

    A regression test for the row lock itself, not just its observable
    effect — without this, a future refactor could drop ``.with_for_update()``
    and every other verify-email test would keep passing against the fake
    session.
    """
    user, stored = _make_stored_token()
    session = FakeSession(execute_results=[stored, user])
    client = session_client_factory(session)

    client.post("/auth/verify-email", json={"token": _RAW_TOKEN})

    lookup_stmt = session.executed_statements[0]
    assert lookup_stmt._for_update_arg is not None  # pylint: disable=protected-access


def test_verify_email_success(session_client_factory: Callable[..., TestClient]) -> None:
    """Verify a valid, unexpired, unconsumed token flips email_verified and is consumed."""
    user, stored = _make_stored_token()
    session = FakeSession(execute_results=[stored, user])
    client = session_client_factory(session)

    response = client.post("/auth/verify-email", json={"token": _RAW_TOKEN})

    assert response.status_code == 204
    assert response.content == b""
    assert stored.consumed_at is not None
    assert user.email_verified is True
    assert session.committed is True


def test_verify_email_unknown_token(session_client_factory: Callable[..., TestClient]) -> None:
    """Verify a token hash with no matching row is a 400."""
    session = FakeSession(execute_results=[None])
    client = session_client_factory(session)

    response = client.post("/auth/verify-email", json={"token": "never-issued"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid verification token"
    assert session.committed is False


def test_verify_email_wrong_purpose_token_is_treated_as_unknown(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a password-reset-purpose token can't verify an email.

    The lookup query filters on purpose='email_verify', so a password-reset
    token's hash simply never matches — from the fake session's perspective
    (and the real DB's) this is indistinguishable from an unknown token, and
    that's deliberate: it doesn't leak that the token exists under a
    different purpose.
    """
    session = FakeSession(execute_results=[None])
    client = session_client_factory(session)

    response = client.post("/auth/verify-email", json={"token": "a-password-reset-token"})

    assert response.status_code == 400


def test_verify_email_lookup_filters_on_purpose(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify the lookup query itself filters on purpose='email_verify'.

    A regression test for the filter itself, not just its observable effect
    (test_verify_email_wrong_purpose_token_is_treated_as_unknown queues the
    same [None] result a plain unknown-token test would, so it can't by
    itself catch a future refactor that silently drops the purpose clause —
    this asserts against the compiled statement instead, mirroring
    test_verify_email_locks_the_token_row_for_update's approach for the
    FOR UPDATE lock).
    """
    user, stored = _make_stored_token()
    session = FakeSession(execute_results=[stored, user])
    client = session_client_factory(session)

    client.post("/auth/verify-email", json={"token": _RAW_TOKEN})

    lookup_stmt = session.executed_statements[0]
    compiled = str(lookup_stmt.compile(compile_kwargs={"literal_binds": True}))
    assert "verification_tokens.purpose = 'email_verify'" in compiled


def test_verify_email_expired_token(session_client_factory: Callable[..., TestClient]) -> None:
    """Verify an expired-but-unconsumed token is rejected with 422, not 400."""
    _, stored = _make_stored_token(expired=True)
    session = FakeSession(execute_results=[stored])
    client = session_client_factory(session)

    response = client.post("/auth/verify-email", json={"token": _RAW_TOKEN})

    assert response.status_code == 422
    assert response.json()["detail"] == "Verification token has expired or already been used"
    assert session.committed is False


def test_verify_email_already_consumed_token(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an already-consumed token can't be redeemed a second time."""
    _, stored = _make_stored_token(consumed=True)
    session = FakeSession(execute_results=[stored])
    client = session_client_factory(session)

    response = client.post("/auth/verify-email", json={"token": _RAW_TOKEN})

    assert response.status_code == 422
    assert response.json()["detail"] == "Verification token has expired or already been used"
    assert session.committed is False


def test_verify_email_oversized_token_rejected_by_validation(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an oversized token is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post("/auth/verify-email", json={"token": "x" * 600})

    assert response.status_code == 422
    assert session.executed_statements == []


def test_verify_email_missing_token_field(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a missing token field is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post("/auth/verify-email", json={})

    assert response.status_code == 422
    assert session.executed_statements == []


async def test_verify_email_missing_user_raises_runtime_error() -> None:
    """Verify the FK-guaranteed invariant fails loudly if it's ever violated.

    Exercises app.routers.auth.verify_email directly (bypassing HTTP, since a
    RuntimeError here should surface as a 500, and TestClient's default
    error handling would swallow the assertion this test wants to make) —
    mirrors test_refresh_missing_user_raises_runtime_error.
    """
    _, stored = _make_stored_token()
    session = FakeSession(execute_results=[stored, None])

    with pytest.raises(RuntimeError, match="verification_tokens.user_id FK"):
        await verify_email(
            VerifyEmailRequest(token=_RAW_TOKEN),
            db=session,  # type: ignore[arg-type]
        )
