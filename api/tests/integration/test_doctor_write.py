"""Doctor WRITE surface (OCR verdict + acknowledge) end-to-end.

Built via the REAL API flows (onboard patient → patient uploads → doctor acts), not the
demo seed, so they are deterministic and self-contained — mirrors test_doctor_reads.py.

Asserts:
  * the doctor stamps a structuring-metadata verdict on a low-confidence OCR field,
    stamped with the doctor's name + timestamp, and the raw clinical VALUE is unchanged
    (INV-AI-4 — read-only on clinical content);
  * stamping verdicts on every low-confidence field auto-acknowledges the analysis
    (mirrors the frontend footer);
  * the acknowledge verb closes the patient→doctor loop: a patient upload that fulfils a
    plan item advances the request to in_progress, and the doctor's acknowledge advances
    the linked plan item → the request progress derives 'completed';
  * grant-gating — a revoked patient's write returns 404 (existence hidden).
"""

from __future__ import annotations

import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.seed import DEMO_DOCTOR_USERNAME, DEMO_WEB_PASSWORD, seed_demo
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]

_DOCTOR_NAME = "Соколов А.В."


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


async def _upload_analysis(
    c: httpx.AsyncClient,
    auth: dict[str, str],
    *,
    analysis_type: str,
    label: str,
    plan_item_public_id: str | None = None,
) -> dict:
    sign = (await c.post("/v1/uploads/sign", json={}, headers=auth)).json()
    body = {
        "object_key": sign["object_key"],
        "analysis_type": analysis_type,
        "label": label,
        "lab_date": "2026-03-22",
    }
    if plan_item_public_id is not None:
        body["plan_item_public_id"] = plan_item_public_id
    reg = await c.post(
        "/v1/analyses", json=body, headers={**auth, "Idempotency-Key": str(uuid.uuid4())}
    )
    assert reg.status_code == 200, reg.text
    return reg.json()


async def _create_request_with_lab(
    c: httpx.AsyncClient, doc: dict[str, str], pid: str, *, label: str
) -> str:
    r = await c.post(
        f"/v1/doctor/requests?patient_public_id={pid}",
        json={
            "title": "Перед приёмом",
            "body": f"Пожалуйста, сдайте {label} до визита.",
            "intent": "before-visit",
            "items": [{"analysis_type": "HbA1c", "label": label, "kind": "lab"}],
        },
        headers={**doc, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return r.json()["plan_item_public_ids"][0]


# ─── OCR verdict ─────────────────────────────────────────────────────────────────


async def test_verdict_stamps_metadata_axis_and_auto_acknowledges(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Низкая Уверенность Ивановна")
        auth = await _patient_auth(c, phone)
        # Glucose upload yields a low-confidence field via the OCR stub.
        analysis = await _upload_analysis(c, auth, analysis_type="glucose", label="Глюкоза натощак")
        apid = analysis["public_id"]
        low_conf_keys = [f["field_key"] for f in analysis["fields"] if f["low_confidence"]]
        assert low_conf_keys, "expected at least one low-confidence field on the glucose upload"

        doc = await _doctor_auth(c)
        result = None
        for fk in low_conf_keys:
            result = await c.post(
                f"/v1/doctor/patients/{pid}/analyses/{apid}/ocr-fields/{fk}/verdict",
                json={"verdict": "confirmed"},
                headers=doc,
            )
            assert result.status_code == 200, result.text
        body = result.json()

        # The stamped field carries the metadata verdict + doctor identity.
        stamped = {f["field_key"]: f for f in body["fields"]}
        for fk in low_conf_keys:
            assert stamped[fk]["verification"] == "confirmed"
            assert stamped[fk]["verified_by"] == _DOCTOR_NAME
            assert stamped[fk]["verified_at"] is not None

        # All low-confidence fields resolved → analysis auto-acknowledged.
        assert body["status"] == "acknowledged"

    # Read-only on the clinical VALUE: raw_value is untouched by the verdict (INV-AI-4).
    with superuser_engine.connect() as conn:
        raws = conn.execute(
            sa.text(
                "SELECT o.field_key, o.raw_value, o.doctor_metadata_verdict, o.doctor_verdict_by "
                "FROM app.ocr_field o JOIN app.analysis a ON a.internal_id = o.analysis_id "
                "WHERE a.public_id = :a"
            ),
            {"a": apid},
        ).all()
        # The clinical VALUE (raw_value) is preserved verbatim — only the metadata axis moves.
        assert all(raw_value for _k, raw_value, _v, _b in raws)
        assert any(v == "confirmed" and b == _DOCTOR_NAME for _k, _r, v, b in raws)


async def test_verdict_grant_gated_returns_not_found(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Отзыв Доступа Петровна")
        auth = await _patient_auth(c, phone)
        analysis = await _upload_analysis(c, auth, analysis_type="glucose", label="Глюкоза натощак")
        apid = analysis["public_id"]
        fk = next(f["field_key"] for f in analysis["fields"] if f["low_confidence"])

        # Patient revokes the clinic grant → the doctor write must 404 (existence hidden).
        grants = (await c.get("/v1/me/access-grants", headers=auth)).json()
        rv = await c.post(
            f"/v1/me/access-grants/{grants[0]['public_id']}/revoke",
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert rv.status_code == 200

        doc = await _doctor_auth(c)
        r = await c.post(
            f"/v1/doctor/patients/{pid}/analyses/{apid}/ocr-fields/{fk}/verdict",
            json={"verdict": "rejected"},
            headers=doc,
        )
        assert r.status_code == 404, r.text


# ─── Acknowledge — closes the patient→doctor loop ───────────────────────────────


async def test_acknowledge_advances_plan_item_and_completes_request(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Петля Замыкается Ивановна")
        auth = await _patient_auth(c, phone)
        doc = await _doctor_auth(c)

        # Doctor dispatches a request with one lab plan item.
        plan_item_pid = await _create_request_with_lab(
            c, doc, pid, label="Гликированный гемоглобин"
        )

        # Patient uploads an analysis fulfilling the plan item → request in_progress.
        analysis = await _upload_analysis(
            c,
            auth,
            analysis_type="HbA1c",
            label="Гликированный гемоглобин",
            plan_item_public_id=plan_item_pid,
        )
        apid = analysis["public_id"]
        plan = (await c.get("/v1/plan", headers=auth)).json()
        assert plan["doctor_requests"][0]["progress"] == "in_progress"

        # Doctor acknowledges → analysis acknowledged, plan item acknowledged.
        ack = await c.post(
            f"/v1/doctor/patients/{pid}/analyses/{apid}/acknowledge", headers=doc
        )
        assert ack.status_code == 200, ack.text
        assert ack.json()["status"] == "acknowledged"

        # The patient's plan now shows the request completed (derived from item statuses).
        plan2 = (await c.get("/v1/plan", headers=auth)).json()
        assert plan2["doctor_requests"][0]["progress"] == "completed"
        assert all(i["status"] == "acknowledged" for i in plan2["plan_items"])

    with superuser_engine.connect() as conn:
        status = conn.execute(
            sa.text("SELECT status FROM app.analysis WHERE public_id = :a"), {"a": apid}
        ).scalar()
        assert status == "acknowledged"
        # ANALYSIS_ACKNOWLEDGED audit emitted by the doctor.
        n_audit = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event "
                "WHERE event_type = 'analysis_acknowledged' AND actor_role = 'doctor'"
            )
        ).scalar()
        assert n_audit and n_audit >= 1


async def test_acknowledge_is_idempotent(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        pid = await _onboard_patient(c, dept, phone, name="Повтор Идемпотентна")
        auth = await _patient_auth(c, phone)
        doc = await _doctor_auth(c)
        analysis = await _upload_analysis(c, auth, analysis_type="HbA1c", label="HbA1c")
        apid = analysis["public_id"]

        first = await c.post(
            f"/v1/doctor/patients/{pid}/analyses/{apid}/acknowledge", headers=doc
        )
        second = await c.post(
            f"/v1/doctor/patients/{pid}/analyses/{apid}/acknowledge", headers=doc
        )
        assert first.status_code == second.status_code == 200
        assert first.json()["status"] == second.json()["status"] == "acknowledged"

    with superuser_engine.connect() as conn:
        n_audit = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event ae JOIN app.analysis a "
                "ON a.internal_id = ae.target_id "
                "WHERE ae.event_type = 'analysis_acknowledged' AND a.public_id = :a"
            ),
            {"a": apid},
        ).scalar()
        # Idempotent: a second acknowledge does not double-audit.
        assert n_audit == 1
