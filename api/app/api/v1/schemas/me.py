"""Patient self-service (/me) schemas."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class IdentityPatchIn(BaseModel):
    name: str | None = None
    dob: str | None = None
    gender: str | None = None
    oms: str | None = None


class BaselinePatchIn(BaseModel):
    height_cm: float | None = None
    weight_kg: float | None = None
    chronic_conditions: list[str] | None = None
    allergies: list[str] | None = None


class ExtendIn(BaseModel):
    new_expires_at: dt.datetime | None = None


class ResignIn(BaseModel):
    new_version: str


class MarketingChannelIn(BaseModel):
    channel: str
    on: bool


class PrepCompleteIn(BaseModel):
    # Optional self-reported minutes spent preparing (surfaced in the doctor prep meta).
    time_spent_min: int | None = None
