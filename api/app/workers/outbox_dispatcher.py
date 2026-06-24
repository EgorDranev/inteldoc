"""arq task: drain the transactional outbox (spec §8.2). Thin wrapper — the work
(and the only DB writes) live in the service. Workers never own a transaction."""

from __future__ import annotations

from typing import Any

from app.services import outbox_service


async def dispatch_outbox(ctx: dict[str, Any]) -> dict[str, int]:
    return await outbox_service.dispatch_pending()
