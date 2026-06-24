"""Support / integrity ticket service (spec §5.6, §7.8, Slice E) — transaction owner.

One atomic create: ``support_ticket`` + N ``ticket_routing`` rows + audit + one
outbox row per routing (INV-SR-1). Integrity/safety categories fan out to two
destinations (IntelDoc-security + Эндокор), tech-only to one (IntelDoc). The patient
confirmation always carries «куда ушло» (named destinations) + «когда ждать» (SLA),
both mandatory (INV-SR-2). ``suspicious_activity`` additionally emits a
``suspicious_activity_reported`` audit (INV-SR-3). Idempotent by ``Idempotency-Key``.

Read-side ``get_ticket`` is patient-scoped and exposes per-destination
``delivery_status`` so the patient can see the safety route didn't silently drop.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import emit_audit
from app.core.errors import bad_request, not_found
from app.core.outbox import enqueue
from app.core.security import TokenClaims
from app.db.models.support import SupportTicket, TicketRouting
from app.db.resolver import internal_id_for_user
from app.domain.enums import (
    ActorRole,
    AuditEventType,
    OutboxEventType,
    SupportCategory,
    SupportTicketStatus,
)
from app.domain.support_routing import describe, is_integrity, route_for
from app.services import idempotency
from app.services.uow import transaction

_ENDPOINT = "POST /support/tickets"


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def _routing_view(routing: TicketRouting) -> dict[str, Any]:
    meta = describe(routing.destination)
    return {
        "destination": routing.destination,
        "label": meta.label if meta else routing.destination,
        "sla_hours": routing.sla_hours,
        "sla_label": meta.sla_label if meta else "",
        "delivery_status": routing.delivery_status,
    }


def _ticket_view(ticket: SupportTicket, routings: list[TicketRouting]) -> dict[str, Any]:
    return {
        "public_id": str(ticket.public_id),
        "category": ticket.category,
        "is_integrity_report": ticket.is_integrity_report,
        "status": ticket.status,
        "created_at": ticket.created_at.isoformat(),
        # «Куда ушло» + «когда ждать» — both always present (INV-SR-2).
        "destinations": [_routing_view(r) for r in routings],
    }


async def create_ticket(
    claims: TokenClaims, data: dict[str, Any], *, idempotency_key: str
) -> dict[str, Any]:
    partner_id = uuid.UUID(claims.partner_id)
    try:
        category = SupportCategory(data["category"])
    except ValueError as exc:
        raise bad_request("unknown support category") from exc

    async with transaction() as uow:
        s = uow.session
        replay = await idempotency.find_completed(
            s, partner_id=partner_id, endpoint=_ENDPOINT, key=idempotency_key
        )
        if replay is not None:
            return replay

        internal_id = await internal_id_for_user(s, uuid.UUID(claims.subject_public_id))
        if internal_id is None:
            raise not_found("patient not found")

        integrity = is_integrity(category)
        ticket = SupportTicket(
            partner_id=partner_id,
            patient_internal_id=internal_id,
            category=str(category),
            is_integrity_report=integrity,
            subject_ref=data.get("subject_ref"),
            body=data.get("body"),
            status=str(SupportTicketStatus.ROUTED),
        )
        s.add(ticket)
        await s.flush()

        destinations = route_for(category)
        routings: list[TicketRouting] = []
        for d in destinations:
            routing = TicketRouting(
                partner_id=partner_id,
                ticket_id=ticket.internal_id,
                patient_internal_id=internal_id,
                destination=str(d.destination),
                sla_hours=d.sla_hours,
                delivery_status="pending",
            )
            s.add(routing)
            await s.flush()
            routings.append(routing)
            # Each routing dispatches independently — a dropped safety route
            # dead-letters on its own, never hidden by a sibling success (INV-SR-1).
            await enqueue(
                s,
                partner_id=partner_id,
                event_type=OutboxEventType.DISPATCH_TICKET_ROUTING,
                payload={
                    "routing_id": str(routing.public_id),
                    "ticket_id": str(ticket.public_id),
                    "destination": str(d.destination),
                },
            )

        # Audit is PII/medical-free — category + destination count, never the body.
        await emit_audit(
            s,
            partner_id=partner_id,
            actor_role=ActorRole.PATIENT,
            event_type=AuditEventType.SUPPORT_TICKET_CREATED,
            subject_internal_id=internal_id,
            target_type="support_ticket",
            target_id=ticket.internal_id,
            metadata={
                "category": str(category),
                "is_integrity": integrity,
                "destination_count": len(destinations),
            },
        )
        if category is SupportCategory.SUSPICIOUS_ACTIVITY:
            # Suspicious-activity → its own audit + IntelDoc-security route (INV-SR-3).
            await emit_audit(
                s,
                partner_id=partner_id,
                actor_role=ActorRole.PATIENT,
                event_type=AuditEventType.SUSPICIOUS_ACTIVITY_REPORTED,
                subject_internal_id=internal_id,
                target_type="support_ticket",
                target_id=ticket.internal_id,
                metadata={"category": str(category)},
            )

        result = _ticket_view(ticket, routings)
        req_hash = idempotency.request_hash(
            {"key": idempotency_key, "category": str(category)}
        )
        await idempotency.record(
            s,
            partner_id=partner_id,
            endpoint=_ENDPOINT,
            key=idempotency_key,
            req_hash=req_hash,
            response=result,
        )
        return result


async def get_ticket(
    s: AsyncSession, claims: TokenClaims, ticket_public_id: uuid.UUID
) -> dict[str, Any]:
    """Status + per-destination delivery_status. Patient-scoped: another patient's
    ticket is hidden behind ``not_found`` (never reveal existence)."""
    internal_id = await internal_id_for_user(s, uuid.UUID(claims.subject_public_id))
    if internal_id is None:
        raise not_found("ticket not found")
    ticket = await s.scalar(
        select(SupportTicket).where(
            SupportTicket.public_id == ticket_public_id,
            SupportTicket.deleted_at.is_(None),
        )
    )
    if ticket is None or ticket.patient_internal_id != internal_id:
        raise not_found("ticket not found")
    routings = list(
        (
            await s.scalars(
                select(TicketRouting)
                .where(TicketRouting.ticket_id == ticket.internal_id)
                .order_by(TicketRouting.created_at.asc(), TicketRouting.public_id.asc())
            )
        ).all()
    )
    return _ticket_view(ticket, routings)
