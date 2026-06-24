"""Onboarding commit (spec §5.1, INV-TX-1). One atomic transaction creates:
patient_pii + patient + user_account + consent_bundle + consent_records +
acceptance_record + access_grant + audit events + outbox invalidation.

- Idempotent by ``Idempotency-Key`` (replay returns the stored response).
- Phone-dedup (Q4): ``UNIQUE(partner_id, phone_e164)`` — a QR re-scan resolves to
  the existing patient instead of forking history.
- ``partner_id`` round-trips onto every row (INV-TX-2).
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import not_found
from app.core.outbox import enqueue
from app.db.models.access import (
    AcceptanceRecord,
    AccessGrant,
    ConsentBundle,
    ConsentRecord,
)
from app.db.models.core import Department, Patient, UserAccount
from app.db.models.identity import PatientPii
from app.domain.enums import (
    ActorRole,
    AuditEventType,
    GrantedToType,
    OutboxEventType,
    UserRole,
)
from app.domain.grant_status import GrantFacts, effective_status
from app.domain.onboarding_plan import ConsentInput, normalize_onboarding
from app.services import idempotency
from app.services.uow import transaction

_ENDPOINT = "onboarding.commit"


@dataclass(frozen=True, slots=True)
class CommitData:
    department_public_id: uuid.UUID
    full_name: str
    birth_date: str
    gender: str
    phone: str
    email: str | None
    oms: str | None
    snils: str | None
    consents: list[ConsentInput]
    document_hash: str


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def _grant_view(grant: AccessGrant, now: dt.datetime) -> dict[str, Any]:
    facts = GrantFacts(
        valid_from=grant.valid_from,
        expires_at=grant.expires_at,
        revoked_at=grant.revoked_at,
        is_suspended=grant.is_suspended,
    )
    return {
        "public_id": str(grant.public_id),
        "granted_to_type": grant.granted_to_type,
        "data_scope": grant.data_scope,
        "valid_from": grant.valid_from.isoformat(),
        "expires_at": grant.expires_at.isoformat() if grant.expires_at else None,
        "status": str(effective_status(facts, now)),
    }


async def _active_grant_for_patient(
    session: AsyncSession, patient_internal_id: uuid.UUID
) -> AccessGrant | None:
    grant: AccessGrant | None = await session.scalar(
        select(AccessGrant)
        .where(
            AccessGrant.patient_internal_id == patient_internal_id,
            AccessGrant.revoked_at.is_(None),
        )
        .order_by(AccessGrant.created_at.desc())
    )
    return grant


async def commit_onboarding(data: CommitData, idempotency_key: str) -> dict[str, Any]:
    norm = normalize_onboarding(
        full_name=data.full_name,
        birth_date=data.birth_date,
        gender=data.gender,
        phone=data.phone,
        email=data.email,
        oms=data.oms,
        snils=data.snils,
        consents=data.consents,
    )
    now = _now()

    async with transaction() as uow:
        s = uow.session
        dept = await s.scalar(
            select(Department).where(
                Department.public_id == data.department_public_id,
                Department.deleted_at.is_(None),
            )
        )
        if dept is None:
            raise not_found("unknown department")
        partner_id = dept.partner_id
        clinic_id = dept.clinic_id

        # Idempotency replay
        replay = await idempotency.find_completed(
            s, partner_id=partner_id, endpoint=_ENDPOINT, key=idempotency_key
        )
        if replay is not None:
            return replay

        # Phone dedup (Q4): re-scan resolves to existing patient
        existing = await s.scalar(
            select(PatientPii).where(
                PatientPii.partner_id == partner_id,
                PatientPii.phone_e164 == norm.phone_e164,
                PatientPii.deleted_at.is_(None),
            )
        )
        if existing is not None:
            patient = await s.get(Patient, existing.internal_id)
            grant = await _active_grant_for_patient(s, existing.internal_id)
            result = {
                "patient_public_id": str(patient.public_id) if patient else None,
                "grant": _grant_view(grant, now) if grant else None,
                "deduplicated": True,
            }
            return result

        # --- fresh onboarding: one atomic write-set ---
        internal_id = uuid.uuid4()
        pii = PatientPii(
            internal_id=internal_id,
            partner_id=partner_id,
            full_name=norm.full_name,
            birth_date=dt.date.fromisoformat(norm.birth_date),
            gender=norm.gender,
            phone_e164=norm.phone_e164,
            email=norm.email,
            oms=norm.oms,
            snils=norm.snils,
        )
        patient = Patient(
            internal_id=internal_id,
            partner_id=partner_id,
            clinic_id=clinic_id,
            department_id=dept.internal_id,
            identity_verified_at=None,
        )
        account = UserAccount(
            partner_id=partner_id,
            role=str(UserRole.PATIENT),
            patient_internal_id=internal_id,
            phone_e164=norm.phone_e164,
        )
        # Ordered flush: patient_pii → patient (cross-schema FK, no ORM relationship)
        # → user_account (FK to patient).
        s.add(pii)
        await s.flush()
        s.add(patient)
        await s.flush()
        s.add(account)

        bundle = ConsentBundle(
            partner_id=partner_id,
            patient_internal_id=internal_id,
            captured_at=now,
        )
        s.add(bundle)
        await s.flush()
        for c in norm.consents:
            s.add(
                ConsentRecord(
                    consent_bundle_id=bundle.internal_id,
                    partner_id=partner_id,
                    consent_type=str(c.consent_type),
                    legal_text_version=c.legal_text_version,
                    accepted=c.accepted,
                    ack_mechanism=str(c.ack_mechanism),
                    channels=c.channels,
                    sms_confirmed=c.sms_confirmed,
                    sms_confirmed_at=now if c.sms_confirmed else None,
                )
            )

        grant = AccessGrant(
            partner_id=partner_id,
            patient_internal_id=internal_id,
            granted_to_type=str(GrantedToType.CLINIC),
            granted_to_id=clinic_id,
            data_scope="analyses_prep",
            valid_from=now,
            expires_at=None,  # indefinite-until-revoke (Q3)
            created_by_type="patient",
        )
        s.add(grant)
        await s.flush()

        s.add(
            AcceptanceRecord(
                partner_id=partner_id,
                patient_internal_id=internal_id,
                document_hash=data.document_hash,
                acceptance_method="mock_no_otp",  # honest mock (INV-CO-6)
                signed_at=now,
                recipient_clinic_id=clinic_id,
                consent_bundle_id=bundle.internal_id,
                access_grant_id=grant.internal_id,
            )
        )

        # Audit (same txn) — subject = patient internal id (HMAC pseudonym)
        await emit_audit(
            s, partner_id=partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.ONBOARDING_COMMITTED, subject_internal_id=internal_id,
        )
        await emit_audit(
            s, partner_id=partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.CONSENT_RECORDED, subject_internal_id=internal_id,
            metadata={"consent_count": len(norm.consents)},
        )
        await emit_audit(
            s, partner_id=partner_id, actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.ACCESS_GRANTED, subject_internal_id=internal_id,
            target_type="access_grant", target_id=grant.internal_id,
        )
        # Side-effect after commit: refresh the doctor queue projection
        await enqueue(
            s, partner_id=partner_id, event_type=OutboxEventType.INVALIDATE_DOCTOR_QUEUE,
            payload={"clinic_id": str(clinic_id)},
        )

        result = {
            "patient_public_id": str(patient.public_id),
            "grant": _grant_view(grant, now),
            "deduplicated": False,
        }
        req_hash = idempotency.request_hash({"key": idempotency_key, "phone": norm.phone_e164})
        await idempotency.record(
            s, partner_id=partner_id, endpoint=_ENDPOINT, key=idempotency_key,
            req_hash=req_hash, response=result,
        )
        return result
