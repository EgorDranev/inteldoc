"""Support / integrity tickets (Slice E) end-to-end.

Asserts the dual-destination routing contract (spec §5.6, §7.8, INV-SR-1..3):
  * a tech-only ticket → ONE IntelDoc routing; the confirmation carries «куда ушло»
    (named destination) + «когда ждать» (SLA), both mandatory;
  * an integrity ticket (not_my_analysis) → TWO routings (IntelDoc-security + Эндокор),
    is_integrity_report=True;
  * suspicious_activity → a suspicious_activity_reported audit + the dual route;
  * each routing enqueues its own outbox row; dispatching them flips per-destination
    delivery_status to delivered (a dropped route would be visible, never hidden);
  * the audit is PII-free — the patient's report body never reaches audit metadata;
  * the create is idempotent by Idempotency-Key.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.seed import seed_demo
from app.services import outbox_service
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


def _fresh_phone() -> str:
    return f"+79{uuid.uuid4().int % 10**9:09d}"


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def _onboard(c: httpx.AsyncClient, dept: str, phone: str) -> str:
    r = await c.post(
        "/v1/onboarding/commit",
        json={
            "department_public_id": dept,
            "name": "Поддержкин Пётр Петрович",
            "dob": "1971-05-02",
            "gender": "male",
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


async def _auth(c: httpx.AsyncClient, phone: str) -> dict[str, str]:
    tok = (
        await c.post("/v1/auth/patient/otp/verify", json={"phone": phone, "code": "0000"})
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


async def _create(
    c: httpx.AsyncClient, auth: dict[str, str], *, category: str, body: str | None = None
) -> dict:
    r = await c.post(
        "/v1/support/tickets",
        json={"category": category, "body": body},
        headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r.status_code == 200, r.text
    return r.json()


async def test_tech_issue_routes_to_single_inteldoc_destination(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        await _onboard(c, dept, phone)
        auth = await _auth(c, phone)
        t = await _create(c, auth, category="tech_issue", body="Кнопка не работает")

    assert t["is_integrity_report"] is False
    assert len(t["destinations"]) == 1
    d = t["destinations"][0]
    assert d["destination"] == "inteldoc_support"
    # «Куда ушло» + «когда ждать» — both present (INV-SR-2).
    assert d["label"] == "поддержка IntelDoc"
    assert d["sla_label"] and d["sla_hours"] > 0


async def test_integrity_report_routes_to_two_destinations(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        await _onboard(c, dept, phone)
        auth = await _auth(c, phone)
        t = await _create(c, auth, category="not_my_analysis", body="Это не мой анализ")

    assert t["is_integrity_report"] is True
    dests = {d["destination"] for d in t["destinations"]}
    # Dual destination by default: IntelDoc (аудит/безопасность) + Эндокор (исправление).
    assert dests == {"inteldoc_security", "partner_admin"}
    assert all(d["sla_label"] for d in t["destinations"])


async def test_suspicious_activity_emits_audit_and_dual_route(
    superuser_engine: sa.Engine,
) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        await _onboard(c, dept, phone)
        auth = await _auth(c, phone)
        t = await _create(c, auth, category="suspicious_activity", body="Странная активность")
    assert len(t["destinations"]) == 2

    with superuser_engine.connect() as conn:
        n = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event ae JOIN app.support_ticket st "
                "ON st.internal_id = ae.target_id "
                "WHERE ae.event_type = 'suspicious_activity_reported' AND st.public_id = :id"
            ),
            {"id": t["public_id"]},
        ).scalar()
        assert n == 1


async def test_outbox_dispatch_marks_routings_delivered(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        await _onboard(c, dept, phone)
        auth = await _auth(c, phone)
        t = await _create(c, auth, category="not_my_clinic", body="Не моя клиника")

        # Before dispatch: pending.
        before = await c.get(f"/v1/support/tickets/{t['public_id']}", headers=auth)
        assert all(d["delivery_status"] == "pending" for d in before.json()["destinations"])

    # Two outbox rows enqueued (one per routing).
    with superuser_engine.connect() as conn:
        enq = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.outbox_event "
                "WHERE event_type = 'dispatch_ticket_routing' AND status = 'pending'"
            )
        ).scalar()
        assert enq >= 2

    # Drain the outbox fully (the session DB accumulates events across tests, so one
    # bounded pass may not reach this ticket's routings) → each transitions to delivered.
    for _ in range(20):
        if (await outbox_service.dispatch_pending(limit=200))["scanned"] == 0:
            break

    async with await _client() as c:
        auth = await _auth(c, phone)
        after = await c.get(f"/v1/support/tickets/{t['public_id']}", headers=auth)
        assert all(d["delivery_status"] == "delivered" for d in after.json()["destinations"])


async def test_audit_is_pii_free(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    secret = "СЕКРЕТ-ТЕКСТ-ЖАЛОБЫ"
    async with await _client() as c:
        await _onboard(c, dept, phone)
        auth = await _auth(c, phone)
        t = await _create(c, auth, category="not_my_analysis", body=secret)

    with superuser_engine.connect() as conn:
        meta = conn.execute(
            sa.text(
                "SELECT metadata_json FROM audit.audit_event ae JOIN app.support_ticket st "
                "ON st.internal_id = ae.target_id "
                "WHERE ae.event_type = 'support_ticket_created' AND st.public_id = :id"
            ),
            {"id": t["public_id"]},
        ).scalar()
    assert secret not in str(meta)
    assert set(meta).issubset({"category", "is_integrity", "destination_count"})


async def test_create_is_idempotent(superuser_engine: sa.Engine) -> None:
    dept = (await seed_demo())["department_public_id"]
    phone = _fresh_phone()
    async with await _client() as c:
        await _onboard(c, dept, phone)
        auth = await _auth(c, phone)
        key = str(uuid.uuid4())
        body = {"category": "tech_issue", "body": "повтор"}
        r1 = await c.post("/v1/support/tickets", json=body, headers={**auth, "Idempotency-Key": key})
        r2 = await c.post("/v1/support/tickets", json=body, headers={**auth, "Idempotency-Key": key})
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["public_id"] == r2.json()["public_id"]

    with superuser_engine.connect() as conn:
        # Scoped to THIS patient (the session DB accumulates across tests).
        n = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.support_ticket st "
                "JOIN identity.patient_pii pii ON pii.internal_id = st.patient_internal_id "
                "WHERE pii.phone_e164 = :phone"
            ),
            {"phone": phone},
        ).scalar()
        # Only one ticket created despite two POSTs with the same key.
        assert n == 1
