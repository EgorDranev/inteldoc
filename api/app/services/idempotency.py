"""Idempotency-Key handling (spec §8.3). Used inside a service transaction.

Replay of the same (partner, endpoint, key) returns the stored response without
re-doing the work (INV-TX-1). The UNIQUE(partner_id, endpoint, key) constraint is
the backstop against a concurrent double-create.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.access import IdempotencyKey
from app.domain.enums import IdempotencyStatus


def request_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


async def find_completed(
    session: AsyncSession, *, partner_id: uuid.UUID, endpoint: str, key: str
) -> dict[str, Any] | None:
    row = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.partner_id == partner_id,
            IdempotencyKey.endpoint == endpoint,
            IdempotencyKey.key == key,
        )
    )
    if row is not None and row.status == str(IdempotencyStatus.COMPLETED):
        return row.response_json
    return None


async def record(
    session: AsyncSession,
    *,
    partner_id: uuid.UUID,
    endpoint: str,
    key: str,
    req_hash: str,
    response: dict[str, Any],
) -> None:
    session.add(
        IdempotencyKey(
            partner_id=partner_id,
            endpoint=endpoint,
            key=key,
            request_hash=req_hash,
            status=str(IdempotencyStatus.COMPLETED),
            response_json=response,
        )
    )
