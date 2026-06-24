"""Admin cockpit response schemas (spec §7.7). PII-free by construction — counts,
rates, labels, pseudonymous masks. Field names mirror the frontend admin selectors
(``adminSelectors.ts`` / ``adminMockData.ts``) so the A01/A02 backend swap is mechanical.

Two read shapes back the two screens: ``AdminOverviewOut`` (A01 «Внедрение») and
``AccessAuditOut`` (A02 «Журнал доступов»), plus ``AuditJournalOut`` for the org-level
audit journal read off ``audit.clinic_admin_audit_view`` (no ``audit_subject_id``,
INV-AU-3).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

# ─── A01 «Внедрение» (KPI dashboard) ────────────────────────────────────────────


class GoalOut(BaseModel):
    target_onboarded: int
    target_date: str
    target_label: str


class KpisOut(BaseModel):
    onboarded: int
    prep_rate: float  # 0..1
    ocr_rate: float  # 0..1
    request_response_rate: float  # 0..1
    period_label: str
    as_of: str


class FunnelStageOut(BaseModel):
    stage: str  # invited | installed | consented | granted | prepared
    label: str
    count: int


class AdoptionRowOut(BaseModel):
    item_key: str
    label: str
    sublabel: str | None = None
    invited: int
    installed: int
    consented: int
    granted: int
    prepared: int


class KpiTrendPointOut(BaseModel):
    kpi_id: str  # prepRate | ocrRate | onboarded
    day: str  # ISO date
    value: float


class DepartmentRowOut(BaseModel):
    department_label: str
    connected: int
    prep_rate: float  # 0..1
    overdue: int


class AccessPanelOut(BaseModel):
    """A01 «Доступы и инциденты» panel — live counts over the curated access set."""

    active_total: int  # active + expiring-soon
    expiring_soon: int
    revoked: int
    expired: int


class AccessIncidentOut(BaseModel):
    type: str  # revoked | expired
    count: int
    last_event_at: str | None = None


class ComplianceOut(BaseModel):
    state: str  # green | amber | red
    n3_consent_recorded: bool
    n4_scope_defined: bool
    n5_audit_log_enabled: bool
    n7_expiry_healthy: bool


class AdminOverviewOut(BaseModel):
    kpis: KpisOut
    goal: GoalOut
    funnel: list[FunnelStageOut]
    adoption_by_department: list[AdoptionRowOut]
    adoption_by_doctor: list[AdoptionRowOut]
    kpi_trend: list[KpiTrendPointOut]
    departments: list[DepartmentRowOut]
    access_panel: AccessPanelOut
    access_incidents: list[AccessIncidentOut]
    compliance: ComplianceOut


# ─── A02 «Журнал доступов» (access audit) ───────────────────────────────────────


class AccessAuditRowOut(BaseModel):
    grant_public_id: str
    patient_mask: str  # «М. Иванова» — pseudonymous, never the full name
    department_label: str
    doctor_name: str
    scope_label: str
    valid_from: str
    expires_at: str | None = None
    revoked_at: str | None = None
    last_viewed_at: str | None = None
    # active | expiring_soon | expired | revoked | suspended
    status: str


class AccessAuditCountsOut(BaseModel):
    total: int
    active: int
    expiring_soon: int
    expired: int
    revoked: int


class AccessAuditOut(BaseModel):
    as_of: str
    counts: AccessAuditCountsOut
    rows: list[AccessAuditRowOut]


# ─── Org-level audit journal (clinic_admin_audit_view) ──────────────────────────


class AuditJournalRowOut(BaseModel):
    event_type: str
    actor_role: str
    target_type: str | None = None
    created_at: str
    metadata: dict[str, Any] | None = None


class AuditJournalOut(BaseModel):
    rows: list[AuditJournalRowOut]
