"""Profile service (spec §7.4). Patient self-service identity + baseline edits.

Editing identity resets ``identity_verified_at`` (the clinic must re-confirm the
match), mirroring the prototype's ``updatePatientIdentity``. PII writes are
service-owned; reads stay behind the resolver (INV-ID-1).
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.db.models.core import Patient, PatientMedicalBaseline
from app.db.models.identity import PatientPii
from app.db.resolver import internal_id_for_user
from app.domain.enums import ActorRole, AuditEventType
from app.services.uow import transaction


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def _patient_internal(s: AsyncSession, user_public_id: uuid.UUID) -> uuid.UUID:
    internal_id = await internal_id_for_user(s, user_public_id)
    if internal_id is None:
        raise not_found("patient not found")
    return internal_id


async def update_identity(
    user_public_id: uuid.UUID, patch: dict[str, Any]
) -> dict[str, Any]:
    now = _now()
    async with transaction() as uow:
        s = uow.session
        internal_id = await _patient_internal(s, user_public_id)
        pii = await s.get(PatientPii, internal_id)
        patient = await s.get(Patient, internal_id)
        if pii is None or patient is None:
            raise not_found("patient not found")
        if patch.get("name"):
            pii.full_name = patch["name"]
        if patch.get("dob"):
            pii.birth_date = dt.date.fromisoformat(patch["dob"])
        if patch.get("gender"):
            pii.gender = patch["gender"]
        if "oms" in patch:
            pii.oms = patch["oms"]
        patient.identity_updated_at = now
        patient.identity_verified_at = None  # reset — clinic must re-confirm
        await emit_audit(
            s, partner_id=patient.partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.IDENTITY_UPDATED, subject_internal_id=internal_id,
        )
        return {
            "name": pii.full_name,
            "dob": pii.birth_date.isoformat(),
            "gender": pii.gender,
            "oms": pii.oms,
            "identity_verified_at": None,
        }


async def update_baseline(
    user_public_id: uuid.UUID, patch: dict[str, Any]
) -> dict[str, Any]:
    now = _now()
    async with transaction() as uow:
        s = uow.session
        internal_id = await _patient_internal(s, user_public_id)
        patient = await s.get(Patient, internal_id)
        if patient is None:
            raise not_found("patient not found")
        baseline = await s.scalar(
            select(PatientMedicalBaseline).where(
                PatientMedicalBaseline.patient_internal_id == internal_id
            )
        )
        if baseline is None:
            # Upsert carries the patient's partner_id — never NULL (INV-TX-2).
            baseline = PatientMedicalBaseline(
                patient_internal_id=internal_id,
                partner_id=patient.partner_id,
            )
            s.add(baseline)
        if "height_cm" in patch:
            baseline.height_cm = patch["height_cm"]
        if "weight_kg" in patch:
            baseline.weight_kg = patch["weight_kg"]
        if "chronic_conditions" in patch:
            baseline.chronic_conditions = patch["chronic_conditions"]
        if "allergies" in patch:
            baseline.allergies = patch["allergies"]
        baseline.baseline_updated_at = now
        await emit_audit(
            s, partner_id=patient.partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.BASELINE_UPDATED, subject_internal_id=internal_id,
        )
        return {
            "height_cm": float(baseline.height_cm) if baseline.height_cm is not None else None,
            "weight_kg": float(baseline.weight_kg) if baseline.weight_kg is not None else None,
            "chronic_conditions": baseline.chronic_conditions or [],
            "allergies": baseline.allergies or [],
            "baseline_updated_at": now.isoformat(),
        }
