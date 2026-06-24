"""Doctor READ surface (D01 queue + D02 rich summary) end-to-end.

Fixtures are built via the REAL API flows (onboard patient → doctor creates a request
→ patient uploads an analysis with OCR), NOT the demo seed, so they are deterministic
and self-contained — mirrors tests/integration/test_plan_loop.py.

Asserts:
  * queue returns today's appointment patients with correct prep status + grant-gating
    (a revoked patient drops out of the queue);
  * summary returns the 3 rich sections, with ACKNOWLEDGED-only gating (a pending upload
    is invisible to the key-metric grid but visible in prep-uploads + as an OCR gap),
    low-confidence flags, ranked questions, prep meta, and the disclaimer copy-key;
  * opening the summary writes a ``doctor_view`` audit + stamps ``last_viewed_at``;
  * no-grant ⇒ 404 (existence hidden), and cross-partner ⇒ 404.

The doctor acknowledge / OCR-verify slice is not built yet (no acknowledge endpoint),
so the ACKNOWLEDGED positive path is exercised by flipping ``analysis.status`` directly
in the DB (raw SQL, same idiom test_plan_loop uses for its DB assertions) and creating
today's appointment directly — neither has an API surface in this slice.
"""

from __future__ import annotations

import datetime as dt
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


async def _add_complaint(
    c: httpx.AsyncClient, auth: dict[str, str], text: str, *, kind: str, priority: int
) -> None:
    r = await c.post(
        "/v1/complaints",
        json={"text": text, "kind": kind, "priority": priority},
        headers=auth,
    )
    assert r.status_code == 200, r.text


async def _upload_analysis(
    c: httpx.AsyncClient,
    auth: dict[str, str],
    *,
    analysis_type: str,
    label: str,
    lab_date: str = "2026-03-22",
) -> str:
    sign = (await c.post("/v1/uploads/sign", json={}, headers=auth)).json()
    reg = await c.post(
        "/v1/analyses",
        json={
            "object_key": sign["object_key"],
            "analysis_type": analysis_type,
            "label": label,
            "lab_date": lab_date,
        },
        headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert reg.status_code == 200, reg.text
    return reg.json()["public_id"]


def _today_appointment(
    conn: sa.engine.Connection, *, patient_public_id: str, doctor_username: str
) -> None:
    """Create today's MAIN appointment for the doctor↔patient pair. There is no
    appointment-create API in this slice, so the queue fixture seeds it directly.

    ``scheduled_at`` is bound as an explicit UTC instant (today 10:00 UTC) rather than
    ``date_trunc('day', now())`` so the appointment date matches the queue's UTC ``today``
    regardless of the test connection's session timezone (the real seed likewise builds
    UTC appointments — INV consistency, not a local-tz artifact)."""
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
        {"pid": patient_public_id, "doc": doctor_username, "sched": sched},
    )
    conn.commit()


def _acknowledge_analysis(conn: sa.engine.Connection, analysis_public_id: str) -> None:
    """Flip an analysis to ACKNOWLEDGED so it reaches the acknowledged-only metric grid.
    The doctor acknowledge slice has no API yet — this is the DB stand-in."""
    conn.execute(
        sa.text("UPDATE app.analysis SET status = 'acknowledged' WHERE public_id = :a"),
        {"a": analysis_public_id},
    )
    conn.commit()


def _set_diagnosis(conn: sa.engine.Connection, patient_public_id: str, label: str) -> None:
    conn.execute(
        sa.text(
            """
            INSERT INTO app.condition_context
                (internal_id, partner_id, patient_internal_id, label,
                 is_confirmed_by_clinic, source, created_at, updated_at)
            SELECT gen_random_uuid(), p.partner_id, p.internal_id, :label, true, 'clinic',
                   now(), now()
            FROM app.patient p WHERE p.public_id = :pid
            """
        ),
        {"pid": patient_public_id, "label": label},
    )
    conn.commit()


def _mark_prep_complete(conn: sa.engine.Connection, patient_public_id: str) -> None:
    conn.execute(
        sa.text(
            "UPDATE app.patient SET prep_started_at = now() - interval '1 day', "
            "prep_completed_at = now(), prep_time_spent_min = 15 WHERE public_id = :pid"
        ),
        {"pid": patient_public_id},
    )
    conn.commit()


def _mark_prep_started(conn: sa.engine.Connection, patient_public_id: str) -> None:
    conn.execute(
        sa.text(
            "UPDATE app.patient SET prep_started_at = now() - interval '1 day' "
            "WHERE public_id = :pid"
        ),
        {"pid": patient_public_id},
    )
    conn.commit()


async def _seed_second_partner() -> str:
    """A SECOND partner (+ clinic + dept) for cross-partner isolation. Idempotent."""
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


# ─── D01 queue ──────────────────────────────────────────────────────────────────


async def test_queue_returns_todays_patients_with_prep_status_and_grant_gating(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone_ready, phone_started, phone_revoked = (
        _fresh_phone(),
        _fresh_phone(),
        _fresh_phone(),
    )
    async with await _client() as c:
        pid_ready = await _onboard_patient(c, dept, phone_ready, name="Готова Анна Ивановна")
        pid_started = await _onboard_patient(
            c, dept, phone_started, name="Впроцессе Борис Петрович"
        )
        pid_revoked = await _onboard_patient(
            c, dept, phone_revoked, name="Отозван Виктор Сергеевич"
        )

        # ready patient uploads an analysis (HbA1c → out-of-range indicator)
        auth_ready = await _patient_auth(c, phone_ready)
        await _upload_analysis(
            c, auth_ready, analysis_type="HbA1c", label="Гликированный гемоглобин"
        )

        # revoked patient revokes the clinic grant → must drop out of the queue
        auth_revoked = await _patient_auth(c, phone_revoked)
        grants = (await c.get("/v1/me/access-grants", headers=auth_revoked)).json()
        rv = await c.post(
            f"/v1/me/access-grants/{grants[0]['public_id']}/revoke",
            headers={**auth_revoked, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert rv.status_code == 200

    with superuser_engine.connect() as conn:
        for pid in (pid_ready, pid_started, pid_revoked):
            _today_appointment(conn, patient_public_id=pid, doctor_username=DEMO_DOCTOR_USERNAME)
        _mark_prep_complete(conn, pid_ready)
        _mark_prep_started(conn, pid_started)

    async with await _client() as c:
        doc = await _doctor_auth(c)
        q = (await c.get("/v1/doctor/queue", headers=doc)).json()
        rows = {r["patient_public_id"]: r for r in q["rows"]}

        # Grant-gating: the revoked patient is absent even though they have an appointment.
        assert pid_revoked not in rows
        assert pid_ready in rows
        assert pid_started in rows

        assert rows[pid_ready]["prep_status"] == "ready"
        assert rows[pid_started]["prep_status"] == "in_progress"

        # Out-of-range indicator surfaced for the ready patient's HbA1c (7.8 > 6.5).
        oor = rows[pid_ready]["out_of_range_indicators"]
        assert any(i["field"] == "HbA1c" and i["range"] == "above" for i in oor)
        assert rows[pid_ready]["has_analyses"] is True


async def test_queue_excludes_other_doctor_and_other_day(superuser_engine: sa.Engine) -> None:
    """The queue is today + this doctor only. A patient with no appointment today never
    appears, even with an active grant."""
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Безприёма Галина Олеговна")
        doc = await _doctor_auth(c)
        q = (await c.get("/v1/doctor/queue", headers=doc)).json()
        # No appointment created for this patient → absent.
        assert all(r["patient_public_id"] != pid for r in q["rows"])


# ─── D02 summary ────────────────────────────────────────────────────────────────


async def test_summary_three_rich_sections_with_acknowledged_gating(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Иванова Мария Петровна")
        auth = await _patient_auth(c, phone)

        # Three patient questions, priority 1..3. #2 about kidneys → pairs with the
        # микроальбумин plan item for the Vasily «жалобы + план» merge.
        await _add_complaint(
            c, auth, "Менять ли схему лечения?", kind="question", priority=1
        )
        await _add_complaint(
            c, auth, "Нужно ли проверить почки?", kind="question", priority=2
        )
        await _add_complaint(
            c, auth, "Тревожно перед приёмом.", kind="complaint", priority=3
        )

        # Two uploads: HbA1c (confident, 7.8 → above) and glucose (low-confidence 7.1).
        hba_pid = await _upload_analysis(
            c, auth, analysis_type="HbA1c", label="Гликированный гемоглобин"
        )
        await _upload_analysis(c, auth, analysis_type="glucose", label="Глюкоза натощак")

    with superuser_engine.connect() as conn:
        _set_diagnosis(conn, pid, "Сахарный диабет 2 типа")
        # Acknowledge ONLY the HbA1c → it reaches the metric grid; glucose stays pending.
        _acknowledge_analysis(conn, hba_pid)
        _mark_prep_complete(conn, pid)

    async with await _client() as c:
        doc = await _doctor_auth(c)
        s = (await c.get(f"/v1/doctor/patients/{pid}/summary", headers=doc)).json()

        # Envelope.
        assert s["display_name"] == "Иванова Мария Петровна"
        assert s["disclaimer_key"] == "disclaimer.not_a_substitute"
        # Clinical-context demographics for the record header.
        assert s["dob"] == "1971-05-02"
        assert s["gender"] == "female"
        assert s["diagnosis"] == {"label": "Сахарный диабет 2 типа", "confirmed": True}

        # Section 1: Анализы — ACKNOWLEDGED-only gating.
        key_fields = {m["field"]: m for m in s["analyses"]["key_metrics"]}
        assert "HbA1c" in key_fields  # acknowledged → in the grid
        assert key_fields["HbA1c"]["range"] == "above"
        assert "Глюкоза" not in key_fields  # pending upload → NOT in the grid
        assert s["analyses"]["has_acknowledged_metrics"] is True
        # Prep-uploads use ALL analyses (both show up regardless of acknowledgement).
        upload_labels = {u["label"] for u in s["analyses"]["prep_uploads"]}
        assert "Гликированный гемоглобин" in upload_labels
        assert "Глюкоза натощак" in upload_labels

        # Low-confidence flag is carried on the glucose analyte in prep-uploads.
        glucose_upload = next(
            u for u in s["analyses"]["prep_uploads"] if u["label"] == "Глюкоза натощак"
        )
        assert any(a["low_confidence"] for a in glucose_upload["analytes"])

        # Section 2: Пробелы — merged agenda credited to Vasily, with the data-gap and
        # the low-confidence OCR (from the still-pending glucose) surfaced.
        assert s["gaps"]["credit"] == "Что заметил Василий"
        all_sources = {src for a in s["gaps"]["agenda"] for src in a["sources"]}
        assert "data-gap" in all_sources  # ТТГ never measured for a diabetic
        assert "ocr-low-conf" in all_sources  # pending glucose still flags the gap

        # Section 3: Вопросы — ranked by priority asc, capped at 3.
        ranked = s["questions"]["ranked"]
        assert [q["priority"] for q in ranked] == [1, 2, 3]
        assert s["questions"]["total"] == 3

        # Prep meta.
        assert s["prep_meta"]["prepared_at"] is not None
        assert s["prep_meta"]["time_spent_min"] == 15
        assert s["prep_meta"]["questions_count"] == 3
        # docs_count counts ONLY identity/referral documents, never the
        # MedicalDocument(analysis_result) every upload auto-creates. The two analyses
        # above therefore contribute 0 here (FE selectPrepMeta parity, s.documents).
        assert s["prep_meta"]["docs_count"] == 0


async def test_summary_writes_doctor_view_audit_and_stamps_last_viewed(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Аудит Тест Петрович")
        doc = await _doctor_auth(c)
        r = await c.get(f"/v1/doctor/patients/{pid}/summary", headers=doc)
        assert r.status_code == 200, r.text

    with superuser_engine.connect() as conn:
        # doctor_view audit row written, with PII/medical-free metadata only.
        row = conn.execute(
            sa.text(
                "SELECT actor_role, metadata_json FROM audit.audit_event ae "
                "JOIN app.patient p ON p.internal_id = ae.target_id "
                "WHERE ae.event_type = 'doctor_view' AND p.public_id = :pid"
            ),
            {"pid": pid},
        ).one()
        assert row[0] == "doctor"
        meta = row[1] or {}
        # Metadata is counts only — no names / values / free text.
        assert "Аудит" not in str(meta)
        assert set(meta).issubset(
            {"section_count", "key_metric_count", "agenda_item_count", "question_count"}
        )

        # last_viewed_at projection stamped on the active grant.
        last_viewed = conn.execute(
            sa.text(
                "SELECT g.last_viewed_at FROM app.access_grant g "
                "JOIN app.patient p ON p.internal_id = g.patient_internal_id "
                "WHERE p.public_id = :pid AND g.revoked_at IS NULL"
            ),
            {"pid": pid},
        ).scalar()
        assert last_viewed is not None


async def test_summary_no_grant_is_not_found(superuser_engine: sa.Engine) -> None:
    """No active grant ⇒ 404 (existence hidden, never 403 that would confirm the
    patient exists)."""
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Бездоступа Нина Львовна")
        auth = await _patient_auth(c, phone)
        grants = (await c.get("/v1/me/access-grants", headers=auth)).json()
        rv = await c.post(
            f"/v1/me/access-grants/{grants[0]['public_id']}/revoke",
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert rv.status_code == 200

        doc = await _doctor_auth(c)
        r = await c.get(f"/v1/doctor/patients/{pid}/summary", headers=doc)
        assert r.status_code == 404, r.text


async def test_summary_cross_partner_is_not_found(superuser_engine: sa.Engine) -> None:
    """A doctor from partner A cannot read a summary for a partner-B patient (INV-TX-2).
    Returns 404 (cross-partner existence never revealed)."""
    await seed_demo()  # partner A (Эндокор) + demo doctor
    dept_b = await _seed_second_partner()
    phone = _fresh_phone()
    async with await _client() as c:
        patient_b = await _onboard_patient(c, dept_b, phone, name="Чужая Ольга Павловна")
        doc_a = await _doctor_auth(c)  # belongs to partner A
        r = await c.get(f"/v1/doctor/patients/{patient_b}/summary", headers=doc_a)
        assert r.status_code == 404, r.text


async def test_summary_unknown_patient_is_not_found(superuser_engine: sa.Engine) -> None:
    await seed_demo()
    async with await _client() as c:
        doc = await _doctor_auth(c)
        r = await c.get(f"/v1/doctor/patients/{uuid.uuid4()}/summary", headers=doc)
        assert r.status_code == 404, r.text


async def test_summary_read_does_not_mutate_clinical_content(
    superuser_engine: sa.Engine,
) -> None:
    """The summary read is READ-ONLY on clinical content: analyses / complaints / OCR
    values are unchanged after a read; only the audit + last_viewed_at projection move."""
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Неизменна Тамара Кирилловна")
        auth = await _patient_auth(c, phone)
        await _add_complaint(c, auth, "Вопрос о почках.", kind="question", priority=1)
        await _upload_analysis(
            c, auth, analysis_type="HbA1c", label="Гликированный гемоглобин"
        )

    def _snapshot(conn: sa.engine.Connection) -> tuple[int, int, str | None]:
        n_analysis = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.analysis a JOIN app.patient p "
                "ON p.internal_id = a.patient_internal_id WHERE p.public_id = :pid"
            ),
            {"pid": pid},
        ).scalar()
        n_complaint = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.complaint cm JOIN app.patient p "
                "ON p.internal_id = cm.patient_internal_id WHERE p.public_id = :pid"
            ),
            {"pid": pid},
        ).scalar()
        raw = conn.execute(
            sa.text(
                "SELECT max(o.raw_value) FROM app.ocr_field o JOIN app.analysis a "
                "ON a.internal_id = o.analysis_id JOIN app.patient p "
                "ON p.internal_id = a.patient_internal_id WHERE p.public_id = :pid"
            ),
            {"pid": pid},
        ).scalar()
        return int(n_analysis or 0), int(n_complaint or 0), raw

    with superuser_engine.connect() as conn:
        before = _snapshot(conn)

    async with await _client() as c:
        doc = await _doctor_auth(c)
        assert (await c.get(f"/v1/doctor/patients/{pid}/summary", headers=doc)).status_code == 200

    with superuser_engine.connect() as conn:
        after = _snapshot(conn)
    assert before == after
