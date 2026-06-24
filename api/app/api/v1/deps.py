"""Request dependencies (spec §6.2, §7.1).

Capabilities are resolved per-request (here / in services), never read from the
token. The token carries role + session identity only (INV-AC-4).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, unauthorized
from app.core.security import TokenClaims, decode_access_token
from app.db.session import app_sessionmaker
from app.domain.enums import UserRole


async def get_app_session() -> AsyncIterator[AsyncSession]:
    """Read-only request session under the ``app`` role (writes go via services/uow)."""
    async with app_sessionmaker()() as session:
        yield session


def get_claims(authorization: Annotated[str | None, Header()] = None) -> TokenClaims:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise unauthorized("missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        return decode_access_token(token)
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise unauthorized("invalid token") from exc


def require_patient(claims: Annotated[TokenClaims, Depends(get_claims)]) -> TokenClaims:
    if claims.role != str(UserRole.PATIENT):
        raise unauthorized("patient role required")
    return claims


def require_web(claims: Annotated[TokenClaims, Depends(get_claims)]) -> TokenClaims:
    if claims.role not in (str(UserRole.DOCTOR), str(UserRole.CLINIC_ADMIN)):
        raise unauthorized("doctor/admin role required")
    return claims


def require_admin(claims: Annotated[TokenClaims, Depends(get_claims)]) -> TokenClaims:
    if claims.role != str(UserRole.CLINIC_ADMIN):
        raise unauthorized("clinic_admin role required")
    return claims


def idempotency_key(
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str:
    if not idempotency_key:
        raise bad_request("Idempotency-Key header is required")
    return idempotency_key


# Type aliases for endpoint signatures
AppSession = Annotated[AsyncSession, Depends(get_app_session)]
Claims = Annotated[TokenClaims, Depends(get_claims)]
PatientClaims = Annotated[TokenClaims, Depends(require_patient)]
WebClaims = Annotated[TokenClaims, Depends(require_web)]
AdminClaims = Annotated[TokenClaims, Depends(require_admin)]
IdempotencyKey = Annotated[str, Depends(idempotency_key)]
