"""Admin cockpit (Slice D) end-to-end — A01 overview, A02 access audit, journal.

Asserts:
  * overview returns the materialized KPIs / funnel / adoption / trend / departments
    with the brief's scripted numbers (412 onboarded, 68 % prep, …);
  * the access audit returns the 20 curated grants, masked, with the right live status
    mix (active / истекает скоро / истёк / отозван) and counts;
  * a direct revoke on a display-backed grant flips its status on the next read (the
    view is LIVE, not a snapshot);
  * the audit journal reads off clinic_admin_audit_view — no audit_subject_id, no PII;
  * the role gate rejects a doctor token;
  * the ``admin_readonly`` DB role is structurally PII-blind (INV-ID-3): it can read the
    admin_agg aggregates but the database REFUSES identity / clinical SELECT.
"""

from __future__ import annotations

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.admin_seed import seed_admin_demo
from app.seed.seed import DEMO_ADMIN_USERNAME, DEMO_DOCTOR_USERNAME, DEMO_WEB_PASSWORD
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def _web_auth(c: httpx.AsyncClient, username: str) -> dict[str, str]:
    tok = (
        await c.post(
            "/v1/auth/web/login",
            json={"username": username, "password": DEMO_WEB_PASSWORD},
        )
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


# ─── A01 overview ────────────────────────────────────────────────────────────────


async def test_overview_kpis_funnel_departments(superuser_engine: sa.Engine) -> None:
    await seed_admin_demo()
    async with await _client() as c:
        admin = await _web_auth(c, DEMO_ADMIN_USERNAME)
        r = await c.get("/v1/admin/overview", headers=admin)
        assert r.status_code == 200, r.text
        o = r.json()

        # Materialized headline KPIs (brief §5.1).
        assert o["kpis"]["onboarded"] == 412
        assert o["kpis"]["prep_rate"] == pytest.approx(0.68)
        assert o["kpis"]["ocr_rate"] == pytest.approx(0.84)
        assert o["kpis"]["request_response_rate"] == pytest.approx(0.71)

        # Funnel is monotonic and ends at granted=412 (sum of department connected).
        funnel = {f["stage"]: f["count"] for f in o["funnel"]}
        assert funnel["granted"] == 412
        counts = [
            funnel["invited"], funnel["installed"], funnel["consented"],
            funnel["granted"], funnel["prepared"],
        ]
        assert counts == sorted(counts, reverse=True)

        # Departments table (brief §5.2).
        depts = {d["department_label"]: d for d in o["departments"]}
        assert depts["Эндокринология взрослая"]["connected"] == 186
        assert depts["Диабетология"]["overdue"] == 5
        assert depts["Тиреоидология"]["overdue"] == 0

        # Adoption split by department + doctor.
        assert len(o["adoption_by_department"]) == 4
        assert len(o["adoption_by_doctor"]) == 4

        # Trend carries both series.
        trend_kpis = {t["kpi_id"] for t in o["kpi_trend"]}
        assert {"prepRate", "ocrRate"} <= trend_kpis

        # Live access panel from the 20 curated grants.
        assert o["access_panel"] == {
            "active_total": 13,  # 10 active + 3 expiring-soon
            "expiring_soon": 3,
            "revoked": 3,
            "expired": 4,
        }
        incidents = {i["type"]: i["count"] for i in o["access_incidents"]}
        assert incidents == {"revoked": 3, "expired": 4}

        # Compliance derives from admin-visible sources only and is green.
        assert o["compliance"]["state"] == "green"
        assert o["compliance"]["n3_consent_recorded"] is True
        assert o["compliance"]["n5_audit_log_enabled"] is True


# ─── A02 access audit ────────────────────────────────────────────────────────────


async def test_access_audit_counts_masking_and_status(superuser_engine: sa.Engine) -> None:
    await seed_admin_demo()
    async with await _client() as c:
        admin = await _web_auth(c, DEMO_ADMIN_USERNAME)
        r = await c.get("/v1/admin/access", headers=admin)
        assert r.status_code == 200, r.text
        a = r.json()

        assert a["counts"] == {
            "total": 20, "active": 10, "expiring_soon": 3, "expired": 4, "revoked": 3,
        }

        by_mask = {row["patient_mask"]: row for row in a["rows"]}
        # Canonical demo patient is present and masked first-initial + surname.
        assert "М. Иванова" in by_mask
        assert by_mask["М. Иванова"]["department_label"] == "Эндокринология взрослая"
        assert by_mask["М. Иванова"]["doctor_name"] == "Др. Соколов А.В."
        # Status derivation across the mix.
        assert by_mask["А. Волков"]["status"] == "expiring_soon"
        assert by_mask["К. Фомин"]["status"] == "expired"
        assert by_mask["П. Громов"]["status"] == "revoked"
        assert by_mask["С. Петров"]["status"] == "active"

        # No full names / phones leak — every identifier is a mask «И. Фамилия».
        for row in a["rows"]:
            assert row["patient_mask"].count(".") == 1


async def test_access_audit_is_live_on_revoke(superuser_engine: sa.Engine) -> None:
    """Revoking a display-backed grant directly (a patient-side revoke stand-in) flips
    its admin status on the next read — proving the view is live, not materialized."""
    await seed_admin_demo()
    async with await _client() as c:
        admin = await _web_auth(c, DEMO_ADMIN_USERNAME)
        before = (await c.get("/v1/admin/access", headers=admin)).json()
    target = next(r for r in before["rows"] if r["status"] == "active")

    with superuser_engine.connect() as conn:
        conn.execute(
            sa.text("UPDATE app.access_grant SET revoked_at = now() WHERE public_id = :g"),
            {"g": target["grant_public_id"]},
        )
        conn.commit()

    async with await _client() as c:
        admin = await _web_auth(c, DEMO_ADMIN_USERNAME)
        after = (await c.get("/v1/admin/access", headers=admin)).json()
    after_row = next(r for r in after["rows"] if r["grant_public_id"] == target["grant_public_id"])
    assert after_row["status"] == "revoked"
    assert after["counts"]["revoked"] == before["counts"]["revoked"] + 1
    assert after["counts"]["active"] == before["counts"]["active"] - 1


# ─── Audit journal ───────────────────────────────────────────────────────────────


async def test_audit_journal_is_pii_free(superuser_engine: sa.Engine) -> None:
    await seed_admin_demo()
    async with await _client() as c:
        admin = await _web_auth(c, DEMO_ADMIN_USERNAME)
        r = await c.get("/v1/admin/audit", headers=admin)
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]

    assert rows, "journal should carry onboarding/consent/access events from the seed"
    serialized = str(rows)
    # No subject pseudonym key, no patient names in the org-level journal (INV-AU-3).
    assert "audit_subject_id" not in serialized
    assert "Иванова" not in serialized and "Мария" not in serialized
    event_types = {row["event_type"] for row in rows}
    assert event_types & {"onboarding_committed", "consent_recorded", "access_granted"}


# ─── Role gate + DB-level PII-blindness ──────────────────────────────────────────


async def test_admin_endpoints_reject_doctor_token(superuser_engine: sa.Engine) -> None:
    await seed_admin_demo()
    async with await _client() as c:
        doctor = await _web_auth(c, DEMO_DOCTOR_USERNAME)
        for path in ("/v1/admin/overview", "/v1/admin/access", "/v1/admin/audit"):
            r = await c.get(path, headers=doctor)
            assert r.status_code == 401, f"{path}: {r.status_code}"


def test_admin_readonly_role_is_db_pii_blind(admin_engine_sync: sa.Engine) -> None:
    """The compliance floor (INV-ID-3): the database itself refuses the admin role any
    identity / clinical read, while permitting the admin_agg aggregates + audit view."""
    with admin_engine_sync.connect() as conn:
        # Permitted — the aggregate snapshots + live access view + clinic audit view.
        conn.execute(sa.text("SELECT count(*) FROM admin_agg.pilot_kpi_snapshot"))
        conn.execute(sa.text("SELECT count(*) FROM admin_agg.access_audit_view"))
        conn.execute(sa.text("SELECT count(*) FROM audit.clinic_admin_audit_view"))

    # Refused — identity PII and clinical base tables (permission/usage denied).
    for stmt in (
        "SELECT * FROM identity.patient_pii LIMIT 1",
        "SELECT * FROM app.patient LIMIT 1",
        "SELECT * FROM app.analysis LIMIT 1",
    ):
        with admin_engine_sync.connect() as conn:
            with pytest.raises(sa.exc.DBAPIError):
                conn.execute(sa.text(stmt))
