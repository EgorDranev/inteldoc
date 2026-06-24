"""Patient self-service endpoints (spec §7.4). All require a patient session.

Capability over one's own data comes from the session subject; clinical reads by
others are grant-gated elsewhere. Identity reads go through the resolver (INV-ID-1).
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from app.api.v1.deps import AppSession, IdempotencyKey, PatientClaims
from app.api.v1.schemas.me import (
    BaselinePatchIn,
    ExtendIn,
    IdentityPatchIn,
    MarketingChannelIn,
    PrepCompleteIn,
    ResignIn,
)
from app.core.errors import not_found
from app.db.models.core import ConditionContext, PatientMedicalBaseline
from app.db.resolver import internal_id_for_user, resolve_patient_pii
from app.services import (
    access_service,
    consent_service,
    data_subject_service,
    prep_service,
    profile_service,
)

router = APIRouter(prefix="/me", tags=["patient"])


def _uid(claims: PatientClaims) -> uuid.UUID:
    return uuid.UUID(claims.subject_public_id)


@router.get("")
async def get_me(claims: PatientClaims, session: AppSession) -> dict[str, Any]:
    uid = _uid(claims)
    internal_id = await internal_id_for_user(session, uid)
    if internal_id is None:
        raise not_found("patient not found")
    pii = await resolve_patient_pii(session, internal_id)
    baseline = await session.scalar(
        select(PatientMedicalBaseline).where(
            PatientMedicalBaseline.patient_internal_id == internal_id
        )
    )
    return {
        "identity": None
        if pii is None
        else {
            "name": pii.full_name,
            "dob": pii.birth_date.isoformat(),
            "gender": pii.gender,
            "oms": pii.oms,
        },
        "baseline": None
        if baseline is None
        else {
            "height_cm": float(baseline.height_cm) if baseline.height_cm is not None else None,
            "weight_kg": float(baseline.weight_kg) if baseline.weight_kg is not None else None,
            "chronic_conditions": baseline.chronic_conditions or [],
            "allergies": baseline.allergies or [],
        },
    }


@router.patch("/identity")
async def patch_identity(body: IdentityPatchIn, claims: PatientClaims) -> dict[str, Any]:
    return await profile_service.update_identity(_uid(claims), body.model_dump(exclude_unset=True))


@router.patch("/baseline")
async def patch_baseline(body: BaselinePatchIn, claims: PatientClaims) -> dict[str, Any]:
    return await profile_service.update_baseline(_uid(claims), body.model_dump(exclude_unset=True))


@router.post("/prep/start")
async def start_prep(claims: PatientClaims) -> dict[str, Any]:
    """Mark preparation started → doctor queue label «в процессе»."""
    return await prep_service.start_prep(_uid(claims))


@router.post("/prep/complete")
async def complete_prep(body: PrepCompleteIn, claims: PatientClaims) -> dict[str, Any]:
    """Patient confirms «Подготовка завершена» → doctor queue label «готов»."""
    return await prep_service.complete_prep(_uid(claims), body.time_spent_min)


@router.get("/conditions")
async def list_conditions(claims: PatientClaims, session: AppSession) -> list[dict[str, Any]]:
    internal_id = await internal_id_for_user(session, _uid(claims))
    if internal_id is None:
        return []
    rows = (
        await session.scalars(
            select(ConditionContext)
            .where(
                ConditionContext.patient_internal_id == internal_id,
                ConditionContext.deleted_at.is_(None),
            )
            .order_by(ConditionContext.created_at.asc())
        )
    ).all()
    return [
        {
            "label": c.label,
            "is_confirmed_by_clinic": c.is_confirmed_by_clinic,
            "source": c.source,  # clinic | patient_reported | referral (never ai)
        }
        for c in rows
    ]


@router.get("/access-grants")
async def list_access_grants(claims: PatientClaims, session: AppSession) -> list[dict[str, Any]]:
    return await access_service.list_grants_for_user(session, _uid(claims))


@router.post("/access-grants/{grant_id}/revoke")
async def revoke_grant(
    grant_id: uuid.UUID, claims: PatientClaims, idem: IdempotencyKey
) -> dict[str, Any]:
    return await access_service.revoke_access(grant_id, _uid(claims))


@router.post("/access-grants/{grant_id}/extend")
async def extend_grant(
    grant_id: uuid.UUID, body: ExtendIn, claims: PatientClaims, idem: IdempotencyKey
) -> dict[str, Any]:
    return await access_service.extend_access(grant_id, _uid(claims), body.new_expires_at)


@router.patch("/consents/{consent_type}/withdraw")
async def withdraw_consent(consent_type: str, claims: PatientClaims) -> dict[str, Any]:
    return await consent_service.withdraw_consent(_uid(claims), consent_type)


@router.post("/consents/{consent_type}/resign")
async def resign_consent(
    consent_type: str, body: ResignIn, claims: PatientClaims
) -> dict[str, Any]:
    return await consent_service.resign_consent(_uid(claims), consent_type, body.new_version)


@router.patch("/consents/marketing/channels")
async def marketing_channels(body: MarketingChannelIn, claims: PatientClaims) -> dict[str, Any]:
    return await consent_service.set_marketing_channel(_uid(claims), body.channel, body.on)


@router.get("/export")
async def export_me(claims: PatientClaims, session: AppSession) -> dict[str, Any]:
    return await data_subject_service.export_me(session, _uid(claims))


@router.delete("", status_code=200)
async def delete_me(claims: PatientClaims) -> dict[str, Any]:
    return await data_subject_service.delete_me(_uid(claims))
