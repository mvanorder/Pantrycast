"""Pydantic request/response models for the authentication and user-profile API."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    """Request body for ``POST /auth/register``."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Matches users.display_name's VARCHAR(255) (app/models/user.py) — an
    # over-length value should fail validation as a 422 here, not reach the
    # DB and raise an uncaught DataError.
    display_name: str | None = Field(default=None, max_length=255)


class RegisterResponse(BaseModel):
    """Response body for a successful ``POST /auth/register``."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str | None


class VerifyEmailRequest(BaseModel):
    """Request body for ``POST /auth/verify-email``."""

    # Verification tokens are also secrets.token_urlsafe(32) (~43 chars) —
    # same rationale as RefreshRequest.refresh_token: bounded well above the
    # real length so an oversized value 422s here rather than paying a hash
    # + DB round trip for an obviously-bogus request.
    token: str = Field(max_length=512)


class LoginRequest(BaseModel):
    """Request body for ``POST /auth/login``."""

    email: EmailStr
    password: str = Field(min_length=1)


class TokenPairResponse(BaseModel):
    """Response body carrying a freshly-issued access/refresh token pair.

    Returned by ``POST /auth/login`` and ``POST /auth/refresh``.
    """

    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    """Request body for ``POST /auth/refresh``."""

    # A real token is ~43 chars (secrets.token_urlsafe(32)); bounded well
    # above that so an oversized value is rejected here rather than paying
    # a hash + DB round trip for an obviously-bogus request.
    refresh_token: str = Field(max_length=512)


class LogoutRequest(BaseModel):
    """Request body for ``POST /auth/logout``."""

    refresh_token: str = Field(max_length=512)


class UserProfile(BaseModel):
    """Response body for ``GET /users/me`` — the caller's own profile."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str | None
    avatar_url: str | None
    is_active: bool
    email_verified: bool
    is_superuser: bool
    created_at: datetime
    last_login_at: datetime | None
