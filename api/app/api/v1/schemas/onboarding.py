"""Onboarding request/response schemas (Pydantic, not ORM)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.domain.enums import AckMechanism, ConsentType


class PartnerContextOut(BaseModel):
    partner_public_id: uuid.UUID
    partner_name: str
    partner_short_name: str
    department_public_id: uuid.UUID
    department_name: str


class ConsentRecordIn(BaseModel):
    consent_type: ConsentType
    legal_text_version: str
    ack_mechanism: AckMechanism
    accepted: bool = True
    channels: list[str] | None = None
    sms_confirmed: bool | None = None


class CommitIn(BaseModel):
    department_public_id: uuid.UUID
    name: str = Field(min_length=1)
    dob: str  # ISO yyyy-mm-dd
    gender: str
    phone: str
    email: str | None = None
    oms: str | None = None
    snils: str | None = None
    consents: list[ConsentRecordIn] = Field(default_factory=list)
    document_hash: str


class GrantOut(BaseModel):
    public_id: str
    granted_to_type: str
    data_scope: str
    valid_from: str
    expires_at: str | None = None
    revoked_at: str | None = None
    last_viewed_at: str | None = None
    status: str


class CommitOut(BaseModel):
    patient_public_id: str | None
    grant: GrantOut | None
    deduplicated: bool


class AccountDraftIn(BaseModel):
    name: str
    dob: str
    gender: str | None = None
    phone: str
    email: str | None = None
