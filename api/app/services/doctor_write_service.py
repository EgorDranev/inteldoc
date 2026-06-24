"""Doctor WRITE surface (spec §7.6) — the doctor's structuring-metadata verbs.

Two write verbs land here, both grant-gated and read-only on CLINICAL VALUES:

  * ``stamp_ocr_verdict`` — the doctor judges a low-confidence reading trustworthy
    (``confirmed``) or an OCR error (``rejected``) on the ``doctor_metadata_verdict``
    axis. It NEVER touches ``raw_value`` (that is the patient's transcription axis,
    INV-AI-4). Stamped with the doctor's display name + timestamp, auditable
    (OCR_FIELD_VERDICT_STAMPED). Once every low-confidence field on the analysis carries
    a verdict the structuring review is done, so the analysis auto-acknowledges —
    mirroring the frontend's FieldVerificationFooter behaviour.

  * ``acknowledge_analysis`` — the doctor accepts a structured analysis into the
    clinical grid (status → acknowledged) and mirrors the linked plan item to
    acknowledged, closing the patient→doctor loop (request progress then derives
    ``completed`` — plan_service §12.7).

Capability (the active grant) is re-derived per request from access_grant (INV-AC-2),
never the token. Missing patient / wrong partner / no grant all surface as ``not_found``
(existence is never revealed — parity with doctor_read_service / plan_service). The
doctor surface stays read-only on clinical content: only structuring metadata + the
acknowledge state transition move here, never a clinical value.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import bad_request, not_found
from app.core.outbox import enqueue
from app.core.security import TokenClaims
from app.db.models.clinical import Analysis, OcrField
from app.db.models.core import Doctor, Patient
from app.db.models.plan import PlanItem
from app.db.resolver import resolve_public_id
from app.domain.enums import (
    ActorRole,
    AnalysisStatus,
    AuditEventType,
    DoctorMetadataVerdict,
    OutboxEventType,
    PlanItemStatus,
)
from app.services.access_service import active_grant_for_doctor
from app.services.doctor_read_service import _resolve_calling_doctor
from app.services.uow import transaction

_RESOLVED_VERDICTS = (str(DoctorMetadataVerdict.CONFIRMED), str(DoctorMetadataVerdict.REJECTED))


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def _gated_patient(
    s: AsyncSession, claims: TokenClaims, patient_public_id: uuid.UUID
) -> tuple[uuid.UUID, Doctor]:
    """Resolve the calling doctor + target patient under an ACTIVE grant. Every failure
    mode surfaces as ``not_found`` (existence never revealed). Mirrors the gate in
    doctor_read_service.build_summary so a write is reachable exactly when a read is."""
    partner_id = uuid.UUID(claims.partner_id)
    doctor = await _resolve_calling_doctor(s, claims)
    patient_internal_id = await resolve_public_id(s, patient_public_id)
    if patient_internal_id is None:
        raise not_found("patient not found")
    patient = await s.get(Patient, patient_internal_id)
    if patient is None or patient.deleted_at is not None or patient.partner_id != partner_id:
        raise not_found("patient not found")
    grant = await active_grant_for_doctor(
        s,
        partner_id=partner_id,
        patient_internal_id=patient_internal_id,
        clinic_id=doctor.clinic_id,
    )
    if grant is None:
        raise not_found("patient not found")
    return patient_internal_id, doctor


async def _analysis_for_patient(
    s: AsyncSession, patient_internal_id: uuid.UUID, analysis_public_id: uuid.UUID
) -> Analysis:
    analysis = await s.scalar(
        select(Analysis).where(
            Analysis.public_id == analysis_public_id,
            Analysis.patient_internal_id == patient_internal_id,
            Analysis.deleted_at.is_(None),
        )
    )
    if analysis is None:
        raise not_found("analysis not found")
    return analysis


async def _fields_of(s: AsyncSession, analysis: Analysis) -> list[OcrField]:
    rows = await s.scalars(select(OcrField).where(OcrField.analysis_id == analysis.internal_id))
    return list(rows.all())


def _doctor_analysis_view(
    analysis: Analysis, fields: list[OcrField], patient_public_id: str
) -> dict[str, Any]:
    """Compact doctor-facing analysis view the frontend reconciles after a write —
    status + the metadata-verdict axis per field (never raw_value)."""
    return {
        "patient_public_id": patient_public_id,
        "analysis_public_id": str(analysis.public_id),
        "status": analysis.status,
        "fields": [
            {
                "field_key": f.field_key,
                "low_confidence": bool(f.low_confidence),
                "verification": f.doctor_metadata_verdict
                if f.doctor_metadata_verdict in _RESOLVED_VERDICTS
                else None,
                "verified_by": f.doctor_verdict_by,
                "verified_at": f.doctor_verdict_at.isoformat() if f.doctor_verdict_at else None,
            }
            for f in fields
        ],
    }


async def _acknowledge_row(
    s: AsyncSession,
    *,
    analysis: Analysis,
    partner_id: uuid.UUID,
    patient_internal_id: uuid.UUID,
) -> bool:
    """Transition an analysis uploaded|structured → acknowledged and mirror its linked
    plan item to acknowledged (so the request progress derives 'completed' — plan_service
    §12.7). Idempotent: a no-op returning ``False`` if already acknowledged/rejected."""
    if analysis.status not in (str(AnalysisStatus.UPLOADED), str(AnalysisStatus.STRUCTURED)):
        return False
    analysis.status = str(AnalysisStatus.ACKNOWLEDGED)
    if analysis.linked_plan_item_id is not None:
        item = await s.get(PlanItem, analysis.linked_plan_item_id)
        if (
            item is not None
            and item.patient_internal_id == patient_internal_id
            and item.status != str(PlanItemStatus.ACKNOWLEDGED)
        ):
            item.status = str(PlanItemStatus.ACKNOWLEDGED)
    await emit_audit(
        s,
        partner_id=partner_id,
        actor_role=ActorRole.DOCTOR,
        event_type=AuditEventType.ANALYSIS_ACKNOWLEDGED,
        subject_internal_id=patient_internal_id,
        target_type="analysis",
        target_id=analysis.internal_id,
    )
    return True


async def stamp_ocr_verdict(
    claims: TokenClaims,
    patient_public_id: uuid.UUID,
    analysis_public_id: uuid.UUID,
    field_key: str,
    verdict: str,
) -> dict[str, Any]:
    """Stamp the doctor's structuring-metadata verdict on one OCR field (INV-AI-4)."""
    if verdict not in _RESOLVED_VERDICTS:
        raise bad_request("verdict must be 'confirmed' or 'rejected'")
    now = _now()
    async with transaction() as uow:
        s = uow.session
        partner_id = uuid.UUID(claims.partner_id)
        patient_internal_id, _doctor = await _gated_patient(s, claims, patient_public_id)
        analysis = await _analysis_for_patient(s, patient_internal_id, analysis_public_id)
        field = await s.scalar(
            select(OcrField).where(
                OcrField.analysis_id == analysis.internal_id,
                OcrField.field_key == field_key,
            )
        )
        if field is None:
            raise not_found("field not found")

        # Metadata axis ONLY — the doctor decides whether to trust the reading, never
        # what the value should be (raw_value is the patient's transcription axis).
        field.doctor_metadata_verdict = verdict
        field.doctor_verdict_by = _doctor.name
        field.doctor_verdict_at = now
        await emit_audit(
            s,
            partner_id=partner_id,
            actor_role=ActorRole.DOCTOR,
            event_type=AuditEventType.OCR_FIELD_VERDICT_STAMPED,
            subject_internal_id=patient_internal_id,
            target_type="ocr_field",
            target_id=field.internal_id,
            metadata={"verdict": verdict},  # structuring code, never a clinical value
        )

        # Auto-acknowledge once every low-confidence field carries a verdict — the
        # structuring review is then complete (mirrors the frontend footer).
        fields = await _fields_of(s, analysis)
        low_conf = [f for f in fields if f.low_confidence]
        if low_conf and all(f.doctor_metadata_verdict in _RESOLVED_VERDICTS for f in low_conf):
            await _acknowledge_row(
                s,
                analysis=analysis,
                partner_id=partner_id,
                patient_internal_id=patient_internal_id,
            )

        # A verdict (and a possible acknowledge) changes the summary + the queue glance.
        for ev in (OutboxEventType.INVALIDATE_SUMMARY, OutboxEventType.INVALIDATE_DOCTOR_QUEUE):
            await enqueue(
                s, partner_id=partner_id, event_type=ev,
                payload={"patient_id": str(patient_public_id)},
            )
        fields = await _fields_of(s, analysis)
        return _doctor_analysis_view(analysis, fields, str(patient_public_id))


async def acknowledge_analysis(
    claims: TokenClaims,
    patient_public_id: uuid.UUID,
    analysis_public_id: uuid.UUID,
) -> dict[str, Any]:
    """Accept a structured analysis into the clinical grid + advance its plan item."""
    async with transaction() as uow:
        s = uow.session
        partner_id = uuid.UUID(claims.partner_id)
        patient_internal_id, _doctor = await _gated_patient(s, claims, patient_public_id)
        analysis = await _analysis_for_patient(s, patient_internal_id, analysis_public_id)
        changed = await _acknowledge_row(
            s, analysis=analysis, partner_id=partner_id, patient_internal_id=patient_internal_id
        )
        if changed:
            for ev in (OutboxEventType.INVALIDATE_SUMMARY, OutboxEventType.INVALIDATE_DOCTOR_QUEUE):
                await enqueue(
                    s, partner_id=partner_id, event_type=ev,
                    payload={"patient_id": str(patient_public_id)},
                )
        fields = await _fields_of(s, analysis)
        return _doctor_analysis_view(analysis, fields, str(patient_public_id))
