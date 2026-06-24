"""Slice B clinical schemas (uploads / analyses / documents / complaints)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.enums import AnalysisType, ComplaintKind, DocumentType


class SignUploadIn(BaseModel):
    content_type: str | None = None


class SignUploadOut(BaseModel):
    object_key: str
    upload_url: str


class RegisterAnalysisIn(BaseModel):
    object_key: str
    analysis_type: AnalysisType
    label: str
    lab_date: str | None = None
    # Optional: this upload fulfils a doctor's plan item (advances it to 'uploaded').
    plan_item_public_id: str | None = None


class RegisterDocumentIn(BaseModel):
    object_key: str
    document_type: DocumentType
    label: str | None = None
    issuer_name: str | None = None


class EditOcrFieldIn(BaseModel):
    value: str = Field(min_length=1)


class AddComplaintIn(BaseModel):
    text: str = Field(min_length=1)
    kind: ComplaintKind = ComplaintKind.COMPLAINT
    tags: list[str] | None = None
    priority: int | None = None


class UpdateComplaintIn(BaseModel):
    text: str | None = None
    tags: list[str] | None = None
    priority: int | None = None
