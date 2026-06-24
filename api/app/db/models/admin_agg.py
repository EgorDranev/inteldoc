"""``admin_agg`` schema — PII-free aggregate snapshots for the admin cockpit (Slice D).

These tables hold the **materialized** side of the partner-admin surface (spec §4.4,
§5.9): the headline KPIs, the adoption funnel, per-department/-doctor breakdowns, the
KPI trend, and the departments table — the demo's scripted big numbers that no 20-row
seed could compute live. The **live** side (the 20-grant access audit, by-department
counts, incidents, compliance) is derived from base tables through the
``admin_agg.access_audit_view`` defined in migration 0007 and read per request.

Every row here is structurally PII-free: counts, rates, labels, and a precomputed
patient *mask* (first-initial + surname) — never a full name / phone / СНИЛС. The
``admin_readonly`` DB role gets SELECT here and nowhere in ``identity``/clinical
(INV-ID-3) — the database, not app code, is the floor under "admin is PII-blind".

All PKs are UUID (INV-ID-5). No ``public_id`` — these are not API entities, they are
read through the admin service which exposes only the projected shapes.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Date, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import SCHEMA_ADMIN_AGG, Base, TimestampMixin, uuid_pk

_ADMIN_AGG = {"schema": SCHEMA_ADMIN_AGG}


class PilotKpiSnapshot(Base, TimestampMixin):
    """One row per partner — the four A01 headline KPIs + the pilot goal."""

    __tablename__ = "pilot_kpi_snapshot"
    __table_args__ = _ADMIN_AGG
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    onboarded: Mapped[int] = mapped_column(Integer)
    prep_rate: Mapped[float] = mapped_column(Numeric)  # 0..1
    ocr_rate: Mapped[float] = mapped_column(Numeric)  # 0..1
    request_response_rate: Mapped[float] = mapped_column(Numeric)  # 0..1
    period_label: Mapped[str] = mapped_column(Text)
    as_of: Mapped[dt.datetime] = mapped_column()
    target_onboarded: Mapped[int] = mapped_column(Integer)
    target_date: Mapped[dt.date] = mapped_column(Date)
    target_label: Mapped[str] = mapped_column(Text)


class FunnelSnapshot(Base, TimestampMixin):
    """Adoption funnel stages (invited → installed → consented → granted → prepared)."""

    __tablename__ = "funnel_snapshot"
    __table_args__ = _ADMIN_AGG
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    position: Mapped[int] = mapped_column(Integer)  # stable display order
    stage: Mapped[str] = mapped_column(Text)  # invited|installed|consented|granted|prepared
    label: Mapped[str] = mapped_column(Text)
    count: Mapped[int] = mapped_column(Integer)


class AdoptionSnapshot(Base, TimestampMixin):
    """Per-department and per-doctor funnel breakdown (one row per item)."""

    __tablename__ = "adoption_snapshot"
    __table_args__ = _ADMIN_AGG
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    dimension: Mapped[str] = mapped_column(Text)  # department | doctor
    position: Mapped[int] = mapped_column(Integer)
    item_key: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text)
    sublabel: Mapped[str | None] = mapped_column(Text, default=None)
    invited: Mapped[int] = mapped_column(Integer)
    installed: Mapped[int] = mapped_column(Integer)
    consented: Mapped[int] = mapped_column(Integer)
    granted: Mapped[int] = mapped_column(Integer)
    prepared: Mapped[int] = mapped_column(Integer)


class KpiTrendPoint(Base, TimestampMixin):
    """One daily point of a KPI's trend (spec §5.9 — the one stored-history shape)."""

    __tablename__ = "kpi_trend_point"
    __table_args__ = _ADMIN_AGG
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    kpi_id: Mapped[str] = mapped_column(Text)  # prepRate | ocrRate | onboarded
    day: Mapped[dt.date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Numeric)  # 0..1 for rate KPIs


class DepartmentKpiSnapshot(Base, TimestampMixin):
    """A01 «По отделениям» table — adoption + prep + overdue per department."""

    __tablename__ = "department_kpi_snapshot"
    __table_args__ = _ADMIN_AGG
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    partner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    position: Mapped[int] = mapped_column(Integer)
    department_label: Mapped[str] = mapped_column(Text)
    connected: Mapped[int] = mapped_column(Integer)
    prep_rate: Mapped[float] = mapped_column(Numeric)  # 0..1
    overdue: Mapped[int] = mapped_column(Integer)


class AccessGrantDisplay(Base, TimestampMixin):
    """PII-free display projection for a real ``app.access_grant`` row that should
    appear in the admin A02 audit. ``access_audit_view`` INNER-JOINs this onto
    ``app.access_grant`` by ``grant_internal_id`` — so ONLY curated demo grants reach
    the admin surface (doctor-demo grants, which have no display row, never leak), and
    the row stays LIVE (a patient revoke flips its status on the next read).

    The mask (e.g. «М. Иванова») is the intended admin-facing identifier (brief §4):
    first initial + surname — never the full name, which lives only in ``identity``.
    """

    __tablename__ = "access_grant_display"
    __table_args__ = _ADMIN_AGG
    internal_id: Mapped[uuid.UUID] = uuid_pk()
    # Links to app.access_grant.internal_id (no hard FK — keeps admin_agg decoupled
    # from the app table lifecycle; the view's JOIN provides the linkage at read time).
    grant_internal_id: Mapped[uuid.UUID] = mapped_column(index=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(index=True)
    patient_mask: Mapped[str] = mapped_column(Text)  # «М. Иванова» — pseudonymous
    doctor_name: Mapped[str] = mapped_column(Text)  # org/staff name, not patient PII
    department_label: Mapped[str] = mapped_column(Text)
    scope_label: Mapped[str] = mapped_column(Text)  # «Анализы и подготовка»
