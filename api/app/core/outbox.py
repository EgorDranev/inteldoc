"""Transactional outbox enqueue (spec §8.1). Called from within a service
transaction so the outbox row commits atomically with the mutation — no
side-effect fires before commit (INV-RV-3). The arq ``outbox_dispatcher`` picks
up ``pending`` rows after commit.

Payloads carry opaque ids + scope keys only — never PII/medical (INV-AU-2/RES-2).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.access import OutboxEvent
from app.domain.enums import OutboxEventType


async def enqueue(
    session: AsyncSession,
    *,
    partner_id: uuid.UUID,
    event_type: OutboxEventType,
    payload: dict[str, Any],
    trace_id: uuid.UUID | None = None,
) -> OutboxEvent:
    row = OutboxEvent(
        partner_id=partner_id,
        event_type=str(event_type),
        payload_json=payload,
        status="pending",
        trace_id=trace_id,
    )
    session.add(row)
    return row
