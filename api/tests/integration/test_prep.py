"""Patient prep lifecycle → doctor queue (the headline live-loop write path).

A live patient marking «Подготовка завершена» must move their own prep label in the
doctor's queue — until this endpoint existed the seed was the only writer of the prep
columns. Built via the REAL API flows; the only DB stand-in is today's appointment (no
appointment-create API in this slice), mirroring test_doctor_reads.py.

Asserts:
  * POST /me/prep/complete sets the queue prep_status to 'ready' and writes a
    prep_completed audit;
  * POST /me/prep/start sets it to 'in_progress';
  * complete is idempotent (second call does not double-audit).
"""

from __future__ import annotations

import datetime as dt
import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.seed import DEMO_DOCTOR_USERNAME, DEMO_WEB_PASSWORD, seed_demo
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


def _fresh_phone() -> str:
    return f"+79{uuid.uuid4().int % 10**9:09d}"


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def _onboard_patient(c: httpx.AsyncClient, dept: str, phone: str, *, name: str) -> str:
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
    # Bind today 10:00 UTC explicitly so the appointment date matches the queue's UTC
    # ``today`` independent of the test connection's session timezone.
    sched = dt.datetime.now(dt.UTC).replace(hour=10, minute=0, second=0, microsecond=0)
    conn.execute(
        sa.text(
            """
            INSERT INTO app.appointment
                (internal_id, public_id, partner_id, patient_internal_id, doctor_id,
                 department_id, type, scheduled_at, status, source, created_at, updated_at)
            SELECT gen_random_uuid(), gen_random_uuid(), p.partner_id, p.internal_id,
                   d.internal_id, p.department_id, 'main',
                   :sched, 'scheduled', 'mock',
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


async def _queue_prep_status(c: httpx.AsyncClient, doc: dict[str, str], pid: str) -> str:
    q = (await c.get("/v1/doctor/queue", headers=doc)).json()
    row = next(r for r in q["rows"] if r["patient_public_id"] == pid)
    return row["prep_status"]


async def test_complete_prep_moves_queue_to_ready(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Готовлюсь Сама Ивановна")
        auth = await _patient_auth(c, phone)
        doc = await _doctor_auth(c)

    with superuser_engine.connect() as conn:
        _today_appointment(conn, patient_public_id=pid)

    async with await _client() as c:
        doc = await _doctor_auth(c)
        # Fresh patient: not started.
        assert await _queue_prep_status(c, doc, pid) == "not_started"

        auth = await _patient_auth(c, phone)
        done = await c.post("/v1/me/prep/complete", json={"time_spent_min": 12}, headers=auth)
        assert done.status_code == 200, done.text
        assert done.json()["prep_status"] == "ready"

        # The doctor's queue now shows the patient as ready.
        assert await _queue_prep_status(c, doc, pid) == "ready"

    with superuser_engine.connect() as conn:
        n_audit = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event ae JOIN app.patient p "
                "ON p.internal_id = ae.target_id "
                "WHERE ae.event_type = 'prep_completed' AND p.public_id = :pid"
            ),
            {"pid": pid},
        ).scalar()
        assert n_audit == 1
        time_spent = conn.execute(
            sa.text("SELECT prep_time_spent_min FROM app.patient WHERE public_id = :pid"),
            {"pid": pid},
        ).scalar()
        assert time_spent == 12


async def test_start_prep_moves_queue_to_in_progress(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Начала Готовиться Петровна")
        auth = await _patient_auth(c, phone)

    with superuser_engine.connect() as conn:
        _today_appointment(conn, patient_public_id=pid)

    async with await _client() as c:
        auth = await _patient_auth(c, phone)
        started = await c.post("/v1/me/prep/start", headers=auth)
        assert started.status_code == 200, started.text
        assert started.json()["prep_status"] == "in_progress"

        doc = await _doctor_auth(c)
        assert await _queue_prep_status(c, doc, pid) == "in_progress"


async def test_complete_prep_is_idempotent(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Дважды Завершила Сергеевна")
        auth = await _patient_auth(c, phone)
        first = await c.post("/v1/me/prep/complete", json={}, headers=auth)
        second = await c.post("/v1/me/prep/complete", json={}, headers=auth)
        assert first.status_code == second.status_code == 200
        assert first.json()["prep_status"] == second.json()["prep_status"] == "ready"

    with superuser_engine.connect() as conn:
        n_audit = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event ae JOIN app.patient p "
                "ON p.internal_id = ae.target_id "
                "WHERE ae.event_type = 'prep_completed' AND p.public_id = :pid"
            ),
            {"pid": pid},
        ).scalar()
        assert n_audit == 1
