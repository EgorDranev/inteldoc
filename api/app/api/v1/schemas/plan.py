"""Slice C plan schemas (doctor→patient loop). snake_case, mirroring the frontend
store contract so later integration is mechanical (Pydantic, not ORM)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.domain.enums import AnalysisType, OrderIntent, OrderKind


class PlanItemOut(BaseModel):
    public_id: str
    request_public_id: str
    analysis_type: str | None = None
    label: str
    reason: str | None = None
    status: str  # assigned | uploaded | acknowledged
    linked_analysis_public_id: str | None = None
    due_date: str | None = None
    last_requested_at: str | None = None
    kind: str | None = None
    prep: str | None = None
    created_at: str


class DoctorRequestOut(BaseModel):
    public_id: str
    from_doctor_public_id: str
    title: str
    body: str
    intent: str | None = None
    plan_item_public_ids: list[str]
    seen_by_patient: bool
    # Derived doneness, computed from the request's plan items (canon §12.7 — never a
    # stored parallel status): open | in_progress | completed.
    progress: str
    created_at: str


class PlanOut(BaseModel):
    doctor_requests: list[DoctorRequestOut]
    plan_items: list[PlanItemOut]


class DoctorRequestItemIn(BaseModel):
    analysis_type: AnalysisType | None = None
    label: str = Field(min_length=1)
    reason: str | None = None
    kind: OrderKind | None = None
    prep: str | None = None
    due_date: str | None = None  # ISO yyyy-mm-dd


class DoctorRequestCreateIn(BaseModel):
    title: str = Field(min_length=1)
    body: str = Field(min_length=1)
    intent: OrderIntent | None = None
    appointment_public_id: uuid.UUID | None = None
    items: list[DoctorRequestItemIn] = Field(default_factory=list)
