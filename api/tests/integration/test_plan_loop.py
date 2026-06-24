"""Slice C end-to-end: doctor creates a request (atomic + idempotent + grant-gated)
→ patient reads own plan → marks seen → upload links a plan item (assigned →
uploaded). Plus cross-partner isolation and the RLS backstop.

Asserts: all-or-nothing write-set (INV-TX-1), idempotent replay (INV-TX-1),
capability re-derived per request — no grant ⇒ 403 (INV-AC-1/2), and patient scope
(INV-AC-5). Outbox payload is PII-free (copy-keys + UUIDs only).
"""

from __future__ import annotations

import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.seed import (
    DEMO_DOCTOR_USERNAME,
    DEMO_WEB_PASSWORD,
    seed_demo,
)
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


def _fresh_phone() -> str:
    return f"+79{uuid.uuid4().int % 10**9:09d}"


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def _onboard_patient(c: httpx.AsyncClient, dept: str, phone: str) -> str:
    r = await c.post(
        "/v1/onboarding/commit",
        json={
            "department_public_id": dept,
            "name": "Иванова Мария Петровна",
            "dob": "1971-05-02",
            "gender": "female",
            "phone": phone,
            "consents": [
                {
                    "consent_type": "pdn_general",
                    "legal_text_version": "2026.04.23",
                    "ack_mechanism": "scroll_to_end",
                }
            ],
            "document_hash": "sha256:demo",
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return r.json()["patient_public_id"]


async def _patient_auth(c: httpx.AsyncClient, phone: str) -> dict[str, str]:
    tok = (
        await c.post("/v1/auth/patient/otp/verify", json={"phone": phone, "code": "0000"})
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


async def _doctor_auth(c: httpx.AsyncClient) -> dict[str, str]:
    tok = (
        await c.post(
            "/v1/auth/web/login",
            json={"username": DEMO_DOCTOR_USERNAME, "password": DEMO_WEB_PASSWORD},
        )
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _request_body() -> dict:
    return {
        "title": "Подготовка к приёму",
        "body": "Пожалуйста, сдайте анализы до визита.",
        "intent": "before-visit",
        "items": [
            {
                "analysis_type": "HbA1c",
                "label": "Гликированный гемоглобин",
                "reason": "Контроль динамики",
                "kind": "lab",
                "due_date": "2026-03-28",
            },
            {
                "analysis_type": "glucose",
                "label": "Глюкоза натощак",
                "kind": "lab",
            },
        ],
    }


async def _seed_second_partner() -> str:
    """Create a SECOND partner clinic (+ clinic + dept) so cross-partner isolation can
    be tested. LegalTextVersion is global (already seeded by seed_demo), so onboarding
    into this partner's department needs no extra legal-text seeding. Idempotent."""
    from app.db.models.core import Clinic, Department, Partner
    from app.db.session import app_sessionmaker

    async with app_sessionmaker()() as session:
        async with session.begin():
            partner = await session.scalar(
                sa.select(Partner).where(Partner.short_name == "КБ2")
            )
            if partner is None:
                partner = Partner(name="Клиника Б", short_name="КБ2")
                session.add(partner)
                await session.flush()
                clinic = Clinic(
                    partner_id=partner.internal_id, name="Клиника Б", short_name="КБ2"
                )
                session.add(clinic)
                await session.flush()
                dept = Department(
                    partner_id=partner.internal_id,
                    clinic_id=clinic.internal_id,
                    name="Отделение Б",
                )
                session.add(dept)
                await session.flush()
            else:
                dept = await session.scalar(
                    sa.select(Department).where(Department.partner_id == partner.internal_id)
                )
            return str(dept.public_id)


async def test_doctor_request_atomic_idempotent_and_patient_reads_plan(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        patient_pid = await _onboard_patient(c, dept, phone)
        doc = await _doctor_auth(c)

        # Idempotency-Key required
        missing = await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_pid},
            json=_request_body(),
            headers=doc,
        )
        assert missing.status_code == 400

        key = str(uuid.uuid4())
        r1 = await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_pid},
            json=_request_body(),
            headers={**doc, "Idempotency-Key": key},
        )
        assert r1.status_code == 200, r1.text
        out1 = r1.json()
        assert out1["intent"] == "before-visit"
        assert len(out1["plan_item_public_ids"]) == 2
        assert out1["seen_by_patient"] is False
        assert out1["progress"] == "open"  # derived: nothing uploaded yet
        request_pid = out1["public_id"]

        # Idempotent replay → identical request, no double-create (INV-TX-1)
        r2 = await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_pid},
            json=_request_body(),
            headers={**doc, "Idempotency-Key": key},
        )
        assert r2.json()["public_id"] == request_pid

        # Patient reads own plan
        auth = await _patient_auth(c, phone)
        plan = (await c.get("/v1/plan", headers=auth)).json()
        assert len(plan["doctor_requests"]) == 1
        assert len(plan["plan_items"]) == 2
        assert plan["doctor_requests"][0]["public_id"] == request_pid
        assert plan["doctor_requests"][0]["progress"] == "open"
        assert all(i["status"] == "assigned" for i in plan["plan_items"])

        # Mark seen (idempotent flip)
        seen = await c.post(f"/v1/plan/requests/{request_pid}/seen", headers=auth)
        assert seen.status_code == 200, seen.text
        assert seen.json()["seen_by_patient"] is True
        again = await c.post(f"/v1/plan/requests/{request_pid}/seen", headers=auth)
        assert again.json()["seen_by_patient"] is True

    # Exactly one request + two items + exactly one PII-free notification (INV-TX-1)
    with superuser_engine.connect() as conn:
        n_req = conn.execute(
            sa.text("SELECT count(*) FROM app.doctor_request WHERE public_id = :r"),
            {"r": request_pid},
        ).scalar()
        assert n_req == 1
        n_items = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.plan_item p "
                "JOIN app.doctor_request d ON d.internal_id = p.doctor_request_id "
                "WHERE d.public_id = :r"
            ),
            {"r": request_pid},
        ).scalar()
        assert n_items == 2
        payload = conn.execute(
            sa.text(
                "SELECT payload_json FROM app.outbox_event "
                "WHERE event_type = 'send_notification' "
                "AND payload_json->>'related_id' = "
                "(SELECT internal_id::text FROM app.doctor_request WHERE public_id = :r)"
            ),
            {"r": request_pid},
        ).scalar_one()
        # PII-free: copy-keys + UUIDs only, no names/values/free-text
        assert payload["type"] == "doctor_request"
        assert payload["title_key"] == "notification.doctor_request.title"
        assert "Иванова" not in str(payload)
        assert "Гликированный" not in str(payload)
        # Cache invalidations enqueued in the same txn (prep screen + doctor queue)
        n_invalidations = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.outbox_event "
                "WHERE event_type IN ('invalidate_prep','invalidate_doctor_queue') "
                "AND payload_json->>'request_id' = :r"
            ),
            {"r": request_pid},
        ).scalar()
        assert n_invalidations == 2
        # The patient's first 'seen' (via the API above) is on the audit trail
        n_seen_audit = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event "
                "WHERE event_type = 'doctor_request_seen' AND target_id = "
                "(SELECT internal_id FROM app.doctor_request WHERE public_id = :r)"
            ),
            {"r": request_pid},
        ).scalar()
        assert n_seen_audit == 1


async def test_doctor_request_requires_active_grant(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        patient_pid = await _onboard_patient(c, dept, phone)
        auth = await _patient_auth(c, phone)
        doc = await _doctor_auth(c)

        # Patient revokes the clinic grant → doctor's NEXT request must 403 (INV-AC-2)
        grants = (await c.get("/v1/me/access-grants", headers=auth)).json()
        grant_id = grants[0]["public_id"]
        rv = await c.post(
            f"/v1/me/access-grants/{grant_id}/revoke",
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert rv.status_code == 200

        blocked = await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_pid},
            json=_request_body(),
            headers={**doc, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert blocked.status_code == 403, blocked.text


async def test_upload_advances_linked_plan_item(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        patient_pid = await _onboard_patient(c, dept, phone)
        doc = await _doctor_auth(c)
        created = await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_pid},
            json=_request_body(),
            headers={**doc, "Idempotency-Key": str(uuid.uuid4())},
        )
        item_pid = created.json()["plan_item_public_ids"][0]

        auth = await _patient_auth(c, phone)
        sign = (await c.post("/v1/uploads/sign", json={}, headers=auth)).json()
        reg = await c.post(
            "/v1/analyses",
            json={
                "object_key": sign["object_key"],
                "analysis_type": "HbA1c",
                "label": "Гликированный гемоглобин",
                "lab_date": "2026-03-22",
                "plan_item_public_id": item_pid,
            },
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert reg.status_code == 200, reg.text
        analysis_pid = reg.json()["public_id"]

        # plan now shows the item advanced to 'uploaded' and linked to the analysis
        plan = (await c.get("/v1/plan", headers=auth)).json()
        linked = next(i for i in plan["plan_items"] if i["public_id"] == item_pid)
        assert linked["status"] == "uploaded"
        assert linked["linked_analysis_public_id"] == analysis_pid
        # One of two items uploaded → request doneness derives to 'in_progress'
        assert plan["doctor_requests"][0]["progress"] == "in_progress"


async def test_plan_is_patient_scoped(superuser_engine: sa.Engine) -> None:
    """A second patient never sees the first patient's plan (INV-AC-5)."""
    dept = (await seed_demo())["department_public_id"]
    phone_a, phone_b = _fresh_phone(), _fresh_phone()
    async with await _client() as c:
        patient_a = await _onboard_patient(c, dept, phone_a)
        await _onboard_patient(c, dept, phone_b)
        doc = await _doctor_auth(c)
        await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_a},
            json=_request_body(),
            headers={**doc, "Idempotency-Key": str(uuid.uuid4())},
        )

        auth_b = await _patient_auth(c, phone_b)
        plan_b = (await c.get("/v1/plan", headers=auth_b)).json()
        assert plan_b["doctor_requests"] == []
        assert plan_b["plan_items"] == []


async def test_rls_backstop_hides_other_patient_plan(superuser_engine: sa.Engine) -> None:
    """RLS backstop (same partner, different patient): inside a patient-scoped txn (GUC
    set), a plan_item belonging to a DIFFERENT patient is invisible even to a 'global'
    query (INV-AC-5). Cross-PARTNER isolation is covered separately below."""
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        patient_pid = await _onboard_patient(c, dept, phone)
        doc = await _doctor_auth(c)
        await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_pid},
            json=_request_body(),
            headers={**doc, "Idempotency-Key": str(uuid.uuid4())},
        )

    # As the least-privileged app role, with the GUC pinned to a DIFFERENT patient,
    # the policy hides this patient's rows.
    app_dsn = sa.engine.make_url(
        __import__("app.core.config", fromlist=["get_settings"]).get_settings().database_url_app
    ).set(drivername="postgresql+psycopg")
    eng = sa.create_engine(app_dsn, poolclass=sa.pool.NullPool, future=True)
    other = str(uuid.uuid4())
    with eng.connect() as conn:
        conn.execute(sa.text("SELECT set_config('app.current_internal_id', :iid, false)"), {"iid": other})
        visible = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.plan_item p "
                "JOIN app.doctor_request d ON d.internal_id = p.doctor_request_id "
                "WHERE d.partner_id IS NOT NULL"
            )
        ).scalar()
    assert visible == 0


async def test_doctor_cannot_create_request_cross_partner(superuser_engine: sa.Engine) -> None:
    """Isolation (INV-TX-2): a doctor from partner A (Эндокор) cannot create a request for a
    patient who belongs to partner B. The cross-partner guard returns 404 BEFORE the
    grant check (a grant miss is 403), proving the partner guard is what blocks."""
    await seed_demo()  # partner A (Эндокор) + demo doctor (sokolov)
    dept_b = await _seed_second_partner()  # partner B
    phone = _fresh_phone()
    async with await _client() as c:
        patient_b = await _onboard_patient(c, dept_b, phone)  # belongs to partner B
        doc_a = await _doctor_auth(c)  # demo doctor belongs to partner A

        resp = await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": patient_b},
            json=_request_body(),
            headers={**doc_a, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert resp.status_code == 404, resp.text
