"""Complaint service (spec §5.3). Free text + tags + priority. ``PatientQuestion``
is folded in via ``kind`` (complaint | question). Non-diagnostic tags only.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found
from app.db.models.clinical import Complaint
from app.db.resolver import internal_id_for_user
from app.services.uow import transaction


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def _view(c: Complaint) -> dict[str, Any]:
    return {
        "public_id": str(c.public_id),
        "kind": c.kind,
        "text": c.text,
        "tags": c.tags or [],
        "priority": c.priority,
        "created_at": c.created_at.isoformat(),
        "edited_at": c.edited_at.isoformat() if c.edited_at else None,
    }


async def list_complaints(s: AsyncSession, user_public_id: uuid.UUID) -> list[dict[str, Any]]:
    internal_id = await internal_id_for_user(s, user_public_id)
    if internal_id is None:
        return []
    rows = (
        await s.scalars(
            select(Complaint)
            .where(Complaint.patient_internal_id == internal_id, Complaint.deleted_at.is_(None))
            .order_by(Complaint.priority.nulls_last(), Complaint.created_at.desc())
        )
    ).all()
    return [_view(c) for c in rows]


async def add_complaint(
    user_public_id: uuid.UUID,
    *,
    text: str,
    kind: str = "complaint",
    tags: list[str] | None = None,
    priority: int | None = None,
) -> dict[str, Any]:
    async with transaction() as uow:
        s = uow.session
        internal_id = await internal_id_for_user(s, user_public_id)
        if internal_id is None:
            raise not_found("patient not found")
        from app.db.models.core import Patient

        patient = await s.get(Patient, internal_id)
        if patient is None:
            raise not_found("patient not found")
        complaint = Complaint(
            partner_id=patient.partner_id,
            patient_internal_id=internal_id,
            kind=kind,
            text=text,
            tags=tags,
            priority=priority,
        )
        s.add(complaint)
        await s.flush()
        return _view(complaint)


async def update_complaint(
    user_public_id: uuid.UUID,
    complaint_public_id: uuid.UUID,
    *,
    text: str | None = None,
    tags: list[str] | None = None,
    priority: int | None = None,
) -> dict[str, Any]:
    async with transaction() as uow:
        s = uow.session
        internal_id = await internal_id_for_user(s, user_public_id)
        complaint = await s.scalar(
            select(Complaint).where(
                Complaint.public_id == complaint_public_id,
                Complaint.patient_internal_id == internal_id,
            )
        )
        if complaint is None:
            raise not_found("complaint not found")
        if text is not None:
            complaint.text = text
        if tags is not None:
            complaint.tags = tags
        if priority is not None:
            complaint.priority = priority
        complaint.edited_at = _now()
        return _view(complaint)
