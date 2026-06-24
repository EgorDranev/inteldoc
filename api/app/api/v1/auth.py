"""Auth endpoints (spec §7.2). Capability is never minted here — only session.

POST /auth/patient/otp/request · /verify   — patient phone + OTP (mock «0000» in dev;
                                              real provider issues/verifies in prod, ENG-09)
POST /auth/web/login · /auth/logout         — doctor/admin username+password
POST /auth/refresh                          — rotate the refresh chain
GET  /auth/session                          — echo current claims (auth round-trip)
"""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.api.v1.deps import Claims
from app.api.v1.schemas.auth import (
    LogoutIn,
    OtpRequestIn,
    OtpVerifyIn,
    RefreshIn,
    SessionOut,
    TokenOut,
    WebLoginIn,
)
from app.core.config import get_settings
from app.core.errors import too_many_requests, unauthorized
from app.domain.identity import InvalidPhoneError
from app.infra.otp import OtpThrottledError
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_token_out(pair: auth_service.TokenPair) -> TokenOut:
    return TokenOut(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
        role=pair.role,
        subject_public_id=pair.subject_public_id,
    )


@router.post("/patient/otp/request", status_code=status.HTTP_204_NO_CONTENT)
async def patient_otp_request(body: OtpRequestIn) -> Response:
    try:
        await auth_service.request_patient_otp(body.phone)
    except InvalidPhoneError as exc:
        raise unauthorized("invalid phone") from exc
    except OtpThrottledError as exc:
        raise too_many_requests(
            "code already sent — try again shortly",
            retry_after=get_settings().otp_resend_cooldown_seconds,
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/patient/otp/verify")
async def patient_otp_verify(body: OtpVerifyIn) -> TokenOut:
    try:
        pair = await auth_service.verify_patient_otp(body.phone, body.code)
    except InvalidPhoneError as exc:
        raise unauthorized("invalid phone") from exc
    if pair is None:
        raise unauthorized("invalid code or onboarding required")
    return _to_token_out(pair)


@router.post("/web/login")
async def web_login(body: WebLoginIn) -> TokenOut:
    pair = await auth_service.web_login(body.username, body.password)
    if pair is None:
        raise unauthorized("invalid credentials")
    return _to_token_out(pair)


@router.post("/refresh")
async def refresh(body: RefreshIn) -> TokenOut:
    pair = await auth_service.refresh_session(body.refresh_token)
    if pair is None:
        raise unauthorized("invalid or expired refresh token")
    return _to_token_out(pair)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutIn) -> Response:
    await auth_service.logout(body.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/session")
async def session(claims: Claims) -> SessionOut:
    return SessionOut(
        subject_public_id=claims.subject_public_id,
        role=claims.role,
        partner_id=claims.partner_id,
        clinic_id=claims.actor_clinic_id,
    )
