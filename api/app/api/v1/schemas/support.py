"""Support / integrity ticket schemas (spec §7.8, Slice E). Pydantic request/response.

The response always carries the routing destinations with a NAMED human label and
an SLA phrase, so «куда ушло» + «когда ждать» are part of the contract, not optional
(INV-SR-2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

# Mirrors app.domain.enums.SupportCategory. Integrity/safety set routes to two
# destinations; the rest to IntelDoc support only.
SupportCategoryIn = Literal[
    "tech_issue",
    "question",
    "not_my_analysis",
    "not_my_clinic",
    "suspicious_activity",
    "other",
]


class SupportTicketCreateIn(BaseModel):
    category: SupportCategoryIn
    # The patient's own report text (optional). Never copied into audit metadata.
    body: str | None = None
    # Opaque ref to the reported artefact (e.g. an analysis public_id) — never PII.
    subject_ref: str | None = None


class TicketRoutingOut(BaseModel):
    destination: str  # inteldoc_support | inteldoc_security | partner_registry | partner_admin
    label: str  # «поддержка IntelDoc» / «администратор Эндокор» / …
    sla_hours: int
    sla_label: str  # «в течение 4 часов»
    delivery_status: str  # pending | dispatched | delivered | failed | dead_letter


class SupportTicketOut(BaseModel):
    public_id: str
    category: str
    is_integrity_report: bool
    status: str
    created_at: str
    destinations: list[TicketRoutingOut]
