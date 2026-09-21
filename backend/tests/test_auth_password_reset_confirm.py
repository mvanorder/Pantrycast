import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.models import AuthIdentity, RefreshToken, User, VerificationToken
from app.routers.auth import confirm_password_reset
from app.schemas import PasswordResetConfirmRequest
from app.security import verify_password
from app.tokens import VerificationPurpose, hash_verification_token
from tests.fakes import FakeSession

_RAW_TOKEN = "the-raw-reset-token"
_NEW_PASSWORD = "a new correct horse"


def _make_stored_token(
    *,
    purpose: str = VerificationPurpose.PASSWORD_RESET,
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
    :param raw_token: The plaintext reset token this row should hash from.
    :type raw_token: str
    :returns: A ``(user, stored_token)`` pair.
    :rtype: tuple[User, VerificationToken]
    """
    user = User(email="user@example.com")
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


def test_password_reset_confirm_locks_the_token_row_for_update(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify the token lookup uses FOR UPDATE (guards the consume race)."""
    user, stored = _make_stored_token()
    session = FakeSession(execute_results=[stored, user, None, []])
    client = session_client_factory(session)

    client.post(
        "/auth/password-reset/confirm",
        json={"token": _RAW_TOKEN, "new_password": _NEW_PASSWORD},
    )

    lookup_stmt = session.executed_statements[0]
    assert lookup_stmt._for_update_arg is not None  # pylint: disable=protected-access


def test_password_reset_confirm_success_sets_password_and_revokes_sessions(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a valid token creates a password identity and revokes existing sessions."""
    user, stored = _make_stored_token()
    other_session = RefreshToken(
        user_id=user.id, token_hash="h", expires_at=datetime.now(UTC) + timedelta(days=1)
    )
    session = FakeSession(execute_results=[stored, user, None, [other_session]])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": _RAW_TOKEN, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 204
    assert response.content == b""
    assert stored.consumed_at is not None
    assert session.committed is True

    assert len(session.added) == 1
    identity = session.added[0]
    assert isinstance(identity, AuthIdentity)
    assert identity.provider == "password"
    assert verify_password(identity.secret_hash, _NEW_PASSWORD) is True

    assert other_session.revoked_at is not None


def test_password_reset_confirm_updates_existing_password_identity(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an account that already has a password identity gets it overwritten, not duplicated."""
    user, stored = _make_stored_token()
    existing_identity = AuthIdentity(
        user_id=user.id,
        provider="password",
        provider_user_id=str(user.id),
        secret_hash="old-hash",
    )
    session = FakeSession(execute_results=[stored, user, existing_identity, []])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": _RAW_TOKEN, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 204
    assert session.added == []
    assert verify_password(existing_identity.secret_hash, _NEW_PASSWORD) is True


def test_password_reset_confirm_unknown_token(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a token hash with no matching row is a 400."""
    session = FakeSession(execute_results=[None])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": "never-issued", "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid verification token"
    assert session.committed is False


def test_password_reset_confirm_wrong_purpose_token_is_treated_as_unknown(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an email-verify-purpose token can't be used to reset a password.

    The lookup query filters on purpose='password_reset', so an
    email-verify token's hash simply never matches — indistinguishable from
    an unknown token, deliberately, so it doesn't leak that the token exists
    under a different purpose.
    """
    session = FakeSession(execute_results=[None])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": "an-email-verify-token", "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 400


def test_password_reset_confirm_lookup_filters_on_purpose(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify the lookup query itself filters on purpose='password_reset'."""
    user, stored = _make_stored_token()
    session = FakeSession(execute_results=[stored, user, None, []])
    client = session_client_factory(session)

    client.post(
        "/auth/password-reset/confirm",
        json={"token": _RAW_TOKEN, "new_password": _NEW_PASSWORD},
    )

    lookup_stmt = session.executed_statements[0]
    compiled = str(lookup_stmt.compile(compile_kwargs={"literal_binds": True}))
    assert "verification_tokens.purpose = 'password_reset'" in compiled


def test_password_reset_confirm_expired_token(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an expired-but-unconsumed token is rejected with 422, not 400."""
    _, stored = _make_stored_token(expired=True)
    session = FakeSession(execute_results=[stored])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": _RAW_TOKEN, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Verification token has expired or already been used"
    assert session.committed is False


def test_password_reset_confirm_already_consumed_token(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an already-consumed token can't be redeemed a second time."""
    _, stored = _make_stored_token(consumed=True)
    session = FakeSession(execute_results=[stored])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": _RAW_TOKEN, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 422
    assert session.committed is False


def test_password_reset_confirm_short_new_password_rejected_by_validation(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a too-short new password is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": _RAW_TOKEN, "new_password": "short"},
    )

    assert response.status_code == 422
    assert session.executed_statements == []


def test_password_reset_confirm_oversized_token_rejected_by_validation(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an oversized token is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": "x" * 600, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 422
    assert session.executed_statements == []


async def test_password_reset_confirm_missing_user_raises_runtime_error() -> None:
    """Verify the FK-guaranteed invariant fails loudly if it's ever violated.

    Exercises app.routers.auth.confirm_password_reset directly (bypassing
    HTTP, since a RuntimeError here should surface as a 500, and
    TestClient's default error handling would swallow the assertion this
    test wants to make) — mirrors test_verify_email_missing_user_raises_runtime_error.
    """
    _, stored = _make_stored_token()
    session = FakeSession(execute_results=[stored, None])

    with pytest.raises(RuntimeError, match="verification_tokens.user_id FK"):
        await confirm_password_reset(
            PasswordResetConfirmRequest(token=_RAW_TOKEN, new_password=_NEW_PASSWORD),
            db=session,  # type: ignore[arg-type]
        )
