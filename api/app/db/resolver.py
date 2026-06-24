"""Resolver seam (spec §6.1) — the ONLY code path that reads PII.

Two guarded functions: ``public_id → internal_id`` and ``internal_id → patient_pii``.
No router, worker, or aggregate query touches ``patient_pii`` except through here
(INV-ID-1/3/4). Keeping this the single seam is what makes "deny SELECT on
patient_pii ⇒ PII-blind" a code-auditable claim.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.core import Patient, UserAccount
from app.db.models.identity import PatientPii


async def resolve_public_id(session: AsyncSession, public_id: uuid.UUID) -> uuid.UUID | None:
    """Map an API ``public_id`` to the internal clinical key. Reads no PII."""
    stmt = select(Patient.internal_id).where(
        Patient.public_id == public_id, Patient.deleted_at.is_(None)
    )
    result: uuid.UUID | None = await session.scalar(stmt)
    return result


async def resolve_patient_pii(session: AsyncSession, internal_id: uuid.UUID) -> PatientPii | None:
    """Load the PII row for an internal id. The only sanctioned PII read."""
    stmt = select(PatientPii).where(
        PatientPii.internal_id == internal_id, PatientPii.deleted_at.is_(None)
    )
    result: PatientPii | None = await session.scalar(stmt)
    return result


async def internal_id_for_user(
    session: AsyncSession, user_public_id: uuid.UUID
) -> uuid.UUID | None:
    """Resolve a patient ``user_account.public_id`` to their patient ``internal_id``."""
    stmt = select(UserAccount.patient_internal_id).where(
        UserAccount.public_id == user_public_id, UserAccount.deleted_at.is_(None)
    )
    result: uuid.UUID | None = await session.scalar(stmt)
    return result
