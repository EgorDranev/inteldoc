"""Patient preparation lifecycle (data-model 10.1 / Q14) — the headline write path
of the doctor live surface.

The patient explicitly marks preparation started / completed; the doctor queue's
``prep_status`` (готов | в процессе | не начал) derives ready|in_progress|not_started
from ``Patient.prep_started_at`` / ``prep_completed_at``
(doctor_read_service._prep_status). Until this service existed the seed was the ONLY
writer of those columns, so a live patient could never move their own queue label —
this closes that gap.

Each transition is the transaction owner: it emits audit + busts the prep and
doctor-queue derived caches in the same txn (INV-AU-4, INV-RV-3). Both verbs are
idempotent — re-running ``complete_prep`` never double-audits.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.core.outbox import enqueue
from app.db.models.core import Patient
from app.db.resolver import internal_id_for_user
from app.domain.enums import ActorRole, AuditEventType, OutboxEventType
from app.services.uow import transaction


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def _prep_status(patient: Patient) -> str:
    if patient.prep_completed_at is not None:
        return "ready"
    if patient.prep_started_at is not None:
        return "in_progress"
    return "not_started"


def _view(patient: Patient) -> dict[str, Any]:
    return {
        "prep_status": _prep_status(patient),
        "prep_started_at": patient.prep_started_at.isoformat()
        if patient.prep_started_at
        else None,
        "prep_completed_at": patient.prep_completed_at.isoformat()
        if patient.prep_completed_at
        else None,
        "prep_time_spent_min": patient.prep_time_spent_min,
    }


async def _load_patient(s: AsyncSession, user_public_id: uuid.UUID) -> Patient:
    internal_id = await internal_id_for_user(s, user_public_id)
    if internal_id is None:
        raise not_found("patient not found")
    patient = await s.get(Patient, internal_id)
    if patient is None or patient.deleted_at is not None:
        raise not_found("patient not found")
    return patient


async def _invalidate(s: AsyncSession, patient: Patient) -> None:
    """The prep screen + the doctor queue both read prep_status → bust both caches."""
    for ev in (OutboxEventType.INVALIDATE_PREP, OutboxEventType.INVALIDATE_DOCTOR_QUEUE):
        await enqueue(
            s, partner_id=patient.partner_id, event_type=ev,
            payload={"patient_id": str(patient.public_id)},
        )


async def start_prep(user_public_id: uuid.UUID) -> dict[str, Any]:
    """Mark preparation started → queue label «в процессе». Idempotent (first call only
    audits)."""
    now = _now()
    async with transaction() as uow:
        s = uow.session
        patient = await _load_patient(s, user_public_id)
        if patient.prep_started_at is None:
            patient.prep_started_at = now
            await emit_audit(
                s, partner_id=patient.partner_id, actor_role=ActorRole.PATIENT,
                event_type=AuditEventType.PREP_STARTED,
                subject_internal_id=patient.internal_id,
                target_type="patient", target_id=patient.internal_id,
            )
            await _invalidate(s, patient)
        return _view(patient)


async def complete_prep(
    user_public_id: uuid.UUID, time_spent_min: int | None = None
) -> dict[str, Any]:
    """Mark preparation completed → queue label «готов». Sets ``prep_started_at`` too if
    it was never stamped (a patient who completes without an explicit start). Idempotent:
    only the first completion audits + invalidates."""
    now = _now()
    async with transaction() as uow:
        s = uow.session
        patient = await _load_patient(s, user_public_id)
        first_completion = patient.prep_completed_at is None
        if patient.prep_started_at is None:
            patient.prep_started_at = now
        patient.prep_completed_at = now
        if time_spent_min is not None:
            patient.prep_time_spent_min = time_spent_min
        if first_completion:
            await emit_audit(
                s, partner_id=patient.partner_id, actor_role=ActorRole.PATIENT,
                event_type=AuditEventType.PREP_COMPLETED,
                subject_internal_id=patient.internal_id,
                target_type="patient", target_id=patient.internal_id,
            )
            await _invalidate(s, patient)
        return _view(patient)
