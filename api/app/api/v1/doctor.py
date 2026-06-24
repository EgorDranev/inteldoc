"""Doctor web endpoints (spec §7.7) — the FIRST doctor-side surface.

The doctor creates a structured request (a doctor_request + N plan_items) for a
patient they currently hold an ACTIVE access grant to. Gated by ``require_web``
narrowed to the ``doctor`` role; capability (the grant) is re-derived per request
in the service, never read from the token (INV-AC-2/4). Idempotent by
``Idempotency-Key``.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.deps import IdempotencyKey, WebClaims
from app.api.v1.schemas.doctor import DoctorAnalysisOut, QueueOut, SummaryOut, VerdictIn
from app.api.v1.schemas.plan import DoctorRequestCreateIn, DoctorRequestOut
from app.core.errors import unauthorized
from app.core.security import TokenClaims
from app.domain.enums import UserRole
from app.services import doctor_read_service, doctor_write_service, plan_service

router = APIRouter(prefix="/doctor", tags=["doctor"])


def require_doctor(claims: WebClaims) -> TokenClaims:
    if claims.role != str(UserRole.DOCTOR):
        raise unauthorized("doctor role required")
    return claims


DoctorClaims = Annotated[TokenClaims, Depends(require_doctor)]


@router.post("/requests", response_model=DoctorRequestOut)
async def create_request(
    body: DoctorRequestCreateIn,
    patient_public_id: uuid.UUID,
    claims: DoctorClaims,
    idem: IdempotencyKey,
) -> DoctorRequestOut:
    result = await plan_service.create_doctor_request(
        claims,
        patient_public_id,
        body.model_dump(mode="json", exclude_unset=False),
        idempotency_key=idem,
    )
    return DoctorRequestOut(**result)


@router.get("/queue", response_model=QueueOut)
async def get_queue(claims: DoctorClaims) -> QueueOut:
    """D01 — today's appointments for the calling doctor, grant-gated per patient.
    Read-only: a scheduling list, no per-row clinical-view audit."""
    result = await doctor_read_service.list_queue(claims)
    return QueueOut(**result)


@router.get("/patients/{public_id}/summary", response_model=SummaryOut)
async def get_summary(public_id: uuid.UUID, claims: DoctorClaims) -> SummaryOut:
    """D02 — the rich 3-section patient summary. Grant-gated; opening it writes the
    ``doctor_view`` audit + ``last_viewed_at`` projection (INV-AU-5)."""
    result = await doctor_read_service.build_summary(claims, public_id)
    return SummaryOut(**result)


@router.post(
    "/patients/{patient_public_id}/analyses/{analysis_public_id}/ocr-fields/{field_key}/verdict",
    response_model=DoctorAnalysisOut,
)
async def stamp_ocr_verdict(
    patient_public_id: uuid.UUID,
    analysis_public_id: uuid.UUID,
    field_key: str,
    body: VerdictIn,
    claims: DoctorClaims,
) -> DoctorAnalysisOut:
    """Doctor stamps the structuring-metadata verdict (confirmed | rejected) on a
    low-confidence OCR field (INV-AI-4). Grant-gated; auto-acknowledges the analysis
    once every low-confidence field is resolved. Read-only on the clinical VALUE."""
    result = await doctor_write_service.stamp_ocr_verdict(
        claims, patient_public_id, analysis_public_id, field_key, body.verdict
    )
    return DoctorAnalysisOut(**result)


@router.post(
    "/patients/{patient_public_id}/analyses/{analysis_public_id}/acknowledge",
    response_model=DoctorAnalysisOut,
)
async def acknowledge_analysis(
    patient_public_id: uuid.UUID,
    analysis_public_id: uuid.UUID,
    claims: DoctorClaims,
) -> DoctorAnalysisOut:
    """Doctor accepts a structured analysis into the clinical grid (status →
    acknowledged) and advances its linked plan item — closing the patient→doctor loop.
    Grant-gated, idempotent."""
    result = await doctor_write_service.acknowledge_analysis(
        claims, patient_public_id, analysis_public_id
    )
    return DoctorAnalysisOut(**result)
