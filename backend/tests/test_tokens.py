from app import tokens
from app.tokens import VerificationPurpose


def test_generate_verification_token_produces_unique_values() -> None:
    """Verify two generated tokens differ (random, not a fixed/predictable value)."""
    assert tokens.generate_verification_token() != tokens.generate_verification_token()


def test_hash_verification_token_is_deterministic() -> None:
    """Verify hashing the same token twice yields the same hash (needed for lookup by hash)."""
    token = tokens.generate_verification_token()

    assert tokens.hash_verification_token(token) == tokens.hash_verification_token(token)


def test_hash_verification_token_differs_for_different_tokens() -> None:
    """Verify two distinct tokens hash to two distinct values."""
    first = tokens.hash_verification_token(tokens.generate_verification_token())
    second = tokens.hash_verification_token(tokens.generate_verification_token())

    assert first != second


def test_hash_verification_token_is_sha256_hex() -> None:
    """Verify the hash is a 64-character hex SHA-256 digest."""
    digest = tokens.hash_verification_token("anything")

    assert len(digest) == 64
    assert int(digest, 16) >= 0  # parses as hex


def test_verification_purpose_values_match_the_db_check_constraint() -> None:
    """Verify the enum's values are exactly the strings the table's CHECK allows."""
    assert {p.value for p in VerificationPurpose} == {"email_verify", "password_reset"}
