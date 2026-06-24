"""Upload service (spec §5.3, §9). Presign → register → scan→accepted → OCR-stub.

The raw file is PII+medical until accepted (INV-FP-2); in the pilot the scan is a
simulated pass (real virus/quality scan is Slice B infra, Q). The OCR stub emits
per-field ``ocr_field`` rows with their own confidence (INV-AI-2). One transaction
owns the document+analysis+fields+audit+outbox writes.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from anyio import to_thread
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.core.outbox import enqueue
from app.db.models.clinical import Analysis, MedicalDocument, OcrField, StorageObject
from app.db.resolver import internal_id_for_user
from app.domain.enums import (
    ActorRole,
    AnalysisStatus,
    AuditEventType,
    DocumentProcessingStatus,
    DocumentType,
    OutboxEventType,
    StorageZone,
)
from app.infra import ocr_adapter, s3_client
from app.services.uow import transaction


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def sign_upload(content_type: str | None = None) -> dict[str, str]:
    """Stateless presign into quarantine. The client PUTs the file directly to S3."""
    key = s3_client.new_quarantine_key()
    return {"object_key": key, "upload_url": s3_client.generate_presigned_put(key, content_type)}


async def store_uploaded_file(data: bytes, content_type: str | None) -> dict[str, str]:
    """Backend-proxied upload (demo path): store the raw bytes under a fresh
    quarantine key and return the ``object_key`` for ``register_analysis`` to OCR.

    The production write path is the presigned PUT (``sign_upload``) — INV-FP-2,
    file never transits the app server. Proxying is a deliberate demo simplification:
    a self-hosted stack keeps the object store on the internal network (no public
    endpoint, no S3 CORS), so the browser cannot PUT to it directly. No real PHI here.
    Blocking S3 write runs off the event loop."""
    key = s3_client.new_quarantine_key()
    await to_thread.run_sync(
        s3_client.put_bytes, key, data, content_type or "application/octet-stream"
    )
    return {"object_key": key}


def _field_view(f: OcrField) -> dict[str, Any]:
    return {
        "field_key": f.field_key,
        "raw_value": f.raw_value,
        "unit": f.unit,
        "reference_text": f.reference_text,
        "confidence": float(f.confidence) if f.confidence is not None else None,
        "low_confidence": f.low_confidence,
        "patient_transcription_state": f.patient_transcription_state,
        "doctor_metadata_verdict": f.doctor_metadata_verdict,
    }


async def analysis_view(s: AsyncSession, analysis: Analysis) -> dict[str, Any]:
    fields = (
        await s.scalars(select(OcrField).where(OcrField.analysis_id == analysis.internal_id))
    ).all()
    return {
        "public_id": str(analysis.public_id),
        "analysis_type": analysis.analysis_type,
        "label": analysis.label,
        "status": analysis.status,
        "lab_date": analysis.lab_date.isoformat() if analysis.lab_date else None,
        "uploaded_at": analysis.uploaded_at.isoformat(),
        "quality_check": analysis.quality_check,
        "fields": [_field_view(f) for f in fields],
    }


async def register_analysis(
    user_public_id: uuid.UUID,
    *,
    object_key: str,
    analysis_type: str,
    label: str,
    lab_date: str | None,
    idempotency_key: str,
    plan_item_public_id: str | None = None,
) -> dict[str, Any]:
    async with transaction() as uow:
        s = uow.session
        internal_id = await internal_id_for_user(s, user_public_id)
        if internal_id is None:
            raise not_found("patient not found")
        from app.db.models.core import Patient

        patient = await s.get(Patient, internal_id)
        if patient is None:
            raise not_found("patient not found")
        partner_id = patient.partner_id

        # storage object (quarantine → accepted after the simulated scan)
        storage = StorageObject(
            partner_id=partner_id,
            storage_zone=str(StorageZone.QUARANTINE),
            object_key=object_key,
        )
        s.add(storage)
        await s.flush()

        document = MedicalDocument(
            partner_id=partner_id,
            patient_internal_id=internal_id,
            storage_object_id=storage.internal_id,
            document_type=str(DocumentType.ANALYSIS_RESULT),
            processing_status=str(DocumentProcessingStatus.UPLOADED),
            quality_check="clear",
            document_date=dt.date.fromisoformat(lab_date) if lab_date else None,
            source="file",
        )
        s.add(document)
        await emit_audit(
            s, partner_id=partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.DOCUMENT_UPLOADED, subject_internal_id=internal_id,
        )

        # --- simulated scan: pass → accepted ---
        storage.storage_zone = str(StorageZone.ACCEPTED)
        document.processing_status = str(DocumentProcessingStatus.ACCEPTED)
        await emit_audit(
            s, partner_id=partner_id, actor_role=ActorRole.SYSTEM,
            event_type=AuditEventType.DOCUMENT_ACCEPTED, subject_internal_id=internal_id,
            metadata={"quality": "clear"},
        )

        analysis = Analysis(
            partner_id=partner_id,
            patient_internal_id=internal_id,
            medical_document_id=document.internal_id,
            analysis_type=analysis_type,
            label=label,
            lab_date=dt.date.fromisoformat(lab_date) if lab_date else None,
            quality_check="clear",
            status=str(AnalysisStatus.UPLOADED),
        )
        s.add(analysis)
        await s.flush()

        # --- OCR: emit per-field rows (INV-AI-2). Engine selected by OCR_ENGINE
        # (stub | tesseract). S3 read + OCR are blocking → run off the event loop. ---
        extracted = await to_thread.run_sync(
            ocr_adapter.extract_fields_from_object, object_key, analysis_type
        )
        if extracted:
            for fx in extracted:
                s.add(
                    OcrField(
                        partner_id=partner_id,
                        analysis_id=analysis.internal_id,
                        medical_document_id=document.internal_id,
                        field_key=fx.field_key,
                        raw_value=fx.raw_value,
                        normalized_value=fx.normalized_value,
                        unit=fx.unit,
                        reference_text=fx.reference_text,
                        reference_min=fx.reference_min,
                        reference_max=fx.reference_max,
                        confidence=fx.confidence,
                        low_confidence=ocr_adapter.is_low_confidence(fx.confidence),
                    )
                )
            document.processing_status = str(DocumentProcessingStatus.OCR_DONE)
            analysis.status = str(AnalysisStatus.STRUCTURED)
            await emit_audit(
                s, partner_id=partner_id, actor_role=ActorRole.SYSTEM,
                event_type=AuditEventType.OCR_COMPLETED, subject_internal_id=internal_id,
                target_type="analysis", target_id=analysis.internal_id,
                metadata={"field_count": len(extracted)},
            )
        else:
            # Circuit-breaker / unknown type → original_only (scan available, no structure)
            document.processing_status = str(DocumentProcessingStatus.ORIGINAL_ONLY)

        # If this upload fulfils a doctor's plan item, advance it (assigned → uploaded)
        # and link both directions. Same txn — all-or-nothing with the analysis write.
        if plan_item_public_id:
            from app.db.models.plan import PlanItem
            from app.services import plan_service

            item = await s.scalar(
                select(PlanItem).where(
                    PlanItem.public_id == uuid.UUID(plan_item_public_id),
                    PlanItem.patient_internal_id == internal_id,
                )
            )
            if item is None:
                raise not_found("plan item not found")
            analysis.linked_plan_item_id = item.internal_id
            await plan_service.advance_on_analysis_linked(
                s,
                patient_internal_id=internal_id,
                analysis_internal_id=analysis.internal_id,
                plan_item_internal_id=item.internal_id,
            )

        await enqueue(
            s, partner_id=partner_id, event_type=OutboxEventType.INVALIDATE_SUMMARY,
            payload={"patient": str(analysis.public_id)},
        )
        return await analysis_view(s, analysis)
