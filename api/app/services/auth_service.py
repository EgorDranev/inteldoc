"""Auth service (spec §5.10, §6.3). Issues access JWTs (role + session only) and
a revocable refresh chain. Session revoke ≠ access revoke (INV-AC-3): revoking a
refresh chain does not touch access grants, and vice versa.

This is a transaction owner (uses ``uow.transaction()``).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import TokenClaims, issue_access_token, verify_password
from app.db.models.access import RefreshToken
from app.db.models.core import Doctor, UserAccount
from app.domain.enums import RefreshTokenStatus, UserRole
from app.domain.identity import normalize_phone_e164
from app.infra import otp
from app.services.uow import transaction


@dataclass(frozen=True, slots=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    role: str
    subject_public_id: str


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def _issue_pair(
    session: AsyncSession, account: UserAccount, *, clinic_id: uuid.UUID | None
) -> TokenPair:
    settings = get_settings()
    raw_refresh = secrets.token_urlsafe(32)
    refresh_row = RefreshToken(
        partner_id=account.partner_id,
        user_account_id=account.internal_id,
        token_hash=_hash_token(raw_refresh),
        status=str(RefreshTokenStatus.ISSUED),
        expires_at=_now() + dt.timedelta(seconds=settings.refresh_ttl_seconds),
    )
    session.add(refresh_row)
    await session.flush()  # need refresh_row.internal_id for the session id

    claims = TokenClaims(
        subject_public_id=str(account.public_id),
        role=account.role,
        session_id=str(refresh_row.internal_id),
        partner_id=str(account.partner_id),
        actor_clinic_id=str(clinic_id) if clinic_id else None,
    )
    account.last_login_at = _now()
    return TokenPair(
        access_token=issue_access_token(claims),
        refresh_token=raw_refresh,
        expires_in=settings.jwt_access_ttl_seconds,
        role=account.role,
        subject_public_id=str(account.public_id),
    )


async def request_patient_otp(phone: str) -> None:
    await otp.request_patient_otp(normalize_phone_e164(phone))


async def verify_patient_otp(phone: str, code: str) -> TokenPair | None:
    normalized = normalize_phone_e164(phone)
    if not await otp.verify_patient_otp(normalized, code):
        return None
    async with transaction() as uow:
        account = await uow.session.scalar(
            select(UserAccount).where(
                UserAccount.phone_e164 == normalized,
                UserAccount.role == str(UserRole.PATIENT),
                UserAccount.deleted_at.is_(None),
            )
        )
        if account is None:
            return None  # no account yet → onboarding required
        return await _issue_pair(uow.session, account, clinic_id=None)


async def web_login(username: str, password: str) -> TokenPair | None:
    async with transaction() as uow:
        account = await uow.session.scalar(
            select(UserAccount).where(
                UserAccount.username == username,
                UserAccount.role.in_([str(UserRole.DOCTOR), str(UserRole.CLINIC_ADMIN)]),
                UserAccount.deleted_at.is_(None),
            )
        )
        if account is None or not account.password_hash:
            return None
        if not verify_password(password, account.password_hash):
            return None
        clinic_id: uuid.UUID | None = None
        if account.role == str(UserRole.DOCTOR):
            clinic_id = await uow.session.scalar(
                select(Doctor.clinic_id).where(Doctor.user_account_id == account.internal_id)
            )
        return await _issue_pair(uow.session, account, clinic_id=clinic_id)


async def refresh_session(raw_refresh: str) -> TokenPair | None:
    token_hash = _hash_token(raw_refresh)
    async with transaction() as uow:
        row = await uow.session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        if row is None or row.status != str(RefreshTokenStatus.ISSUED) or row.expires_at <= _now():
            return None
        account = await uow.session.get(UserAccount, row.user_account_id)
        if account is None:
            return None
        row.status = str(RefreshTokenStatus.ROTATED)
        row.revoked_at = _now()
        clinic_id: uuid.UUID | None = None
        if account.role == str(UserRole.DOCTOR):
            clinic_id = await uow.session.scalar(
                select(Doctor.clinic_id).where(Doctor.user_account_id == account.internal_id)
            )
        pair = await _issue_pair(uow.session, account, clinic_id=clinic_id)
        # link rotation chain
        new_row = await uow.session.scalar(
            select(RefreshToken)
            .where(RefreshToken.token_hash == _hash_token(pair.refresh_token))
        )
        if new_row is not None:
            new_row.parent_token_id = row.internal_id
        return pair


async def logout(raw_refresh: str) -> None:
    token_hash = _hash_token(raw_refresh)
    async with transaction() as uow:
        row = await uow.session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        if row is not None and row.status == str(RefreshTokenStatus.ISSUED):
            row.status = str(RefreshTokenStatus.REVOKED)
            row.revoked_at = _now()
