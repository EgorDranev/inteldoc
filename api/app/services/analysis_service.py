"""Analysis service (spec §5.3). Patient-side reads + OCR-field transcription edits.

A patient edit appends an ``ocr_field_revision`` and never overwrites in place
(INV-AI-3). The patient touches only the transcription axis — never the doctor's
metadata verdict (INV-AI-4).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.db.models.clinical import Analysis, OcrField, OcrFieldRevision
from app.db.resolver import internal_id_for_user
from app.domain.enums import ActorRole, AuditEventType, OcrEditedByType
from app.services.uow import transaction
from app.services.upload_service import analysis_view


async def list_analyses(s: AsyncSession, user_public_id: uuid.UUID) -> list[dict[str, Any]]:
    internal_id = await internal_id_for_user(s, user_public_id)
    if internal_id is None:
        return []
    rows = (
        await s.scalars(
            select(Analysis)
            .where(Analysis.patient_internal_id == internal_id, Analysis.deleted_at.is_(None))
            .order_by(Analysis.uploaded_at.desc())
        )
    ).all()
    return [await analysis_view(s, a) for a in rows]


async def get_analysis(
    s: AsyncSession, user_public_id: uuid.UUID, analysis_public_id: uuid.UUID
) -> dict[str, Any]:
    internal_id = await internal_id_for_user(s, user_public_id)
    analysis = await s.scalar(
        select(Analysis).where(
            Analysis.public_id == analysis_public_id,
            Analysis.patient_internal_id == internal_id,
        )
    )
    if analysis is None:
        raise not_found("analysis not found")
    return await analysis_view(s, analysis)


async def edit_ocr_field(
    user_public_id: uuid.UUID, analysis_public_id: uuid.UUID, field_key: str, new_value: str
) -> dict[str, Any]:
    async with transaction() as uow:
        s = uow.session
        internal_id = await internal_id_for_user(s, user_public_id)
        analysis = await s.scalar(
            select(Analysis).where(
                Analysis.public_id == analysis_public_id,
                Analysis.patient_internal_id == internal_id,
            )
        )
        if analysis is None:
            raise not_found("analysis not found")
        field = await s.scalar(
            select(OcrField).where(
                OcrField.analysis_id == analysis.internal_id, OcrField.field_key == field_key
            )
        )
        if field is None:
            raise not_found("field not found")

        old = field.raw_value
        # Append-only revision — never silent overwrite (INV-AI-3)
        s.add(
            OcrFieldRevision(
                ocr_field_id=field.internal_id,
                partner_id=field.partner_id,
                old_raw_value=old,
                new_raw_value=new_value,
                edited_by_type=str(OcrEditedByType.PATIENT),
            )
        )
        field.raw_value = new_value
        # Patient corrected the transcription → mark confirmed on the patient axis only.
        field.patient_transcription_state = "confirmed"
        await emit_audit(
            s, partner_id=field.partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.OCR_FIELD_EDITED, subject_internal_id=internal_id,
            target_type="ocr_field", target_id=field.internal_id,
        )
        return await analysis_view(s, analysis)
