"""Single-use token generation and hashing for email verification and password reset.

Pure token logic — no FastAPI imports, no DB access — so it stays usable from
scripts and the CLI. The generate/hash pair mirrors
:func:`app.security.generate_refresh_token` / :func:`app.security.hash_refresh_token`:
a high-entropy random value, stored only as its SHA-256 hex digest and looked up
by exact equality (a slow, salted password hash would buy nothing and would rule
out the ``WHERE token_hash = :hash`` lookup the consuming endpoints need).
"""

import hashlib
import secrets
from enum import StrEnum


class VerificationPurpose(StrEnum):
    """What a ``verification_tokens`` row authorizes its bearer to do.

    The values are the exact strings the table's ``purpose`` ``CHECK``
    constraint allows (``app/models/verification_token.py``) — keep them in
    sync.
    """

    EMAIL_VERIFY = "email_verify"
    PASSWORD_RESET = "password_reset"


def generate_verification_token() -> str:
    """Generate a new opaque verification/reset token.

    :returns: A URL-safe random token with 256 bits of entropy, safe to put
        in an email link.
    :rtype: str
    """
    return secrets.token_urlsafe(32)


def hash_verification_token(token: str) -> str:
    """Hash a verification token for storage in ``verification_tokens.token_hash``.

    SHA-256, not argon2, for the same reason as
    :func:`app.security.hash_refresh_token`: the token from
    :func:`generate_verification_token` is already uniform high-entropy data,
    and the consuming endpoint finds the row by exact hash equality.

    :param token: The plaintext token, from :func:`generate_verification_token`.
    :type token: str
    :returns: The token's hex-encoded SHA-256 digest.
    :rtype: str
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
