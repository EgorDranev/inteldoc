"""Slice E full-path smoke (spec §14) — the whole pilot story in one test, over the
REAL HTTP endpoints (no shortcuts beyond the appointment + clock the API has no surface
for). Complements the focused per-slice tests: this proves the legs compose end-to-end.

  onboard → grant → upload → OCR-stub → doctor reads queue + summary → acknowledge →
  doctor sends plan → patient reads + completes → prep complete → revoke → expire.

OCR runs synchronously via the stub (no MinIO/Tesseract needed); the appointment +
the expiry clock are set directly (no API surface for them in the MVP).
"""

from __future__ import annotations

import datetime as dt
import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.seed import DEMO_DOCTOR_USERNAME, DEMO_WEB_PASSWORD, seed_demo
from app.services import access_service
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


def _fresh_phone() -> str:
    return f"+79{uuid.uuid4().int % 10**9:09d}"


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def _onboard(c: httpx.AsyncClient, dept: str, phone: str, *, name: str) -> str:
    r = await c.post(
        "/v1/onboarding/commit",
        json={
            "department_public_id": dept,
            "name": name,
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


def _today_appointment(conn: sa.engine.Connection, *, patient_public_id: str) -> None:
    sched = dt.datetime.now(dt.UTC).replace(hour=10, minute=0, second=0, microsecond=0)
    conn.execute(
        sa.text(
            """
            INSERT INTO app.appointment
                (internal_id, public_id, partner_id, patient_internal_id, doctor_id,
                 department_id, type, scheduled_at, status, source, created_at, updated_at)
            SELECT gen_random_uuid(), gen_random_uuid(), p.partner_id, p.internal_id,
                   d.internal_id, p.department_id, 'main', :sched, 'scheduled', 'mock',
                   now(), now()
            FROM app.patient p
            JOIN app.user_account ua ON ua.username = :doc
            JOIN app.doctor d ON d.user_account_id = ua.internal_id
            WHERE p.public_id = :pid
            """
        ),
        {"pid": patient_public_id, "doc": DEMO_DOCTOR_USERNAME, "sched": sched},
    )
    conn.commit()


async def _upload(
    c: httpx.AsyncClient, auth: dict[str, str], *, kind: str, label: str, plan_item: str | None = None
) -> str:
    sign = (await c.post("/v1/uploads/sign", json={}, headers=auth)).json()
    payload = {
        "object_key": sign["object_key"],
        "analysis_type": kind,
        "label": label,
        "lab_date": "2026-03-22",
    }
    if plan_item is not None:
        payload["plan_item_public_id"] = plan_item
    reg = await c.post(
        "/v1/analyses", json=payload, headers={**auth, "Idempotency-Key": str(uuid.uuid4())}
    )
    assert reg.status_code == 200, reg.text
    assert reg.json()["status"] == "structured"  # OCR stub ran synchronously
    return reg.json()["public_id"]


async def test_full_pilot_path_smoke(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()

    async with await _client() as c:
        # 1. Onboard → an active clinic grant is created atomically.
        pid = await _onboard(c, dept, phone, name="Иванова Мария Петровна")
        auth = await _patient_auth(c, phone)
        grants = (await c.get("/v1/me/access-grants", headers=auth)).json()
        assert grants and grants[0]["status"] == "active"
        grant_id = grants[0]["public_id"]

    # 2. Today's appointment (no API surface) so the doctor queue sees them.
    with superuser_engine.connect() as conn:
        _today_appointment(conn, patient_public_id=pid)

    async with await _client() as c:
        auth = await _patient_auth(c, phone)
        # 3. Patient uploads an analysis → OCR stub structures it.
        analysis_pid = await _upload(c, auth, kind="HbA1c", label="Гликированный гемоглобин")

        doc = await _doctor_auth(c)
        # 4. Doctor queue shows the patient, prep not started, has an analysis.
        queue = (await c.get("/v1/doctor/queue", headers=doc)).json()
        row = next((r for r in queue["rows"] if r["patient_public_id"] == pid), None)
        assert row is not None
        assert row["prep_status"] == "not_started"
        assert row["has_analyses"] is True

        # 5. Doctor summary surfaces the upload.
        summary = (await c.get(f"/v1/doctor/patients/{pid}/summary", headers=doc)).json()
        assert summary["display_name"] == "Иванова Мария Петровна"
        assert any(
            u["public_id"] == analysis_pid for u in summary["analyses"]["prep_uploads"]
        )

        # 6. Doctor acknowledges → analysis enters the clinical grid.
        ack = await c.post(
            f"/v1/doctor/patients/{pid}/analyses/{analysis_pid}/acknowledge", headers=doc
        )
        assert ack.status_code == 200, ack.text
        assert ack.json()["status"] == "acknowledged"

        # 7. Doctor sends a plan (request + 2 items) atomically.
        req = await c.post(
            "/v1/doctor/requests",
            params={"patient_public_id": pid},
            json={
                "title": "Перед приёмом",
                "body": "Сдайте анализы до визита.",
                "intent": "before-visit",
                "items": [
                    {"analysis_type": "glucose", "label": "Глюкоза натощак", "kind": "lab"},
                    {"analysis_type": "creatinine", "label": "Креатинин", "kind": "lab"},
                ],
            },
            headers={**doc, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert req.status_code == 200, req.text
        request_pid = req.json()["public_id"]
        item_pid = req.json()["plan_item_public_ids"][0]

        # 8. Patient reads the plan + marks it seen.
        auth = await _patient_auth(c, phone)
        plan = (await c.get("/v1/plan", headers=auth)).json()
        assert any(r["public_id"] == request_pid for r in plan["doctor_requests"])
        assert len(plan["plan_items"]) == 2
        seen = await c.post(f"/v1/plan/requests/{request_pid}/seen", headers=auth)
        assert seen.json()["seen_by_patient"] is True

        # 9. Patient uploads the requested glucose linked to the plan item → advances it.
        await _upload(c, auth, kind="glucose", label="Глюкоза натощак", plan_item=item_pid)
        plan = (await c.get("/v1/plan", headers=auth)).json()
        linked = next(i for i in plan["plan_items"] if i["public_id"] == item_pid)
        assert linked["status"] == "uploaded"

        # 10. Patient completes preparation → queue label flips to «готов».
        done = await c.post("/v1/me/prep/complete", json={"time_spent_min": 15}, headers=auth)
        assert done.status_code == 200, done.text
        doc = await _doctor_auth(c)
        queue = (await c.get("/v1/doctor/queue", headers=doc)).json()
        row = next(r for r in queue["rows"] if r["patient_public_id"] == pid)
        assert row["prep_status"] == "ready"

        # 11. Patient revokes the grant → the doctor's NEXT queue read drops them.
        rv = await c.post(
            f"/v1/me/access-grants/{grant_id}/revoke",
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert rv.status_code == 200
        doc = await _doctor_auth(c)
        queue = (await c.get("/v1/doctor/queue", headers=doc)).json()
        assert all(r["patient_public_id"] != pid for r in queue["rows"])

    # 12. Expire leg: a second patient's grant lapses → the nightly job emits
    #     access_expired (the compliance-critical scheduled path).
    phone_b = _fresh_phone()
    async with await _client() as c:
        pid_b = await _onboard(c, dept, phone_b, name="Срокова Елена Ивановна")
        auth_b = await _patient_auth(c, phone_b)
        grant_b = (await c.get("/v1/me/access-grants", headers=auth_b)).json()[0]["public_id"]

    with superuser_engine.connect() as conn:
        conn.execute(
            sa.text(
                "UPDATE app.access_grant SET expires_at = now() - interval '1 day' "
                "WHERE public_id = :g"
            ),
            {"g": grant_b},
        )
        conn.commit()

    result = await access_service.expire_due_grants()
    assert result["expired"] >= 1

    with superuser_engine.connect() as conn:
        n = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event ae "
                "JOIN app.access_grant g ON g.internal_id = ae.target_id "
                "WHERE ae.event_type = 'access_expired' AND g.public_id = :g"
            ),
            {"g": grant_b},
        ).scalar()
        assert n == 1
        _ = pid_b
