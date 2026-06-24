"""``app`` access zone — access_grant, consent_bundle/record, acceptance_record,
outbox_event, refresh_token, idempotency_key (spec §5.2, §8, §11.3).

access_grant carries EXPLICIT fields (no opaque ``lifetime-clinic`` literal —
INV-AC-6); default ``expires_at`` NULL = indefinite-until-revoke (Q3).
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
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


class AccessGrant(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "access_grant"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), index=True
    )
    granted_to_type: Mapped[str] = mapped_column(Text)  # clinic | department | doctor | caregiver
    granted_to_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    data_scope: Mapped[str] = mapped_column(Text, default="analyses_prep")
    valid_from: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
    expires_at: Mapped[dt.datetime | None] = mapped_column(default=None)  # NULL = indefinite (Q3)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    revoke_reason: Mapped[str | None] = mapped_column(Text, default=None)  # no medical data
    is_suspended: Mapped[bool] = mapped_column(default=False)
    suspended_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    suspend_reason: Mapped[str | None] = mapped_column(Text, default=None)
    created_by_type: Mapped[str] = mapped_column(Text, default="patient")
    last_viewed_at: Mapped[dt.datetime | None] = mapped_column(default=None)


class ConsentBundle(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "consent_bundle"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id")
    )
    captured_at: Mapped[dt.datetime] = mapped_column()
    ip_address: Mapped[str | None] = mapped_column(Text, default=None)
    user_agent: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[str] = mapped_column(Text, default="active")


class ConsentRecord(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "consent_record"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    consent_bundle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.consent_bundle.internal_id")
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    consent_type: Mapped[str] = mapped_column(Text)
    legal_text_version: Mapped[str] = mapped_column(Text)  # INV-CO-1
    accepted: Mapped[bool] = mapped_column(default=True)
    ack_mechanism: Mapped[str] = mapped_column(Text)  # INV-CO-2 (mandatory)
    channels: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=None)
    sms_confirmed: Mapped[bool | None] = mapped_column(default=None)
    sms_confirmed_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    withdrawn_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    re_signed_at: Mapped[dt.datetime | None] = mapped_column(default=None)


class AcceptanceRecord(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "acceptance_record"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id")
    )
    document_hash: Mapped[str] = mapped_column(Text)
    acceptance_method: Mapped[str] = mapped_column(Text)  # mock_no_otp — never "ЭП" (INV-CO-6)
    signed_at: Mapped[dt.datetime] = mapped_column()
    recipient_clinic_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.clinic.internal_id")
    )
    consent_bundle_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.consent_bundle.internal_id"), default=None
    )
    access_grant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.access_grant.internal_id"), default=None
    )


class OutboxEvent(Base):
    """Transactional outbox (§8.1). Written in the business txn; dispatched after
    commit by arq. No soft-delete — it's a queue."""

    __tablename__ = "outbox_event"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    event_type: Mapped[str] = mapped_column(Text)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)  # no PII/medical
    status: Mapped[str] = mapped_column(Text, default="pending", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[dt.datetime] = mapped_column(
        default=lambda: dt.datetime.now(tz=dt.UTC), index=True
    )
    dispatched_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    last_error: Mapped[str | None] = mapped_column(Text, default=None)  # sanitized
    trace_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
    updated_at: Mapped[dt.datetime] = mapped_column(
        default=lambda: dt.datetime.now(tz=dt.UTC), onupdate=lambda: dt.datetime.now(tz=dt.UTC)
    )


class RefreshToken(Base):
    __tablename__ = "refresh_token"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_refresh_token_token_hash"),
        _APP,
    )
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    user_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.user_account.internal_id"), index=True
    )
    token_hash: Mapped[str] = mapped_column(Text)
    parent_token_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    status: Mapped[str] = mapped_column(Text, default="issued")
    issued_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
    expires_at: Mapped[dt.datetime] = mapped_column()
    revoked_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    created_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
    updated_at: Mapped[dt.datetime] = mapped_column(
        default=lambda: dt.datetime.now(tz=dt.UTC), onupdate=lambda: dt.datetime.now(tz=dt.UTC)
    )


class IdempotencyKey(Base):
    __tablename__ = "idempotency_key"
    __table_args__ = (
        UniqueConstraint("partner_id", "endpoint", "key", name="uq_idempotency_key_scope"),
        _APP,
    )
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    key: Mapped[str] = mapped_column(Text)
    endpoint: Mapped[str] = mapped_column(Text)
    request_hash: Mapped[str] = mapped_column(Text)
    response_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    status: Mapped[str] = mapped_column(Text, default="in_progress")
    created_at: Mapped[dt.datetime] = mapped_column(default=lambda: dt.datetime.now(tz=dt.UTC))
    updated_at: Mapped[dt.datetime] = mapped_column(
        default=lambda: dt.datetime.now(tz=dt.UTC), onupdate=lambda: dt.datetime.now(tz=dt.UTC)
    )
