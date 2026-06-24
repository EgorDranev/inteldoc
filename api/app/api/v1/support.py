"""Support / integrity endpoints (spec §7.8, Slice E). Patient session required.

POST /support/tickets  — create + fan out (integrity → 2 routings, tech → 1).
GET  /support/tickets/{id} — status + per-destination delivery_status.

The router only gates the patient role + idempotency; routing, audit, and outbox
fan-out are owned by ``support_service`` (the one rule). The response carries the
named destinations + SLA so the patient sees «куда ушло» + «когда ждать».
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.v1.deps import AppSession, IdempotencyKey, PatientClaims
from app.api.v1.schemas.support import SupportTicketCreateIn, SupportTicketOut
from app.services import support_service

router = APIRouter(prefix="/support", tags=["support"])


@router.post("/tickets", response_model=SupportTicketOut)
async def create_ticket(
    body: SupportTicketCreateIn, claims: PatientClaims, idem: IdempotencyKey
) -> SupportTicketOut:
    result = await support_service.create_ticket(
        claims, body.model_dump(mode="json"), idempotency_key=idem
    )
    return SupportTicketOut(**result)


@router.get("/tickets/{public_id}", response_model=SupportTicketOut)
async def get_ticket(
    public_id: uuid.UUID, claims: PatientClaims, session: AppSession
) -> SupportTicketOut:
    result = await support_service.get_ticket(session, claims, public_id)
    return SupportTicketOut(**result)
