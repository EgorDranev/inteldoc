"""Patient OTP (ENG-09): provider seam + code store + orchestration.

Public API:
  - ``request_patient_otp(phone, scope)``  → issue + deliver a code (no-op on mock)
  - ``verify_patient_otp(phone, code, scope)`` → True iff the code is valid
  - ``get_otp_provider()``

Dev / demo (``OTP_PROVIDER=mock``): no code is issued; the fixed dev code is
accepted. Production (a real provider): a random code is issued, delivered, and
checked against the Redis store — «0000» is rejected and arbitrary-patient
impersonation is closed. The provider id is the only thing that changes.
"""

from __future__ import annotations

from app.core.config import get_settings
from app.infra.otp.code_store import OtpThrottledError, check, issue
from app.infra.otp.providers import OtpProvider, get_otp_provider

__all__ = [
    "OtpProvider",
    "OtpThrottledError",
    "get_otp_provider",
    "request_patient_otp",
    "verify_patient_otp",
]


async def request_patient_otp(phone_e164: str, *, scope: str = "login") -> None:
    settings = get_settings()
    provider = get_otp_provider()
    if settings.dev_otp_enabled:
        # Mock posture: nothing to issue or store — the fixed dev code is accepted.
        await provider.send(phone_e164, settings.dev_otp_code)
        return
    code = await issue(phone_e164, scope=scope)
    await provider.send(phone_e164, code)


async def verify_patient_otp(phone_e164: str, code: str, *, scope: str = "login") -> bool:
    settings = get_settings()
    if settings.dev_otp_enabled:
        return code == settings.dev_otp_code
    return await check(phone_e164, code, scope=scope)
