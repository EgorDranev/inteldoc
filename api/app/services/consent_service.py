"""Consent service (spec §7.4, §11.3). Withdraw / re-sign / marketing channels.

Consent revoke ≠ access revoke (INV-CO-5): withdrawing a consent never touches
access grants. Each record keeps its ``legal_text_version`` + ``ack_mechanism``
(INV-CO-1/2). (Strict model spawns a new bundle on re-sign; the pilot updates the
record in place with ``re_signed_at`` — see data-model §11.3 for the refinement.)
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.db.models.access import ConsentBundle, ConsentRecord
from app.db.resolver import internal_id_for_user
from app.domain.enums import ActorRole, AuditEventType, ConsentType
from app.services.uow import transaction


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def _record(
    s: AsyncSession, user_public_id: uuid.UUID, consent_type: str
) -> ConsentRecord:
    internal_id = await internal_id_for_user(s, user_public_id)
    if internal_id is None:
        raise not_found("patient not found")
    rec = await s.scalar(
        select(ConsentRecord)
        .join(ConsentBundle, ConsentRecord.consent_bundle_id == ConsentBundle.internal_id)
        .where(
            ConsentBundle.patient_internal_id == internal_id,
            ConsentRecord.consent_type == consent_type,
        )
        .order_by(ConsentRecord.created_at.desc())
    )
    if rec is None:
        raise not_found("consent not found")
    return rec


def _view(rec: ConsentRecord) -> dict[str, Any]:
    return {
        "consent_type": rec.consent_type,
        "legal_text_version": rec.legal_text_version,
        "accepted": rec.accepted,
        "ack_mechanism": rec.ack_mechanism,
        "channels": rec.channels or [],
        "withdrawn_at": rec.withdrawn_at.isoformat() if rec.withdrawn_at else None,
        "re_signed_at": rec.re_signed_at.isoformat() if rec.re_signed_at else None,
    }


async def withdraw_consent(user_public_id: uuid.UUID, consent_type: str) -> dict[str, Any]:
    now = _now()
    async with transaction() as uow:
        rec = await _record(uow.session, user_public_id, consent_type)
        rec.accepted = False
        rec.withdrawn_at = now
        await emit_audit(
            uow.session, partner_id=rec.partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.CONSENT_REVOKED,
            metadata={"consent_type": consent_type},
        )
        return _view(rec)


async def resign_consent(
    user_public_id: uuid.UUID, consent_type: str, new_version: str
) -> dict[str, Any]:
    now = _now()
    async with transaction() as uow:
        rec = await _record(uow.session, user_public_id, consent_type)
        rec.accepted = True
        rec.legal_text_version = new_version
        rec.withdrawn_at = None
        rec.re_signed_at = now
        await emit_audit(
            uow.session, partner_id=rec.partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.CONSENT_RESIGNED,
            metadata={"consent_type": consent_type, "version": new_version},
        )
        return _view(rec)


async def set_marketing_channel(
    user_public_id: uuid.UUID, channel: str, on: bool
) -> dict[str, Any]:
    async with transaction() as uow:
        rec = await _record(uow.session, user_public_id, str(ConsentType.MARKETING))
        channels = set(rec.channels or [])
        if on:
            channels.add(channel)
        else:
            channels.discard(channel)
        rec.channels = sorted(channels)
        rec.accepted = bool(rec.channels)
        return _view(rec)
