"""arq task: scheduled access-grant expiry (spec §8.2). A failure is a compliance
issue → fail-loud (arq retries → DLQ), never silent (INV-TX-3)."""

from __future__ import annotations

from typing import Any

from app.services import access_service


async def run_access_expiry(ctx: dict[str, Any]) -> dict[str, int]:
    return await access_service.expire_due_grants()
