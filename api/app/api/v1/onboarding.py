"""Onboarding endpoints (spec §7.3).

GET  /onboarding/partner-context     — resolve Эндокор partner + department by QR/link
PUT  /onboarding/account-draft       — stateless normalize/echo of the draft
POST /onboarding/commit              — atomic onboarding-commit (Idempotency-Key)
POST /onboarding/sms-otp/request|verify — mock special-category SMS confirmation
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.api.v1.deps import AppSession, IdempotencyKey
from app.api.v1.schemas.onboarding import (
    AccountDraftIn,
    CommitIn,
    CommitOut,
    PartnerContextOut,
)
from app.core.errors import not_found, unauthorized
from app.db.models.core import Department, Partner
from app.domain.identity import InvalidPhoneError, normalize_phone_e164
from app.domain.onboarding_plan import ConsentInput, OnboardingValidationError
from app.infra import otp
from app.services import onboarding_service

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/partner-context", response_model=PartnerContextOut)
async def partner_context(
    session: AppSession, code: str = Query(default="endokor")
) -> PartnerContextOut:
    # Single pilot partner (Эндокор); `code` is the QR/link token placeholder.
    partner = await session.scalar(select(Partner).where(Partner.short_name == "Эндокор"))
    if partner is None:
        raise not_found("partner not found (run seed)")
    dept = await session.scalar(
        select(Department).where(Department.partner_id == partner.internal_id)
    )
    if dept is None:
        raise not_found("department not found (run seed)")
    return PartnerContextOut(
        partner_public_id=partner.public_id,
        partner_name=partner.name,
        partner_short_name=partner.short_name,
        department_public_id=dept.public_id,
        department_name=dept.name,
    )


@router.put("/account-draft")
async def account_draft(body: AccountDraftIn) -> dict[str, str | None]:
    try:
        phone = normalize_phone_e164(body.phone)
    except InvalidPhoneError as exc:
        raise unauthorized("invalid phone") from exc
    return {"name": body.name, "dob": body.dob, "gender": body.gender, "phone_e164": phone}


@router.post("/commit", response_model=CommitOut)
async def commit(body: CommitIn, idem_key: IdempotencyKey) -> CommitOut:
    data = onboarding_service.CommitData(
        department_public_id=body.department_public_id,
        full_name=body.name,
        birth_date=body.dob,
        gender=body.gender,
        phone=body.phone,
        email=body.email,
        oms=body.oms,
        snils=body.snils,
        consents=[
            ConsentInput(
                consent_type=c.consent_type,
                legal_text_version=c.legal_text_version,
                ack_mechanism=c.ack_mechanism,
                accepted=c.accepted,
                channels=c.channels,
                sms_confirmed=c.sms_confirmed,
            )
            for c in body.consents
        ],
        document_hash=body.document_hash,
    )
    try:
        result = await onboarding_service.commit_onboarding(data, idem_key)
    except (OnboardingValidationError, InvalidPhoneError) as exc:
        raise unauthorized(str(exc)) from exc
    return CommitOut(**result)


@router.post("/sms-otp/request", status_code=status.HTTP_204_NO_CONTENT)
async def sms_otp_request(body: dict[str, str]) -> Response:
    # Special-category-consent confirmation channel (scope="consent"), kept
    # separate from the login OTP keyspace. Mock provider sends nothing.
    await otp.request_patient_otp(body.get("phone", ""), scope="consent")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sms-otp/verify")
async def sms_otp_verify(body: dict[str, str]) -> dict[str, bool]:
    verified = await otp.verify_patient_otp(
        body.get("phone", ""), body.get("code", ""), scope="consent"
    )
    return {"verified": verified}
