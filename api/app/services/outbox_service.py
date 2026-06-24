"""Outbox dispatch (spec §8.1, §8.4). Drains ``pending`` rows after commit.

The arq ``outbox_dispatcher`` worker calls this (workers never write the DB
directly — the one rule). Side-effect handlers are no-ops/logs in the pilot
(no real notification transport yet); the state machine + DLQ discipline is real
so handlers slot in without rework. Fail-loud: exhausted retries → dead_letter
(INV-TX-3).
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.access import OutboxEvent
from app.db.models.support import TicketRouting
from app.domain.enums import OutboxEventType, OutboxStatus, TicketDeliveryStatus
from app.services.uow import transaction

logger = get_logger("outbox")

MAX_ATTEMPTS = 5
_BACKOFF_BASE_SECONDS = 5


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def _dispatch_ticket_routing(s: AsyncSession, event: OutboxEvent, now: dt.datetime) -> None:
    """Mark a ticket's per-destination routing delivered (INV-SR-1). Pilot has no real
    transport, so 'delivery' = state transition + audit-able timestamp; the DLQ
    discipline below makes a dropped safety route loud, never silent."""
    routing_id = (event.payload_json or {}).get("routing_id")
    if routing_id is None:
        # A routing event with no target is corruption, not a no-op — fail loud so it
        # retries → dead-letters, never silently swallowing a (possibly safety) route.
        raise RuntimeError("dispatch_ticket_routing: event missing routing_id")
    routing = await s.scalar(
        select(TicketRouting).where(TicketRouting.public_id == uuid.UUID(routing_id))
    )
    if routing is None:
        raise RuntimeError(f"dispatch_ticket_routing: routing not found ({routing_id})")
    routing.delivery_status = str(TicketDeliveryStatus.DELIVERED)
    routing.dispatched_at = now


async def _handle(s: AsyncSession, event: OutboxEvent, now: dt.datetime) -> None:
    # Pilot: most side-effects (cache invalidation / notification) are logged no-ops.
    # Ticket routing has a real state transition so per-destination delivery is visible.
    if event.event_type == str(OutboxEventType.DISPATCH_TICKET_ROUTING):
        await _dispatch_ticket_routing(s, event, now)
    logger.info("outbox_dispatch", event_type=event.event_type, id=str(event.internal_id))


async def dispatch_pending(limit: int = 50) -> dict[str, int]:
    now = _now()
    done = 0
    dead = 0
    async with transaction() as uow:
        s = uow.session
        rows = (
            await s.scalars(
                select(OutboxEvent)
                .where(
                    OutboxEvent.status == str(OutboxStatus.PENDING),
                    OutboxEvent.available_at <= now,
                )
                .order_by(OutboxEvent.available_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).all()
        for ev in rows:
            ev.attempt_count += 1
            try:
                await _handle(s, ev, now)
                ev.status = str(OutboxStatus.DONE)
                ev.dispatched_at = now
                done += 1
            except Exception as exc:
                ev.last_error = type(exc).__name__
                if ev.attempt_count >= MAX_ATTEMPTS:
                    ev.status = str(OutboxStatus.DEAD_LETTER)
                    dead += 1
                    logger.error("outbox_dead_letter", id=str(ev.internal_id))
                else:
                    ev.available_at = now + dt.timedelta(
                        seconds=_BACKOFF_BASE_SECONDS * ev.attempt_count
                    )
    return {"done": done, "dead_letter": dead, "scanned": len(rows)}
