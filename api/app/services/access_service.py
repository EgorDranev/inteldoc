"""Access service (spec §5.2). Revoke/extend are transaction owners; each emits
audit + outbox in the SAME transaction (INV-RV-1, all-or-nothing). Revoke blocks
the doctor's *next* request because capability is re-derived per request (INV-AC-2).
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.core.outbox import enqueue
from app.db.models.access import AccessGrant
from app.db.models.audit import AuditEvent
from app.db.resolver import internal_id_for_user
from app.domain.enums import ActorRole, AuditEventType, OutboxEventType
from app.domain.grant_status import GrantFacts, GrantStatus, effective_status, is_active
from app.services.uow import transaction


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def active_grant_for_doctor(
    s: AsyncSession,
    *,
    partner_id: uuid.UUID,
    patient_internal_id: uuid.UUID,
    clinic_id: uuid.UUID | None,
) -> AccessGrant | None:
    """The patient's currently-ACTIVE grant reaching the doctor's clinic, or None.

    Shared capability gate for the doctor→patient loop (INV-AC-2): effective status is
    DERIVED per request (never stored / never read from the token). Grants are scoped to
    the doctor's ``partner_id`` so a whole-clinic grant (``granted_to_id`` NULL) can never
    be honored across partners. A whole-clinic grant matches any clinic in the partner;
    a clinic-scoped grant matches only its own clinic.

    Returns the grant row (not just a bool) so read-side callers can stamp
    ``last_viewed_at`` on it (INV-AU-5 projection) without a second lookup. Plan-side
    callers that only need a yes/no use the truthiness of the result.
    """
    now = _now()
    grants = (
        await s.scalars(
            select(AccessGrant).where(
                AccessGrant.patient_internal_id == patient_internal_id,
                AccessGrant.partner_id == partner_id,
                AccessGrant.revoked_at.is_(None),
            )
        )
    ).all()
    for g in grants:
        if clinic_id is not None and g.granted_to_id not in (None, clinic_id):
            continue
        facts = GrantFacts(g.valid_from, g.expires_at, g.revoked_at, g.is_suspended)
        if is_active(facts, now):
            return g
    return None


def grant_view(grant: AccessGrant, now: dt.datetime | None = None) -> dict[str, Any]:
    now = now or _now()
    facts = GrantFacts(
        valid_from=grant.valid_from,
        expires_at=grant.expires_at,
        revoked_at=grant.revoked_at,
        is_suspended=grant.is_suspended,
    )
    return {
        "public_id": str(grant.public_id),
        "granted_to_type": grant.granted_to_type,
        "data_scope": grant.data_scope,
        "valid_from": grant.valid_from.isoformat(),
        "expires_at": grant.expires_at.isoformat() if grant.expires_at else None,
        "revoked_at": grant.revoked_at.isoformat() if grant.revoked_at else None,
        "last_viewed_at": grant.last_viewed_at.isoformat() if grant.last_viewed_at else None,
        "status": str(effective_status(facts, now)),
    }


async def list_grants_for_user(
    session: AsyncSession, user_public_id: uuid.UUID
) -> list[dict[str, Any]]:
    internal_id = await internal_id_for_user(session, user_public_id)
    if internal_id is None:
        return []
    rows = (
        await session.scalars(
            select(AccessGrant)
            .where(AccessGrant.patient_internal_id == internal_id)
            .order_by(AccessGrant.created_at.desc())
        )
    ).all()
    return [grant_view(g) for g in rows]


async def _owned_grant(
    s: AsyncSession, *, grant_public_id: uuid.UUID, user_public_id: uuid.UUID
) -> AccessGrant:
    internal_id = await internal_id_for_user(s, user_public_id)
    grant = await s.scalar(
        select(AccessGrant).where(AccessGrant.public_id == grant_public_id)
    )
    # Ownership check: never reveal another patient's grant (INV-AC-1 spirit).
    if grant is None or internal_id is None or grant.patient_internal_id != internal_id:
        raise not_found("grant not found")
    return grant


async def revoke_access(
    grant_public_id: uuid.UUID, user_public_id: uuid.UUID
) -> dict[str, Any]:
    now = _now()
    async with transaction() as uow:
        s = uow.session
        grant = await _owned_grant(
            s, grant_public_id=grant_public_id, user_public_id=user_public_id
        )
        if grant.revoked_at is None:
            grant.revoked_at = now
            await emit_audit(
                s, partner_id=grant.partner_id, actor_role=ActorRole.PATIENT,
                event_type=AuditEventType.ACCESS_REVOKED,
                subject_internal_id=grant.patient_internal_id,
                target_type="access_grant", target_id=grant.internal_id,
            )
            # Side-effects after commit (INV-RV-3): revoke + invalidations
            for ev in (
                OutboxEventType.REVOKE_ACCESS,
                OutboxEventType.INVALIDATE_SUMMARY,
                OutboxEventType.INVALIDATE_DOCTOR_QUEUE,
            ):
                await enqueue(
                    s, partner_id=grant.partner_id, event_type=ev,
                    payload={"grant_id": str(grant.public_id)},
                )
        return grant_view(grant, now)


async def extend_access(
    grant_public_id: uuid.UUID, user_public_id: uuid.UUID, new_expires_at: dt.datetime | None
) -> dict[str, Any]:
    now = _now()
    async with transaction() as uow:
        s = uow.session
        grant = await _owned_grant(
            s, grant_public_id=grant_public_id, user_public_id=user_public_id
        )
        facts = GrantFacts(grant.valid_from, grant.expires_at, grant.revoked_at, grant.is_suspended)
        if effective_status(facts, now) is GrantStatus.REVOKED:
            raise not_found("grant not found")
        grant.expires_at = new_expires_at
        await emit_audit(
            s, partner_id=grant.partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.ACCESS_EXTENDED,
            subject_internal_id=grant.patient_internal_id,
            target_type="access_grant", target_id=grant.internal_id,
        )
        return grant_view(grant, now)


async def expire_due_grants() -> dict[str, int]:
    """Scheduled compliance job (spec §8.2). Emits ``access_expired`` audit +
    invalidation for grants whose ``expires_at`` has passed and that haven't been
    audited yet. Idempotent (skips already-audited grants). A failure is a
    compliance issue → fail-loud, never silent (INV-TX-3)."""
    now = _now()
    expired = 0
    async with transaction() as uow:
        s = uow.session
        due = (
            await s.scalars(
                select(AccessGrant).where(
                    AccessGrant.expires_at.is_not(None),
                    AccessGrant.expires_at <= now,
                    AccessGrant.revoked_at.is_(None),
                )
            )
        ).all()
        for g in due:
            already = await s.scalar(
                select(AuditEvent.internal_id)
                .where(
                    AuditEvent.event_type == str(AuditEventType.ACCESS_EXPIRED),
                    AuditEvent.target_id == g.internal_id,
                )
                .limit(1)
            )
            if already is not None:
                continue
            await emit_audit(
                s, partner_id=g.partner_id, actor_role=ActorRole.SYSTEM,
                event_type=AuditEventType.ACCESS_EXPIRED,
                subject_internal_id=g.patient_internal_id,
                target_type="access_grant", target_id=g.internal_id,
            )
            for ev in (OutboxEventType.INVALIDATE_SUMMARY, OutboxEventType.INVALIDATE_DOCTOR_QUEUE):
                await enqueue(
                    s, partner_id=g.partner_id, event_type=ev,
                    payload={"grant_id": str(g.public_id)},
                )
            expired += 1
    return {"expired": expired}
