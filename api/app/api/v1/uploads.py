"""Slice B patient endpoints (spec §7.5): uploads, analyses, documents, complaints.

All require a patient session. Files are uploaded directly to S3 via a presigned
PUT (quarantine); the backend registers + structures them.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Response, UploadFile

from app.api.v1.deps import AppSession, IdempotencyKey, PatientClaims
from app.api.v1.schemas.clinical import (
    AddComplaintIn,
    EditOcrFieldIn,
    RegisterAnalysisIn,
    RegisterDocumentIn,
    SignUploadIn,
    SignUploadOut,
    UpdateComplaintIn,
)
from app.core.errors import bad_request
from app.services import (
    analysis_service,
    complaint_service,
    document_service,
    upload_service,
)

router = APIRouter(tags=["uploads"])


def _uid(claims: PatientClaims) -> uuid.UUID:
    return uuid.UUID(claims.subject_public_id)


@router.post("/uploads/sign", response_model=SignUploadOut)
async def sign_upload(body: SignUploadIn, claims: PatientClaims) -> SignUploadOut:
    return SignUploadOut(**upload_service.sign_upload(body.content_type))


# 15 MB — generous for a lab photo/PDF, bounds a hostile upload on the demo host.
_MAX_UPLOAD_BYTES = 15 * 1024 * 1024


@router.post("/uploads/file")
async def upload_file(claims: PatientClaims, file: UploadFile) -> dict[str, str]:
    """Backend-proxied upload (demo). Multipart file → object_key for register.
    See upload_service.store_uploaded_file for why proxying over presigned PUT."""
    data = await file.read()
    if not data:
        raise bad_request("empty file")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise bad_request("file too large")
    return await upload_service.store_uploaded_file(data, file.content_type)


@router.post("/analyses")
async def register_analysis(
    body: RegisterAnalysisIn, claims: PatientClaims, idem: IdempotencyKey
) -> dict[str, Any]:
    return await upload_service.register_analysis(
        _uid(claims),
        object_key=body.object_key,
        analysis_type=str(body.analysis_type),
        label=body.label,
        lab_date=body.lab_date,
        plan_item_public_id=body.plan_item_public_id,
        idempotency_key=idem,
    )


@router.get("/analyses")
async def list_analyses(claims: PatientClaims, session: AppSession) -> list[dict[str, Any]]:
    return await analysis_service.list_analyses(session, _uid(claims))


@router.get("/analyses/{analysis_id}")
async def get_analysis(
    analysis_id: uuid.UUID, claims: PatientClaims, session: AppSession
) -> dict[str, Any]:
    return await analysis_service.get_analysis(session, _uid(claims), analysis_id)


@router.patch("/analyses/{analysis_id}/ocr-fields/{field_key}")
async def edit_ocr_field(
    analysis_id: uuid.UUID, field_key: str, body: EditOcrFieldIn, claims: PatientClaims
) -> dict[str, Any]:
    return await analysis_service.edit_ocr_field(_uid(claims), analysis_id, field_key, body.value)


@router.post("/documents")
async def register_document(body: RegisterDocumentIn, claims: PatientClaims) -> dict[str, Any]:
    return await document_service.register_document(
        _uid(claims),
        object_key=body.object_key,
        document_type=str(body.document_type),
        label=body.label,
        issuer_name=body.issuer_name,
    )


@router.get("/documents")
async def list_documents(claims: PatientClaims, session: AppSession) -> list[dict[str, Any]]:
    return await document_service.list_documents(session, _uid(claims))


@router.get("/files/{document_id}")
async def get_file(
    document_id: uuid.UUID, claims: PatientClaims, session: AppSession
) -> Response:
    data, media_type = await document_service.read_document_bytes(
        session, _uid(claims), document_id
    )
    return Response(content=data, media_type=media_type)


@router.post("/complaints")
async def add_complaint(body: AddComplaintIn, claims: PatientClaims) -> dict[str, Any]:
    return await complaint_service.add_complaint(
        _uid(claims),
        text=body.text,
        kind=str(body.kind),
        tags=body.tags,
        priority=body.priority,
    )


@router.get("/complaints")
async def list_complaints(claims: PatientClaims, session: AppSession) -> list[dict[str, Any]]:
    return await complaint_service.list_complaints(session, _uid(claims))


@router.patch("/complaints/{complaint_id}")
async def update_complaint(
    complaint_id: uuid.UUID, body: UpdateComplaintIn, claims: PatientClaims
) -> dict[str, Any]:
    return await complaint_service.update_complaint(
        _uid(claims), complaint_id, text=body.text, tags=body.tags, priority=body.priority
    )
