import re
import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.models import AuthIdentity, User, VerificationToken
from app.tokens import VerificationPurpose, hash_verification_token
from tests.fakes import FakeEmailSender, FakeSession


def test_register_success(session_client_factory: Callable[..., TestClient]) -> None:
    """Verify registration stages a User/AuthIdentity/VerificationToken and emails the token."""
    # Two queued results: the email pre-check, then upsert_password_identity's
    # own lookup for an existing password identity (there isn't one yet).
    # db.add(...)-ing the VerificationToken doesn't consume a queued result.
    session = FakeSession(execute_results=[None, None])
    fake_sender = FakeEmailSender()
    client = session_client_factory(session, sender=fake_sender)

    response = client.post(
        "/auth/register",
        json={"email": "new@example.com", "password": "correct horse", "display_name": "New"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new@example.com"
    assert body["display_name"] == "New"
    assert "id" in body
    assert session.committed is True
    assert len(session.added) == 3
    assert isinstance(session.added[0], User)
    identity = session.added[1]
    assert isinstance(identity, AuthIdentity)
    assert identity.provider == "password"

    verification_token = session.added[2]
    assert isinstance(verification_token, VerificationToken)
    assert verification_token.purpose == VerificationPurpose.EMAIL_VERIFY
    assert verification_token.user_id == session.added[0].id

    assert len(fake_sender.sent) == 1
    sent = fake_sender.sent[0]
    assert sent.to == "new@example.com"
    # The same raw token backs both the DB row and the emailed link, not two
    # independently-generated values.
    match = re.search(r"token=([^\s&]+)", sent.text_body)
    assert match is not None
    assert hash_verification_token(match.group(1)) == verification_token.token_hash


def test_register_succeeds_even_if_email_delivery_fails(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify registration's success never depends on the background email send."""
    session = FakeSession(execute_results=[None, None])
    fake_sender = FakeEmailSender(raise_error=True)
    client = session_client_factory(session, sender=fake_sender)

    response = client.post(
        "/auth/register",
        json={"email": "new@example.com", "password": "correct horse"},
    )

    assert response.status_code == 201
    assert session.committed is True


def test_register_duplicate_email_precheck(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a pre-existing email is rejected without touching the DB further."""
    existing = User(email="taken@example.com")
    existing.id = uuid.uuid4()
    session = FakeSession(execute_results=[existing])
    client = session_client_factory(session)

    response = client.post(
        "/auth/register",
        json={"email": "taken@example.com", "password": "correct horse"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"
    assert session.added == []
    assert session.committed is False


def test_register_duplicate_email_race(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a unique-constraint violation at insert time is reported the same way."""
    session = FakeSession(
        execute_results=[None],
        flush_error=IntegrityError("insert", {}, Exception("duplicate key")),
    )
    client = session_client_factory(session)

    response = client.post(
        "/auth/register",
        json={"email": "race@example.com", "password": "correct horse"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"
    assert session.rolled_back is True
    assert session.committed is False


def test_register_password_too_short(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a too-short password is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post(
        "/auth/register", json={"email": "new@example.com", "password": "short"}
    )

    assert response.status_code == 422
    assert session.added == []
    assert session.committed is False


def test_register_malformed_email(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a malformed email is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post(
        "/auth/register", json={"email": "not-an-email", "password": "correct horse"}
    )

    assert response.status_code == 422
    assert session.added == []
