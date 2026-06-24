"""``app`` support zone — support_ticket + ticket_routing (spec §5.6, Slice E).

The patient-side support/integrity surface. A ticket fans out to ONE row per
destination in ``ticket_routing``: tech-only issues → a single IntelDoc routing;
integrity/safety reports (not_my_analysis / not_my_clinic / suspicious_activity)
→ TWO routings (IntelDoc audit/security + Эндокор record-correction) by default
(INV-SR-1). Each routing dispatches independently through the outbox, so a dropped
safety route is never silently swallowed — it dead-letters and alerts.

Patient-scoped: ``patient_internal_id`` on both tables drives the RLS backstop
(migration 0008), same as the clinical tables. The audit row a ticket emits stays
PII-free (category + counts only); the ticket ``body`` is the patient's own report
text, app-scoped, never copied into audit metadata.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    SCHEMA_APP,
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    uuid_pk,
    uuid_public,
)

_APP = {"schema": SCHEMA_APP}


class SupportTicket(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "support_ticket"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), index=True
    )
    category: Mapped[str] = mapped_column(Text)
    is_integrity_report: Mapped[bool] = mapped_column(default=False)
    # Opaque ref to the reported artefact (e.g. an analysis public_id) — never PII.
    subject_ref: Mapped[str | None] = mapped_column(Text, default=None)
    # The patient's own report text (app-scoped, never copied into audit metadata).
    body: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[str] = mapped_column(Text, default="routed")


class TicketRouting(Base, TimestampMixin):
    """One destination of a ticket's fan-out. Dispatched independently via the
    outbox; ``delivery_status`` is its own state machine so a per-destination
    failure (esp. a safety route) is visible, never hidden by a sibling success."""

    __tablename__ = "ticket_routing"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.support_ticket.internal_id"), index=True
    )
    # Denormalized for the RLS backstop + partner scoping (mirrors the clinical tables).
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), index=True
    )
    destination: Mapped[str] = mapped_column(Text)
    sla_hours: Mapped[int] = mapped_column(Integer)
    delivery_status: Mapped[str] = mapped_column(Text, default="pending")
    dispatched_at: Mapped[dt.datetime | None] = mapped_column(default=None)
