"""Security primitives: JWT (role + session identity only) and password hashing.

JWT carries role + session identity ONLY, never capabilities (INV-AC-4).
Capabilities are resolved per-request from access_grant (spec §6.2), so a
pre-revoke token grants nothing post-revoke.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False


@dataclass(frozen=True, slots=True)
class TokenClaims:
    """Decoded access-token claims. Role + session identity only."""

    subject_public_id: str  # user_account.public_id
    role: str  # patient | doctor | clinic_admin
    session_id: str  # refresh-chain / session identity
    partner_id: str
    actor_clinic_id: str | None = None  # doctor/admin clinic, for capability resolution


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def issue_access_token(claims: TokenClaims) -> str:
    settings = get_settings()
    now = _now()
    payload: dict[str, Any] = {
        "sub": claims.subject_public_id,
        "role": claims.role,
        "sid": claims.session_id,
        "partner_id": claims.partner_id,
        "clinic_id": claims.actor_clinic_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(seconds=settings.jwt_access_ttl_seconds)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_signing_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> TokenClaims:
    settings = get_settings()
    data = jwt.decode(
        token,
        settings.jwt_signing_key,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["exp", "iat", "sub"]},
    )
    if data.get("type") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return TokenClaims(
        subject_public_id=data["sub"],
        role=data["role"],
        session_id=data["sid"],
        partner_id=data["partner_id"],
        actor_clinic_id=data.get("clinic_id"),
    )
