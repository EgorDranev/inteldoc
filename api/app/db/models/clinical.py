"""``app`` clinical zone (spec §5.3, §9). storage_object, medical_document,
analysis, ocr_field (two orthogonal review axes), ocr_field_revision (append-only),
complaint.

Key compliance shapes:
- per-field ``confidence`` + ``low_confidence`` — never a document-level flag (INV-AI-2).
- two axes on ``ocr_field``: ``patient_transcription_state`` (patient confirms the
  reading) vs ``doctor_metadata_verdict`` (doctor stamps structuring metadata) —
  they never overwrite each other (INV-AI-4).
- ``lab_date``/``document_date`` ≠ ``uploaded_at`` (INV-FP-3).
- object keys are UUID-only — no PII (INV-RES-3).
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import ARRAY
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


class StorageObject(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "storage_object"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    storage_zone: Mapped[str] = mapped_column(Text, default="quarantine")
    object_key: Mapped[str] = mapped_column(Text)  # UUID-only, no PII (INV-RES-3)
    sha256: Mapped[str | None] = mapped_column(Text, default=None)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, default=None)
    mime_type: Mapped[str | None] = mapped_column(Text, default=None)
    encryption_key_id: Mapped[str | None] = mapped_column(Text, default=None)


class MedicalDocument(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "medical_document"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), index=True
    )
    storage_object_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.storage_object.internal_id")
    )
    document_type: Mapped[str] = mapped_column(Text)
    label: Mapped[str | None] = mapped_column(Text, default=None)
    processing_status: Mapped[str] = mapped_column(Text, default="uploaded", index=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, default=None)
    quality_check: Mapped[str | None] = mapped_column(Text, default=None)
    store_original_only: Mapped[bool] = mapped_column(default=False)
    document_date: Mapped[dt.date | None] = mapped_column(Date, default=None)  # ≠ uploaded_at
    uploaded_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
    issuer_name: Mapped[str | None] = mapped_column(Text, default=None)
    referral_reason: Mapped[str | None] = mapped_column(Text, default=None)
    source: Mapped[str] = mapped_column(Text, default="file")
    ocr_provider: Mapped[str | None] = mapped_column(Text, default=None)
    ocr_attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    ocr_error: Mapped[str | None] = mapped_column(Text, default=None)
    ocr_job_id: Mapped[uuid.UUID | None] = mapped_column(default=None)  # reserved for re-OCR


class Analysis(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "analysis"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), index=True
    )
    medical_document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.medical_document.internal_id"), default=None
    )
    analysis_type: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text)
    lab_date: Mapped[dt.date | None] = mapped_column(Date, default=None)  # ≠ uploaded_at
    quality_check: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[str] = mapped_column(Text, default="uploaded")
    # Single stored link (reverse derived). FK to plan_item (Slice C, use_alter
    # breaks the analysis<->plan_item cycle: plan_item.linked_analysis_id → analysis).
    linked_plan_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.plan_item.internal_id", use_alter=True), default=None
    )
    uploaded_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
    # rejection footprint (status=rejected)
    rejection_reason: Mapped[str | None] = mapped_column(Text, default=None)
    rejected_by: Mapped[str | None] = mapped_column(Text, default=None)
    rejected_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    # resend footprint (status=resend_requested)
    resend_reason: Mapped[str | None] = mapped_column(Text, default=None)
    resend_requested_by: Mapped[str | None] = mapped_column(Text, default=None)
    resend_requested_at: Mapped[dt.datetime | None] = mapped_column(default=None)


class OcrField(Base, TimestampMixin):
    __tablename__ = "ocr_field"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    analysis_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.analysis.internal_id"), default=None, index=True
    )
    medical_document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.medical_document.internal_id"), default=None
    )
    field_key: Mapped[str] = mapped_column(Text)
    raw_value: Mapped[str] = mapped_column(Text)
    normalized_value: Mapped[float | None] = mapped_column(Numeric, default=None)
    unit: Mapped[str | None] = mapped_column(Text, default=None)
    reference_text: Mapped[str | None] = mapped_column(Text, default=None)
    reference_min: Mapped[float | None] = mapped_column(Numeric, default=None)
    reference_max: Mapped[float | None] = mapped_column(Numeric, default=None)
    confidence: Mapped[float | None] = mapped_column(Numeric, default=None)
    low_confidence: Mapped[bool] = mapped_column(default=False)  # per-field (INV-AI-2)
    # Axis 1 — patient transcription (patient confirms the reading, not medical truth)
    patient_transcription_state: Mapped[str] = mapped_column(Text, default="pending")
    patient_confirmed_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    # Axis 2 — doctor metadata verdict (structuring metadata, not clinical content)
    doctor_metadata_verdict: Mapped[str] = mapped_column(Text, default="none")
    doctor_verdict_by: Mapped[str | None] = mapped_column(Text, default=None)
    doctor_verdict_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    # Reserved: only for trusted-source ('verified' word reserved here, INV-AI-1)
    source_verified_at: Mapped[dt.datetime | None] = mapped_column(default=None)


class OcrFieldRevision(Base):
    """Append-only edit trail (INV-AI-3). No in-place overwrite of ocr_field."""

    __tablename__ = "ocr_field_revision"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    ocr_field_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.ocr_field.internal_id"), index=True
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    old_raw_value: Mapped[str | None] = mapped_column(Text, default=None)
    new_raw_value: Mapped[str] = mapped_column(Text)
    edited_by_type: Mapped[str] = mapped_column(Text)
    edited_by: Mapped[str | None] = mapped_column(Text, default=None)
    reason: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))


class Complaint(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "complaint"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), index=True
    )
    kind: Mapped[str] = mapped_column(Text, default="complaint")  # complaint | question
    text: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=None)
    priority: Mapped[int | None] = mapped_column(Integer, default=None)  # 1 = highest
    edited_at: Mapped[dt.datetime | None] = mapped_column(default=None)
