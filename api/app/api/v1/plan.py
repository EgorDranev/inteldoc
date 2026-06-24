"""Patient-facing plan endpoints (spec §7.6). The patient reads their own plan
(doctor requests + plan items) and marks a request as seen. All require a patient
session; scope is the caller's own internal id (INV-AC-5)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.v1.deps import AppSession, PatientClaims
from app.api.v1.schemas.plan import DoctorRequestOut, PlanOut
from app.services import plan_service

router = APIRouter(prefix="/plan", tags=["plan"])


def _uid(claims: PatientClaims) -> uuid.UUID:
    return uuid.UUID(claims.subject_public_id)


@router.get("", response_model=PlanOut)
async def get_plan(claims: PatientClaims, session: AppSession) -> PlanOut:
    return PlanOut(**await plan_service.list_plan_for_patient(session, _uid(claims)))


@router.post("/requests/{public_id}/seen", response_model=DoctorRequestOut)
async def mark_seen(public_id: uuid.UUID, claims: PatientClaims) -> DoctorRequestOut:
    return DoctorRequestOut(**await plan_service.mark_request_seen(_uid(claims), public_id))
