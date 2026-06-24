"""``app`` core zone — partner/clinic/department/specialty/doctor/user_account,
patient (+ baseline, condition_context), appointment, notification_prefs.

Multi-tenancy: ``partner_id`` on every key entity (INV-TX-2). ``public_id`` is the
only id on the API; ``internal_id`` is the clinical key (FK everywhere).
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    SCHEMA_APP,
    SCHEMA_IDENTITY,
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    uuid_pk,
    uuid_public,
)

_APP = {"schema": SCHEMA_APP}


class Partner(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "partner"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    name: Mapped[str] = mapped_column(Text)
    short_name: Mapped[str] = mapped_column(Text)


class Clinic(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "clinic"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    name: Mapped[str] = mapped_column(Text)
    short_name: Mapped[str] = mapped_column(Text)


class Department(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "department"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    clinic_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.clinic.internal_id"))
    name: Mapped[str] = mapped_column(Text)


class Specialty(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "specialty"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    slug: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)


class UserAccount(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "user_account"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    role: Mapped[str] = mapped_column(Text)
    # use_alter breaks the patient<->doctor<->user_account FK cycle.
    patient_internal_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id", use_alter=True), default=None
    )
    username: Mapped[str | None] = mapped_column(Text, default=None)
    password_hash: Mapped[str | None] = mapped_column(Text, default=None)
    phone_e164: Mapped[str | None] = mapped_column(Text, default=None)
    last_login_at: Mapped[dt.datetime | None] = mapped_column(default=None)


class Doctor(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "doctor"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    clinic_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.clinic.internal_id"))
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.department.internal_id"), default=None
    )
    name: Mapped[str] = mapped_column(Text)
    specialty_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.specialty.internal_id"), default=None
    )
    user_account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.user_account.internal_id"), default=None
    )


class Patient(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "patient"
    __table_args__ = _APP
    # Shared PK with patient_pii (clinical key). public_id is the only API id.
    internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_IDENTITY}.patient_pii.internal_id"), primary_key=True
    )
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    clinic_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.clinic.internal_id"))
    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.department.internal_id")
    )
    attending_doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.doctor.internal_id"), default=None
    )
    prep_started_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    prep_completed_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    prep_time_spent_min: Mapped[int | None] = mapped_column(Integer, default=None)
    identity_verified_at: Mapped[dt.datetime | None] = mapped_column(default=None)
    identity_updated_at: Mapped[dt.datetime | None] = mapped_column(default=None)


class PatientMedicalBaseline(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "patient_medical_baseline"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id"), unique=True
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    height_cm: Mapped[float | None] = mapped_column(Numeric, default=None)
    weight_kg: Mapped[float | None] = mapped_column(Numeric, default=None)
    chronic_conditions: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=None)
    allergies: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=None)
    baseline_updated_at: Mapped[dt.datetime | None] = mapped_column(default=None)


class ConditionContext(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "condition_context"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id")
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    label: Mapped[str] = mapped_column(Text)
    is_confirmed_by_clinic: Mapped[bool] = mapped_column(default=False)
    source: Mapped[str] = mapped_column(Text)  # clinic | patient_reported | referral (never ai)


class Appointment(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "appointment"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    public_id: Mapped[uuid.UUID] = uuid_public()
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    patient_internal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.patient.internal_id")
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.doctor.internal_id"), default=None
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.department.internal_id")
    )
    type: Mapped[str] = mapped_column(Text)  # main | preparatory
    specialty_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.specialty.internal_id"), default=None
    )
    recommended_by_doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.doctor.internal_id"), default=None
    )
    scheduled_at: Mapped[dt.datetime] = mapped_column()
    status: Mapped[str] = mapped_column(Text, default="scheduled")
    source: Mapped[str] = mapped_column(Text, default="manual")


class NotificationPrefs(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "notification_prefs"
    __table_args__ = _APP
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    user_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{SCHEMA_APP}.user_account.internal_id"), unique=True
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey(f"{SCHEMA_APP}.partner.internal_id"))
    push_enabled: Mapped[bool] = mapped_column(default=True)
    email_enabled: Mapped[bool] = mapped_column(default=False)
    reminders_enabled: Mapped[bool] = mapped_column(default=True)
