"""``identity`` schema — PII home + legal text (spec §4.4, §6.1).

Physically isolated, day-one. A reader without SELECT on ``patient_pii`` is
PII-blind regardless of ID columns (INV-ID-1). Reached only via the resolver
seam (``db/resolver.py``).
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Date, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    SCHEMA_APP,
    SCHEMA_IDENTITY,
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    uuid_pk,
)


class PatientPii(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "patient_pii"
    __table_args__ = (
        UniqueConstraint("partner_id", "phone_e164", name="uq_patient_pii_partner_phone"),
        {"schema": SCHEMA_IDENTITY},
    )

    # internal_id == patient.internal_id (shared PK). Never on API.
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.partner.internal_id")
    )
    full_name: Mapped[str] = mapped_column(Text)
    birth_date: Mapped[dt.date] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(Text)
    phone_e164: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text, default=None)
    snils: Mapped[str | None] = mapped_column(Text, default=None)
    oms: Mapped[str | None] = mapped_column(Text, default=None)


class LegalTextVersion(Base, TimestampMixin):
    __tablename__ = "legal_text_version"
    __table_args__ = (
        UniqueConstraint(
            "consent_type", "version", name="uq_legal_text_version_consent_type"
        ),
        {"schema": SCHEMA_IDENTITY},
    )

    internal_id: Mapped[uuid.UUID] = uuid_pk()
    consent_type: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    published_at: Mapped[dt.datetime] = mapped_column()
