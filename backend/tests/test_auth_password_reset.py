import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models import User, VerificationToken
from app.tokens import VerificationPurpose
from tests.fakes import FakeEmailSender, FakeSession


def test_password_reset_known_email_stages_token_and_sends_email(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a matching email stages a password_reset VerificationToken and emails it."""
    user = User(email="user@example.com")
    user.id = uuid.uuid4()
    session = FakeSession(execute_results=[user])
    fake_sender = FakeEmailSender()
    client = session_client_factory(session, sender=fake_sender)

    response = client.post("/auth/password-reset", json={"email": "user@example.com"})

    assert response.status_code == 204
    assert response.content == b""
    assert session.committed is True
    assert len(session.added) == 1
    token = session.added[0]
    assert isinstance(token, VerificationToken)
    assert token.purpose == VerificationPurpose.PASSWORD_RESET
    assert token.user_id == user.id

    assert len(fake_sender.sent) == 1
    assert fake_sender.sent[0].to == "user@example.com"


def test_password_reset_unknown_email_is_a_silent_no_op(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify an unknown email still returns 204, anti-enumeration, with no side effects."""
    session = FakeSession(execute_results=[None])
    fake_sender = FakeEmailSender()
    client = session_client_factory(session, sender=fake_sender)

    response = client.post("/auth/password-reset", json={"email": "nobody@example.com"})

    assert response.status_code == 204
    assert response.content == b""
    assert session.added == []
    assert session.committed is False
    assert fake_sender.sent == []


def test_password_reset_succeeds_even_if_email_delivery_fails(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify the response doesn't depend on the background email send succeeding."""
    user = User(email="user@example.com")
    user.id = uuid.uuid4()
    session = FakeSession(execute_results=[user])
    fake_sender = FakeEmailSender(raise_error=True)
    client = session_client_factory(session, sender=fake_sender)

    response = client.post("/auth/password-reset", json={"email": "user@example.com"})

    assert response.status_code == 204
    assert session.committed is True


def test_password_reset_malformed_email_rejected_by_validation(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a malformed email is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post("/auth/password-reset", json={"email": "not-an-email"})

    assert response.status_code == 422
    assert session.executed_statements == []


def test_password_reset_missing_email_field(
    session_client_factory: Callable[..., TestClient],
) -> None:
    """Verify a missing email field is rejected by validation before touching the DB."""
    session = FakeSession(execute_results=[])
    client = session_client_factory(session)

    response = client.post("/auth/password-reset", json={})

    assert response.status_code == 422
    assert session.executed_statements == []
