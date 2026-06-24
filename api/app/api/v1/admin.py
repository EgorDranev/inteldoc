"""Admin cockpit endpoints (spec §7.7) — partner-admin aggregate reads.

Three reads back the two screens + the journal: A01 overview, A02 access audit, and
the org-level audit journal. All execute under the ``admin_readonly`` DB role inside
the service (``admin_metrics_service``) — the router only gates the ``clinic_admin``
role and maps the result. Admin is **read-only and aggregate-only**: no clinical view,
no revoke/extend (deferred — spec §7.7), so there is no idempotency / mutation surface
here. PII-blindness is the DB's guarantee (INV-ID-3), re-stated by the role gate.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.deps import AdminClaims
from app.api.v1.schemas.admin import AccessAuditOut, AdminOverviewOut, AuditJournalOut
from app.core.errors import not_found
from app.services import admin_metrics_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverviewOut)
async def get_overview(claims: AdminClaims) -> AdminOverviewOut:
    """A01 «Внедрение» — KPIs, goal, funnel, adoption, trend, departments table, and the
    live access panel / incidents / compliance state."""
    result = await admin_metrics_service.build_overview(claims)
    if result is None:
        raise not_found("admin aggregates not available for this partner")
    return AdminOverviewOut(**result)


@router.get("/access", response_model=AccessAuditOut)
async def get_access_audit(claims: AdminClaims) -> AccessAuditOut:
    """A02 «Журнал доступов» — every curated grant to Эндокор, masked, with live status
    (active / истекает скоро / истёк / отозван). Reflects patient revoke + expiry."""
    result = await admin_metrics_service.build_access_audit(claims)
    return AccessAuditOut(**result)


@router.get("/audit", response_model=AuditJournalOut)
async def get_audit_journal(claims: AdminClaims) -> AuditJournalOut:
    """Org-level audit journal off ``clinic_admin_audit_view`` — no subject pseudonym,
    counts-only metadata (INV-AU-3). Newest first."""
    result = await admin_metrics_service.build_audit_journal(claims)
    return AuditJournalOut(**result)
