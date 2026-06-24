"""Document service (spec §5.3, §9.3). Non-analysis uploads (passport/OMS/referral)
+ the backend-proxied, owner-checked file read (no long-lived presigned GET —
INV-RV-2). Visibility requires accepted status (INV-FP-2).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.db.models.clinical import MedicalDocument, StorageObject
from app.db.models.core import Patient
from app.db.resolver import internal_id_for_user
from app.domain.enums import (
    ActorRole,
    AuditEventType,
    DocumentProcessingStatus,
    StorageZone,
)
from app.infra import s3_client
from app.services.uow import transaction

_VISIBLE = {
    str(DocumentProcessingStatus.ACCEPTED),
    str(DocumentProcessingStatus.OCR_DONE),
    str(DocumentProcessingStatus.ORIGINAL_ONLY),
}


def _view(d: MedicalDocument) -> dict[str, Any]:
    return {
        "public_id": str(d.public_id),
        "document_type": d.document_type,
        "label": d.label,
        "processing_status": d.processing_status,
        "uploaded_at": d.uploaded_at.isoformat(),
        "issuer_name": d.issuer_name,
    }


async def list_documents(s: AsyncSession, user_public_id: uuid.UUID) -> list[dict[str, Any]]:
    internal_id = await internal_id_for_user(s, user_public_id)
    if internal_id is None:
        return []
    rows = (
        await s.scalars(
            select(MedicalDocument)
            .where(
                MedicalDocument.patient_internal_id == internal_id,
                MedicalDocument.document_type != "analysis_result",
                MedicalDocument.deleted_at.is_(None),
            )
            .order_by(MedicalDocument.uploaded_at.desc())
        )
    ).all()
    return [_view(d) for d in rows]


async def register_document(
    user_public_id: uuid.UUID,
    *,
    object_key: str,
    document_type: str,
    label: str | None,
    issuer_name: str | None = None,
) -> dict[str, Any]:
    async with transaction() as uow:
        s = uow.session
        internal_id = await internal_id_for_user(s, user_public_id)
        if internal_id is None:
            raise not_found("patient not found")
        patient = await s.get(Patient, internal_id)
        if patient is None:
            raise not_found("patient not found")
        storage = StorageObject(
            partner_id=patient.partner_id,
            storage_zone=str(StorageZone.ACCEPTED),
            object_key=object_key,
        )
        s.add(storage)
        await s.flush()
        document = MedicalDocument(
            partner_id=patient.partner_id,
            patient_internal_id=internal_id,
            storage_object_id=storage.internal_id,
            document_type=document_type,
            label=label,
            issuer_name=issuer_name,
            processing_status=str(DocumentProcessingStatus.ACCEPTED),
            quality_check="clear",
        )
        s.add(document)
        await emit_audit(
            s, partner_id=patient.partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.DOCUMENT_UPLOADED, subject_internal_id=internal_id,
        )
        await s.flush()
        return _view(document)


async def read_document_bytes(
    s: AsyncSession, user_public_id: uuid.UUID, document_public_id: uuid.UUID
) -> tuple[bytes, str]:
    internal_id = await internal_id_for_user(s, user_public_id)
    document = await s.scalar(
        select(MedicalDocument).where(
            MedicalDocument.public_id == document_public_id,
            MedicalDocument.patient_internal_id == internal_id,
        )
    )
    if document is None or document.processing_status not in _VISIBLE:
        raise not_found("document not available")
    storage = await s.get(StorageObject, document.storage_object_id)
    if storage is None or not s3_client.object_exists(storage.object_key):
        raise not_found("file not found")
    return s3_client.get_bytes(storage.object_key), "application/octet-stream"
