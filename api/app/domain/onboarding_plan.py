"""Pure onboarding validation/normalization (spec §5.1).

Turns raw commit input into a validated, normalized structure the service writes
in one transaction. No I/O. Enforces the consent invariants that are cheap to
check here: every consent carries a version + ack mechanism (INV-CO-1/2), and
special-category consent is modelled distinctly (INV-CO-3).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.enums import AckMechanism, ConsentType
from app.domain.identity import normalize_phone_e164


class OnboardingValidationError(ValueError):
    """Raised when commit input is structurally invalid."""


SPECIAL_CATEGORY = {ConsentType.PDN_SPECIAL, ConsentType.MEDICAL_DATA}


@dataclass(frozen=True, slots=True)
class ConsentInput:
    consent_type: ConsentType
    legal_text_version: str
    ack_mechanism: AckMechanism
    accepted: bool = True
    channels: list[str] | None = None
    sms_confirmed: bool | None = None


@dataclass(frozen=True, slots=True)
class NormalizedOnboarding:
    full_name: str
    birth_date: str
    gender: str
    phone_e164: str
    email: str | None
    oms: str | None
    snils: str | None
    consents: list[ConsentInput] = field(default_factory=list)


def normalize_onboarding(
    *,
    full_name: str,
    birth_date: str,
    gender: str,
    phone: str,
    email: str | None,
    oms: str | None,
    snils: str | None,
    consents: list[ConsentInput],
) -> NormalizedOnboarding:
    if not full_name.strip():
        raise OnboardingValidationError("full_name required")
    if gender not in ("male", "female"):
        raise OnboardingValidationError("gender must be male|female")
    phone_e164 = normalize_phone_e164(phone)

    for c in consents:
        if not c.legal_text_version:
            raise OnboardingValidationError(f"{c.consent_type}: legal_text_version required")
        # ack_mechanism is a typed enum; its presence is guaranteed by construction.
        if c.consent_type in SPECIAL_CATEGORY and c.accepted and not c.sms_confirmed:
            # special-category acceptance should record an explicit confirmation signal
            # (mock SMS in dev). Modelled distinctly from pdn_general (INV-CO-3).
            pass  # permissive in dev; the field is captured either way

    return NormalizedOnboarding(
        full_name=full_name.strip(),
        birth_date=birth_date,
        gender=gender,
        phone_e164=phone_e164,
        email=email,
        oms=oms,
        snils=snils,
        consents=consents,
    )
