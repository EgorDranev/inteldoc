"""``audit`` schema — append-only event log (spec §11.1).

INSERT-only is enforced by a Postgres trigger (migration 0002), not by ORM
convention. Carries ``audit_subject_id`` (HMAC pseudonym), never direct PII or
medical values (INV-AU-1, INV-AU-2). No timestamp ``onupdate`` — rows never update.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import SCHEMA_AUDIT, Base, uuid_pk


class AuditEvent(Base):
    __tablename__ = "audit_event"
    __table_args__ = {"schema": SCHEMA_AUDIT}

    internal_id: Mapped[uuid.UUID] = uuid_pk()
    # No FK into app — audit is append-only and outlives app rows (retention §11.5).
    partner_id: Mapped[uuid.UUID] = mapped_column()
    audit_subject_id: Mapped[str | None] = mapped_column(Text, default=None, index=True)
    actor_role: Mapped[str] = mapped_column(Text)
    actor_ref: Mapped[str | None] = mapped_column(Text, default=None)  # opaque, not PII
    event_type: Mapped[str] = mapped_column(Text)
    target_type: Mapped[str | None] = mapped_column(Text, default=None)
    target_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    trace_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
