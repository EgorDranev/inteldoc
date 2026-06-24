"""Data-subject rights (spec §11.4): self-serve export + soft-delete.

Delete is a soft-delete (``deleted_at``) and revokes active grants in the same
transaction; the deletion event is preserved in audit even as content is erased
(hard-delete after N is deferred, Q7). Export assembles the subject's own data.
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
from app.db.models.access import AccessGrant, ConsentBundle, ConsentRecord
from app.db.models.core import Patient, PatientMedicalBaseline, UserAccount
from app.db.models.identity import PatientPii
from app.db.resolver import internal_id_for_user, resolve_patient_pii
from app.domain.enums import ActorRole, AuditEventType, OutboxEventType
from app.services.access_service import grant_view
from app.services.uow import transaction


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def export_me(session: AsyncSession, user_public_id: uuid.UUID) -> dict[str, Any]:
    internal_id = await internal_id_for_user(session, user_public_id)
    if internal_id is None:
        raise not_found("patient not found")
    pii = await resolve_patient_pii(session, internal_id)
    baseline = await session.scalar(
        select(PatientMedicalBaseline).where(
            PatientMedicalBaseline.patient_internal_id == internal_id
        )
    )
    grants = (
        await session.scalars(
            select(AccessGrant).where(AccessGrant.patient_internal_id == internal_id)
        )
    ).all()
    consents = (
        await session.scalars(
            select(ConsentRecord)
            .join(ConsentBundle, ConsentRecord.consent_bundle_id == ConsentBundle.internal_id)
            .where(ConsentBundle.patient_internal_id == internal_id)
        )
    ).all()
    return {
        "identity": None
        if pii is None
        else {
            "full_name": pii.full_name,
            "birth_date": pii.birth_date.isoformat(),
            "gender": pii.gender,
            "phone_e164": pii.phone_e164,
            "email": pii.email,
            "oms": pii.oms,
            "snils": pii.snils,
        },
        "baseline": None
        if baseline is None
        else {
            "height_cm": float(baseline.height_cm) if baseline.height_cm is not None else None,
            "weight_kg": float(baseline.weight_kg) if baseline.weight_kg is not None else None,
            "chronic_conditions": baseline.chronic_conditions or [],
            "allergies": baseline.allergies or [],
        },
        "access_grants": [grant_view(g) for g in grants],
        "consents": [
            {
                "consent_type": c.consent_type,
                "legal_text_version": c.legal_text_version,
                "accepted": c.accepted,
                "withdrawn_at": c.withdrawn_at.isoformat() if c.withdrawn_at else None,
            }
            for c in consents
        ],
    }


async def delete_me(user_public_id: uuid.UUID) -> dict[str, Any]:
    now = _now()
    async with transaction() as uow:
        s = uow.session
        internal_id = await internal_id_for_user(s, user_public_id)
        if internal_id is None:
            raise not_found("patient not found")
        pii = await s.get(PatientPii, internal_id)
        patient = await s.get(Patient, internal_id)
        account = await s.scalar(
            select(UserAccount).where(UserAccount.public_id == user_public_id)
        )
        partner_id = patient.partner_id if patient else (pii.partner_id if pii else None)
        # Revoke active grants (clinic loses access)
        grants = (
            await s.scalars(
                select(AccessGrant).where(
                    AccessGrant.patient_internal_id == internal_id,
                    AccessGrant.revoked_at.is_(None),
                )
            )
        ).all()
        for g in grants:
            g.revoked_at = now
            await enqueue(
                s, partner_id=g.partner_id, event_type=OutboxEventType.INVALIDATE_DOCTOR_QUEUE,
                payload={"grant_id": str(g.public_id)},
            )
        # Soft-delete content
        for row in (pii, patient, account):
            if row is not None:
                row.deleted_at = now
        if partner_id is not None:
            await emit_audit(
                s, partner_id=partner_id, actor_role=ActorRole.PATIENT,
                event_type=AuditEventType.ACCOUNT_DELETED, subject_internal_id=internal_id,
            )
        return {"deleted": True, "revoked_grants": len(grants)}
