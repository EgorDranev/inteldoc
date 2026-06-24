"""Admin cockpit demo seed (Slice D) — the partner-admin «Внедрение» + «Журнал доступов».

Two halves, matching the service (spec §5.9):
  * **Materialized snapshots** into ``admin_agg`` — the four A01 KPIs, the adoption
    funnel, per-department/-doctor breakdowns, the 30-day KPI trend, and the
    departments table. These are the brief's scripted big numbers (412 onboarded,
    68 % prep, 84 % OCR, 71 % response) that no small live cohort could compute.
  * **Live grants** — 4 departments, 4 doctors, and the brief's 20 access grants as
    REAL ``access_grant`` rows (+ a PII-free ``access_grant_display`` row each), so the
    A02 audit, the A01 access panel, incidents and compliance are derived live and move
    on a revoke / expiry. Grant dates are anchored RELATIVE to now (like the doctor demo)
    so the status mix (active / истекает скоро / истёк / отозван) holds whenever it runs.

Idempotent: the presence of any ``access_grant_display`` row for Эндокор is the sentinel.

Run: ``uv run python -m app.seed.seed --admin``
"""

from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any

from sqlalchemy import select

from app.db.models.access import AccessGrant
from app.db.models.admin_agg import (
    AccessGrantDisplay,
    AdoptionSnapshot,
    DepartmentKpiSnapshot,
    FunnelSnapshot,
    KpiTrendPoint,
    PilotKpiSnapshot,
)
from app.db.models.core import Clinic, Department, Doctor, Partner, Patient
from app.db.models.identity import PatientPii
from app.db.session import app_sessionmaker
from app.domain.enums import CreatedByType, DataScope, GrantedToType
from app.seed.seed import seed_doctor_demo

# ─── Departments + their attending doctor (brief §5.2 / §5.4) ───────────────────

_DEPARTMENTS: list[dict[str, Any]] = [
    {
        "key": "endo_adult",
        "code": "A",
        "label": "Эндокринология взрослая",
        "doctor": "Др. Соколов А.В.",
        "doctor_row": "Соколов А.В.",
        "connected": 186,
        "prep_rate": 0.74,
        "overdue": 3,
        "invited": 443,
        "installed": 288,
        "consented": 227,
    },
    {
        "key": "endo_child",
        "code": "C",
        "label": "Эндокринология детская",
        "doctor": "Др. Гусева И.М.",
        "doctor_row": "Гусева И.М.",
        "connected": 92,
        "prep_rate": 0.61,
        "overdue": 1,
        "invited": 219,
        "installed": 143,
        "consented": 112,
    },
    {
        "key": "diabetology",
        "code": "D",
        "label": "Диабетология",
        "doctor": "Др. Романова Е.Н.",
        "doctor_row": "Романова Е.Н.",
        "connected": 88,
        "prep_rate": 0.69,
        "overdue": 5,
        "invited": 210,
        "installed": 136,
        "consented": 107,
    },
    {
        "key": "thyroidology",
        "code": "T",
        "label": "Тиреоидология",
        "doctor": "Др. Климова О.А.",
        "doctor_row": "Климова О.А.",
        "connected": 46,
        "prep_rate": 0.58,
        "overdue": 0,
        "invited": 110,
        "installed": 71,
        "consented": 56,
    },
]


def _prepared(d: dict[str, Any]) -> int:
    connected: int = d["connected"]
    prep_rate: float = d["prep_rate"]
    return round(connected * prep_rate)


# ─── The 20 access grants (brief §5.4) — (mask, dept_code, scope_code, status) ──
# dept codes: A взрослая · C детская · D Диабетология · T Тиреоидология.
# scope codes: P «Анализы и подготовка» · N «Анализы» · L «Анализы и план».
# granted = connected; status drives the relative grant dates.

_GRANTS: list[tuple[str, str, str, str]] = [
    ("М. Иванова", "A", "P", "active"),
    ("С. Петров", "A", "P", "active"),
    ("Е. Сидорова", "A", "N", "active"),
    ("А. Волков", "A", "P", "expiring_soon"),
    ("О. Нечаева", "A", "N", "expiring_soon"),
    ("И. Лебедев", "A", "P", "expiring_soon"),
    ("Н. Морозова", "D", "L", "active"),
    ("Д. Тихонов", "D", "P", "active"),
    ("В. Орлова", "D", "N", "active"),
    ("Г. Беляев", "T", "P", "active"),
    ("Т. Зайцева", "T", "N", "active"),
    ("Р. Соловьёв", "C", "P", "active"),
    ("К. Фомин", "A", "N", "expired"),
    ("Л. Яковлева", "D", "L", "expired"),
    ("Б. Карпов", "T", "N", "expired"),
    ("Ю. Ефимова", "C", "N", "expired"),
    ("П. Громов", "A", "P", "revoked"),
    ("З. Новикова", "D", "N", "revoked"),
    ("Х. Мельникова", "A", "N", "revoked"),
    ("Ф. Тарасов", "T", "P", "active"),
]

# Pilot reference frame — FIXED calendar anchors (parity with the frontend mock
# adminMockData.ts: asOf 2026-04-25, goal «к 15 мая» → 2026-05-15). Unlike grant
# windows (which anchor to now so statuses drift correctly), the KPI snapshot date
# and the goal milestone are fixed dates tied to a fixed label, so they must NOT move.
_KPI_AS_OF = dt.datetime(2026, 4, 25, 8, 0, tzinfo=dt.UTC)
_GOAL_TARGET_DATE = dt.date(2026, 5, 15)

_DEPT_BY_CODE: dict[str, str] = {d["code"]: d["label"] for d in _DEPARTMENTS}
_SCOPE_BY_CODE: dict[str, str] = {
    "P": "Анализы и подготовка",
    "N": "Анализы",
    "L": "Анализы и план",
}
_SCOPE_TO_DATA_SCOPE = {
    "P": DataScope.ANALYSES_PREP,
    "L": DataScope.ANALYSES_PREP,
    "N": DataScope.ANALYSES,
}


def _grant_dates(
    status: str, now: dt.datetime
) -> tuple[dt.datetime, dt.datetime | None, dt.datetime | None]:
    """(valid_from, expires_at, revoked_at) anchored relative to ``now`` so the derived
    status holds whenever the seed runs (parity with the doctor demo's date anchoring)."""
    if status == "active":
        return now - dt.timedelta(days=30), now + dt.timedelta(days=30), None
    if status == "expiring_soon":
        return now - dt.timedelta(days=25), now + dt.timedelta(days=2), None
    if status == "expired":
        return now - dt.timedelta(days=60), now - dt.timedelta(days=5), None
    if status == "revoked":
        return now - dt.timedelta(days=50), now + dt.timedelta(days=20), now - dt.timedelta(days=4)
    raise ValueError(f"unknown status {status}")


def _gender_for(mask: str) -> str:
    surname = mask.split(" ", 1)[-1]
    return "female" if surname.endswith(("а", "я")) else "male"


def _trend_points(now: dt.datetime) -> list[tuple[str, dt.date, float]]:
    """30 daily points for prepRate (rising 55→74 % with a soft dip ~day 12) and
    ocrRate (78→86 %). Values are fractions; the A01 chart maps them to the 50–80 % band."""
    points: list[tuple[str, dt.date, float]] = []
    today = now.date()
    for i in range(30):
        day = today - dt.timedelta(days=29 - i)
        prep = 0.55 + i * 0.0065
        if 10 <= i <= 13:  # the brief's small dip around day 12
            prep -= 0.04
        prep = max(0.5, min(0.8, prep))
        ocr = max(0.5, min(0.92, 0.78 + i * 0.003))
        points.append(("prepRate", day, round(prep, 4)))
        points.append(("ocrRate", day, round(ocr, 4)))
    return points


async def seed_admin_demo() -> dict[str, Any]:
    # Onboards the 3 canonical patients via the REAL onboarding flow, so the audit
    # journal carries onboarding_committed / consent_recorded / access_granted events
    # under Эндокор (these drive the admin compliance N3/N5 checks + the journal read).
    # Those 3 grants have no display row → excluded from the admin access aggregates.
    await seed_doctor_demo()
    now = dt.datetime.now(tz=dt.UTC)

    async with app_sessionmaker()() as session:
        async with session.begin():
            partner = await session.scalar(select(Partner).where(Partner.short_name == "Эндокор"))
            assert partner is not None, "base Эндокор seed missing"
            clinic = await session.scalar(
                select(Clinic).where(Clinic.partner_id == partner.internal_id)
            )
            assert clinic is not None
            partner_id = partner.internal_id

            # Idempotency sentinel — display rows already present ⇒ nothing to do.
            existing = await session.scalar(
                select(AccessGrantDisplay.internal_id).where(
                    AccessGrantDisplay.partner_id == partner_id
                ).limit(1)
            )
            if existing is not None:
                return {"partner_public_id": str(partner.public_id), "admin_seeded": False}

            # ── Departments + attending doctors ──
            dept_by_label: dict[str, Department] = {}
            doctor_by_dept: dict[str, Doctor] = {}
            doctor_display_by_dept: dict[str, str] = {d["label"]: d["doctor"] for d in _DEPARTMENTS}
            for d in _DEPARTMENTS:
                dept = Department(
                    partner_id=partner_id, clinic_id=clinic.internal_id, name=d["label"]
                )
                session.add(dept)
                await session.flush()
                dept_by_label[d["label"]] = dept
                doctor = Doctor(
                    partner_id=partner_id,
                    clinic_id=clinic.internal_id,
                    department_id=dept.internal_id,
                    name=d["doctor_row"],
                )
                session.add(doctor)
                await session.flush()
                doctor_by_dept[d["label"]] = doctor

            # ── A01 materialized snapshots ──
            session.add(
                PilotKpiSnapshot(
                    partner_id=partner_id,
                    onboarded=412,
                    prep_rate=0.68,
                    ocr_rate=0.84,
                    request_response_rate=0.71,
                    period_label="За 30 дней",
                    as_of=_KPI_AS_OF,
                    target_onboarded=500,
                    target_date=_GOAL_TARGET_DATE,
                    target_label="к 15 мая",
                )
            )

            funnel_totals = {
                "invited": sum(d["invited"] for d in _DEPARTMENTS),
                "installed": sum(d["installed"] for d in _DEPARTMENTS),
                "consented": sum(d["consented"] for d in _DEPARTMENTS),
                "granted": sum(d["connected"] for d in _DEPARTMENTS),
                "prepared": sum(_prepared(d) for d in _DEPARTMENTS),
            }
            funnel_labels = {
                "invited": "Приглашены",
                "installed": "Установили приложение",
                "consented": "Дали согласие",
                "granted": "Выдали доступ",
                "prepared": "Подготовились",
            }
            for pos, stage in enumerate(
                ("invited", "installed", "consented", "granted", "prepared")
            ):
                session.add(
                    FunnelSnapshot(
                        partner_id=partner_id,
                        position=pos,
                        stage=stage,
                        label=funnel_labels[stage],
                        count=funnel_totals[stage],
                    )
                )

            for pos, d in enumerate(_DEPARTMENTS):
                # department dimension
                session.add(
                    AdoptionSnapshot(
                        partner_id=partner_id,
                        dimension="department",
                        position=pos,
                        item_key=d["key"],
                        label=d["label"],
                        sublabel=None,
                        invited=d["invited"],
                        installed=d["installed"],
                        consented=d["consented"],
                        granted=d["connected"],
                        prepared=_prepared(d),
                    )
                )
                # doctor dimension (one attending doctor per department here)
                session.add(
                    AdoptionSnapshot(
                        partner_id=partner_id,
                        dimension="doctor",
                        position=pos,
                        item_key=f"doc_{d['key']}",
                        label=d["doctor"],
                        sublabel=d["label"],
                        invited=d["invited"],
                        installed=d["installed"],
                        consented=d["consented"],
                        granted=d["connected"],
                        prepared=_prepared(d),
                    )
                )
                session.add(
                    DepartmentKpiSnapshot(
                        partner_id=partner_id,
                        position=pos,
                        department_label=d["label"],
                        connected=d["connected"],
                        prep_rate=d["prep_rate"],
                        overdue=d["overdue"],
                    )
                )

            for kpi_id, day, value in _trend_points(now):
                session.add(
                    KpiTrendPoint(partner_id=partner_id, kpi_id=kpi_id, day=day, value=value)
                )

            # ── 20 live grants + PII-free display rows ──
            for i, (mask, dept_code, scope_code, status) in enumerate(_GRANTS):
                dept_label = _DEPT_BY_CODE[dept_code]
                scope_label = _SCOPE_BY_CODE[scope_code]
                dept = dept_by_label[dept_label]
                doctor = doctor_by_dept[dept_label]
                pii = PatientPii(
                    partner_id=partner_id,
                    full_name=mask,  # isolated in identity; admin never reads it
                    birth_date=dt.date(1970, 1, 1),
                    gender=_gender_for(mask),
                    phone_e164=f"+79992{i:06d}",
                )
                session.add(pii)
                await session.flush()
                patient = Patient(
                    internal_id=pii.internal_id,
                    partner_id=partner_id,
                    clinic_id=clinic.internal_id,
                    department_id=dept.internal_id,
                    attending_doctor_id=doctor.internal_id,
                )
                session.add(patient)
                await session.flush()

                valid_from, expires_at, revoked_at = _grant_dates(status, now)
                grant = AccessGrant(
                    partner_id=partner_id,
                    patient_internal_id=pii.internal_id,
                    granted_to_type=str(GrantedToType.CLINIC),
                    granted_to_id=clinic.internal_id,
                    data_scope=str(_SCOPE_TO_DATA_SCOPE[scope_code]),
                    valid_from=valid_from,
                    expires_at=expires_at,
                    revoked_at=revoked_at,
                    created_by_type=str(CreatedByType.PATIENT),
                )
                session.add(grant)
                await session.flush()
                session.add(
                    AccessGrantDisplay(
                        grant_internal_id=grant.internal_id,
                        partner_id=partner_id,
                        patient_mask=mask,
                        doctor_name=doctor_display_by_dept[dept_label],
                        department_label=dept_label,
                        scope_label=scope_label,
                    )
                )

    return {
        "partner_public_id": str(partner.public_id),
        "admin_seeded": True,
        "grants": len(_GRANTS),
    }


if __name__ == "__main__":
    print(asyncio.run(seed_admin_demo()))
