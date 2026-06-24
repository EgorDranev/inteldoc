"""Admin aggregate read service (spec §5.9, §7.7) — partner-admin cockpit.

Runs entirely under the ``admin_readonly`` DB role (``admin_sessionmaker``): it can
SELECT the ``admin_agg`` snapshots, the ``admin_agg.access_audit_view`` (live grants ×
curated display rows), and ``audit.clinic_admin_audit_view`` — and **nothing** in
``identity``/clinical. PII-blindness is therefore the database's guarantee, not this
module's discretion (INV-ID-3): a bug that tried to read a patient name would be
refused by Postgres, not by a code review.

Two materialized + live halves (spec §5.9):
  * **Materialized** — KPIs, goal, funnel, adoption, KPI trend, departments table come
    from seeded ``admin_agg`` snapshot tables (the demo's scripted big numbers).
  * **Live** — the A02 access audit, the A01 access panel, incidents and compliance are
    DERIVED per request from the access-audit view, so a patient revoke / a lapse into
    expiry moves the numbers on the next read.

Effective grant status reuses the pure ``grant_status`` domain logic; «истекает скоро»
is the admin-only refinement (active grant within ``EXPIRING_SOON_DAYS``).
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select, text

from app.core.security import TokenClaims
from app.db.models.admin_agg import (
    AdoptionSnapshot,
    DepartmentKpiSnapshot,
    FunnelSnapshot,
    KpiTrendPoint,
    PilotKpiSnapshot,
)
from app.db.session import admin_sessionmaker
from app.domain.grant_status import GrantFacts, GrantStatus, effective_status

# «Истекает скоро» threshold (A02 brief): an active grant expiring within 3 days.
EXPIRING_SOON_DAYS = 3
# Share of curated grants that may be expired before access health is flagged (N7).
_EXPIRY_HEALTHY_MAX_SHARE = 0.5


def _now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def _iso(value: dt.datetime | dt.date | None) -> str | None:
    return value.isoformat() if value is not None else None


def _derive_status(
    *,
    valid_from: dt.datetime,
    expires_at: dt.datetime | None,
    revoked_at: dt.datetime | None,
    is_suspended: bool,
    now: dt.datetime,
) -> str:
    """active | expiring_soon | expired | revoked | suspended — the A02 status chip.

    Built on the canonical ``effective_status`` (revoked → suspended → expired →
    active), then refined: an ACTIVE grant whose expiry is within the soon-window
    becomes ``expiring_soon`` (the amber chip + incident banner trigger)."""
    facts = GrantFacts(valid_from, expires_at, revoked_at, is_suspended)
    status = effective_status(facts, now)
    if status is GrantStatus.ACTIVE and expires_at is not None:
        if expires_at <= now + dt.timedelta(days=EXPIRING_SOON_DAYS):
            return "expiring_soon"
    return str(status)


async def _load_access_rows(
    s: Any, partner_id: uuid.UUID, now: dt.datetime
) -> list[dict[str, Any]]:
    """Read the live access-audit view and attach a derived status per row."""
    result = await s.execute(
        text(
            """
            SELECT grant_public_id, patient_mask, department_label, doctor_name,
                   scope_label, valid_from, expires_at, revoked_at, last_viewed_at,
                   is_suspended, created_at
            FROM admin_agg.access_audit_view
            WHERE partner_id = :pid
            ORDER BY created_at ASC, grant_public_id ASC
            """
        ),
        {"pid": str(partner_id)},
    )
    rows: list[dict[str, Any]] = []
    for r in result.mappings():
        status = _derive_status(
            valid_from=r["valid_from"],
            expires_at=r["expires_at"],
            revoked_at=r["revoked_at"],
            is_suspended=r["is_suspended"],
            now=now,
        )
        rows.append(
            {
                "grant_public_id": str(r["grant_public_id"]),
                "patient_mask": r["patient_mask"],
                "department_label": r["department_label"],
                "doctor_name": r["doctor_name"],
                "scope_label": r["scope_label"],
                "valid_from": _iso(r["valid_from"]),
                "expires_at": _iso(r["expires_at"]),
                "revoked_at": _iso(r["revoked_at"]),
                "last_viewed_at": _iso(r["last_viewed_at"]),
                "status": status,
                # kept for incident timestamps, stripped before the API row
                "_expires_at_dt": r["expires_at"],
                "_revoked_at_dt": r["revoked_at"],
            }
        )
    return rows


def _counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    by = {"active": 0, "expiring_soon": 0, "expired": 0, "revoked": 0, "suspended": 0}
    for r in rows:
        by[r["status"]] = by.get(r["status"], 0) + 1
    return by


def _incidents(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    revoked = [r for r in rows if r["status"] == "revoked"]
    expired = [r for r in rows if r["status"] == "expired"]
    out: list[dict[str, Any]] = []
    if revoked:
        last = max((r["_revoked_at_dt"] for r in revoked if r["_revoked_at_dt"]), default=None)
        out.append({"type": "revoked", "count": len(revoked), "last_event_at": _iso(last)})
    if expired:
        last = max((r["_expires_at_dt"] for r in expired if r["_expires_at_dt"]), default=None)
        out.append({"type": "expired", "count": len(expired), "last_event_at": _iso(last)})
    return out


async def _compliance(
    s: Any, partner_id: uuid.UUID, rows: list[dict[str, Any]]
) -> dict[str, Any]:
    """N3/N4/N5/N7 derived only from admin-visible sources (the audit journal + the
    access view) — never from base clinical/consent tables (INV-ID-3). Mirrors the
    frontend ``selectComputedComplianceState`` colour rule."""
    total = await s.scalar(
        text("SELECT count(*) FROM audit.clinic_admin_audit_view WHERE partner_id = :pid"),
        {"pid": str(partner_id)},
    )
    consent_events = await s.scalar(
        text(
            """
            SELECT count(*) FROM audit.clinic_admin_audit_view
            WHERE partner_id = :pid
              AND event_type IN ('consent_recorded', 'onboarding_committed')
            """
        ),
        {"pid": str(partner_id)},
    )
    n5_audit_log_enabled = bool(total and total > 0)
    n3_consent_recorded = bool(consent_events and consent_events > 0)
    # Vacuously true on an empty curated set (a partner with no grants yet has no
    # scope to leave undefined) — same empty-state handling as N7 below, so the two
    # checks agree on "no grants" instead of N4 silently forcing red.
    n4_scope_defined = all(r["scope_label"] for r in rows)
    if rows:
        expired_share = sum(1 for r in rows if r["status"] == "expired") / len(rows)
        n7_expiry_healthy = expired_share <= _EXPIRY_HEALTHY_MAX_SHARE
    else:
        n7_expiry_healthy = True

    if not (n3_consent_recorded and n4_scope_defined):
        state = "red"
    elif not (n5_audit_log_enabled and n7_expiry_healthy):
        state = "amber"
    else:
        state = "green"
    return {
        "state": state,
        "n3_consent_recorded": n3_consent_recorded,
        "n4_scope_defined": n4_scope_defined,
        "n5_audit_log_enabled": n5_audit_log_enabled,
        "n7_expiry_healthy": n7_expiry_healthy,
    }


async def build_overview(claims: TokenClaims) -> dict[str, Any] | None:
    """A01 «Внедрение» — materialized KPI snapshots + live access panel/incidents/
    compliance. Returns ``None`` if the partner has no seeded snapshot (router → 404)."""
    partner_id = uuid.UUID(claims.partner_id)
    now = _now()
    async with admin_sessionmaker()() as s:
        kpi = await s.scalar(
            select(PilotKpiSnapshot).where(PilotKpiSnapshot.partner_id == partner_id)
        )
        if kpi is None:
            return None

        funnel = (
            await s.scalars(
                select(FunnelSnapshot)
                .where(FunnelSnapshot.partner_id == partner_id)
                .order_by(FunnelSnapshot.position.asc())
            )
        ).all()
        adoption = (
            await s.scalars(
                select(AdoptionSnapshot)
                .where(AdoptionSnapshot.partner_id == partner_id)
                .order_by(AdoptionSnapshot.dimension.asc(), AdoptionSnapshot.position.asc())
            )
        ).all()
        trend = (
            await s.scalars(
                select(KpiTrendPoint)
                .where(KpiTrendPoint.partner_id == partner_id)
                .order_by(KpiTrendPoint.kpi_id.asc(), KpiTrendPoint.day.asc())
            )
        ).all()
        departments = (
            await s.scalars(
                select(DepartmentKpiSnapshot)
                .where(DepartmentKpiSnapshot.partner_id == partner_id)
                .order_by(DepartmentKpiSnapshot.position.asc())
            )
        ).all()

        rows = await _load_access_rows(s, partner_id, now)
        counts = _counts(rows)
        compliance = await _compliance(s, partner_id, rows)

    def _adopt(dimension: str) -> list[dict[str, Any]]:
        return [
            {
                "item_key": a.item_key,
                "label": a.label,
                "sublabel": a.sublabel,
                "invited": a.invited,
                "installed": a.installed,
                "consented": a.consented,
                "granted": a.granted,
                "prepared": a.prepared,
            }
            for a in adoption
            if a.dimension == dimension
        ]

    return {
        "kpis": {
            "onboarded": kpi.onboarded,
            "prep_rate": float(kpi.prep_rate),
            "ocr_rate": float(kpi.ocr_rate),
            "request_response_rate": float(kpi.request_response_rate),
            "period_label": kpi.period_label,
            "as_of": kpi.as_of.isoformat(),
        },
        "goal": {
            "target_onboarded": kpi.target_onboarded,
            "target_date": kpi.target_date.isoformat(),
            "target_label": kpi.target_label,
        },
        "funnel": [{"stage": f.stage, "label": f.label, "count": f.count} for f in funnel],
        "adoption_by_department": _adopt("department"),
        "adoption_by_doctor": _adopt("doctor"),
        "kpi_trend": [
            {"kpi_id": t.kpi_id, "day": t.day.isoformat(), "value": float(t.value)}
            for t in trend
        ],
        "departments": [
            {
                "department_label": d.department_label,
                "connected": d.connected,
                "prep_rate": float(d.prep_rate),
                "overdue": d.overdue,
            }
            for d in departments
        ],
        "access_panel": {
            "active_total": counts["active"] + counts["expiring_soon"],
            "expiring_soon": counts["expiring_soon"],
            "revoked": counts["revoked"],
            "expired": counts["expired"],
        },
        "access_incidents": _incidents(rows),
        "compliance": compliance,
    }


async def build_access_audit(claims: TokenClaims) -> dict[str, Any]:
    """A02 «Журнал доступов» — the curated grant set, masked, with live status."""
    partner_id = uuid.UUID(claims.partner_id)
    now = _now()
    async with admin_sessionmaker()() as s:
        rows = await _load_access_rows(s, partner_id, now)
    counts = _counts(rows)
    api_rows = [
        {k: v for k, v in r.items() if not k.startswith("_")} for r in rows
    ]
    return {
        "as_of": now.isoformat(),
        "counts": {
            "total": len(rows),
            "active": counts["active"],
            "expiring_soon": counts["expiring_soon"],
            "expired": counts["expired"],
            "revoked": counts["revoked"],
        },
        "rows": api_rows,
    }


async def build_audit_journal(claims: TokenClaims, *, limit: int = 50) -> dict[str, Any]:
    """Org-level audit journal off ``clinic_admin_audit_view`` — no subject pseudonym,
    no PII (INV-AU-3). Newest first, capped."""
    partner_id = uuid.UUID(claims.partner_id)
    async with admin_sessionmaker()() as s:
        result = await s.execute(
            text(
                """
                SELECT event_type, actor_role, target_type, created_at, metadata_json
                FROM audit.clinic_admin_audit_view
                WHERE partner_id = :pid
                ORDER BY created_at DESC
                LIMIT :lim
                """
            ),
            {"pid": str(partner_id), "lim": limit},
        )
        rows = [
            {
                "event_type": r["event_type"],
                "actor_role": r["actor_role"],
                "target_type": r["target_type"],
                "created_at": r["created_at"].isoformat(),
                "metadata": r["metadata_json"],
            }
            for r in result.mappings()
        ]
    return {"rows": rows}
