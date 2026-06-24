"""``app`` plan zone (spec §5.4) — the doctor→patient loop.

``doctor_request`` is the doctor's act of asking the patient to do something before
the visit; ``plan_item`` is each concrete line in that request (a lab to repeat, a
referral, a self-monitoring task). The patient acts on plan items by uploading an
analysis, which links back here (``linked_analysis_id``) and advances the item.

Compliance shapes:
- ``partner_id`` on every row (INV-TX-2).
- ``public_id`` is the only id on the API; ``internal_id`` is the FK key (INV-ID-2).
- no ``overdue`` column — overdue is derived by the client from ``due_date``.
- free-text (``title``/``body``/``label``/``reason``/``prep``) never leaves in an
  outbox payload — notifications carry copy-keys + UUIDs only (INV-AU-2/RES-2).
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Date, ForeignKey, Index, Text
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


class DoctorRequest(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "doctor_request"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), index=True
    )
    from_doctor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.doctor.internal_id")
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.appointment.internal_id"), default=None
    )
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    # before-visit | dynamics-control | additional-check | ocr-clarification
    intent: Mapped[str | None] = mapped_column(Text, default=None)
    seen_by_patient: Mapped[bool] = mapped_column(default=False)
    seen_by_patient_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    # created | sent | seen | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(Text, default="created")


class PlanItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "plan_item"
    __table_args__ = (
        Index("ix_plan_item_patient_status", "patient_internal_id", "status"),
        _APP,
    )
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id")
    )
    doctor_request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.doctor_request.internal_id"), index=True
    )
    # HbA1c | glucose | creatinine | cholesterol | other
    analysis_type: Mapped[str | None] = mapped_column(Text, default=None)
    label: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text, default=None)
    # lab | instrumental | referral | self-monitor
    kind: Mapped[str | None] = mapped_column(Text, default=None)
    prep: Mapped[str | None] = mapped_column(Text, default=None)
    due_date: Mapped[dt.date | None] = mapped_column(Date, default=None)
    # assigned | uploaded | acknowledged
    status: Mapped[str] = mapped_column(Text, default="assigned")
    linked_analysis_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.analysis.internal_id"), default=None
    )
    last_requested_at: Mapped[dt.datetime | None] = mapped_column(default=None)
