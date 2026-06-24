"""Auth request/response schemas (Pydantic, not ORM)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OtpRequestIn(BaseModel):
    phone: str = Field(min_length=5)


class OtpVerifyIn(BaseModel):
    phone: str
    code: str


class WebLoginIn(BaseModel):
    username: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str
    subject_public_id: str


class SessionOut(BaseModel):
    subject_public_id: str
    role: str
    partner_id: str
    clinic_id: str | None = None
