"""Slice A end-to-end: onboarding commit → login → access journal → revoke.

Asserts the keystone invariants: atomic + idempotent onboarding (INV-TX-1),
phone-dedup (Q4), revoke as one txn writing grant + audit + outbox (INV-RV-1),
and identity edit resetting verification.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.seed import seed_demo
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


def _fresh_phone() -> str:
    return f"+79{uuid.uuid4().int % 10**9:09d}"


def _consents() -> list[dict]:
    return [
        {"consent_type": "pdn_general", "legal_text_version": "2026.04.23", "ack_mechanism": "scroll_to_end"},
        {"consent_type": "clinic_transfer", "legal_text_version": "2026.05.27", "ack_mechanism": "scroll_to_end"},
        {"consent_type": "pdn_special", "legal_text_version": "2026.04.23", "ack_mechanism": "scroll_to_end", "sms_confirmed": True},
        {"consent_type": "marketing", "legal_text_version": "2026.04.23", "ack_mechanism": "direct_tick", "channels": ["email", "sms"]},
    ]


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


@pytest.fixture
async def department_id() -> str:
    ids = await seed_demo()  # idempotent
    return ids["department_public_id"]


def _commit_body(dept: str, phone: str) -> dict:
    return {
        "department_public_id": dept,
        "name": "Волков Сергей Николаевич",
        "dob": "1968-03-12",
        "gender": "male",
        "phone": phone,
        "oms": "7700000000000002",
        "consents": _consents(),
        "document_hash": "sha256:demo",
    }


async def test_onboarding_commit_is_atomic_idempotent_and_dedupes(department_id: str) -> None:
    phone = _fresh_phone()
    body = _commit_body(department_id, phone)
    async with await _client() as c:
        # commit requires Idempotency-Key
        missing = await c.post("/v1/onboarding/commit", json=body)
        assert missing.status_code == 400

        key = str(uuid.uuid4())
        r1 = await c.post("/v1/onboarding/commit", json=body, headers={"Idempotency-Key": key})
        assert r1.status_code == 200, r1.text
        out1 = r1.json()
        assert out1["deduplicated"] is False
        assert out1["grant"]["status"] == "active"
        assert out1["grant"]["expires_at"] is None  # indefinite (Q3)

        # replay same key → identical result, no double-create (INV-TX-1)
        r2 = await c.post("/v1/onboarding/commit", json=body, headers={"Idempotency-Key": key})
        assert r2.json()["patient_public_id"] == out1["patient_public_id"]

        # re-scan: same phone, different key → resolves to existing (Q4)
        r3 = await c.post(
            "/v1/onboarding/commit", json=body, headers={"Idempotency-Key": str(uuid.uuid4())}
        )
        assert r3.json()["deduplicated"] is True
        assert r3.json()["patient_public_id"] == out1["patient_public_id"]


async def test_login_access_journal_and_revoke_one_txn(
    department_id: str, superuser_engine: sa.Engine
) -> None:
    phone = _fresh_phone()
    async with await _client() as c:
        commit = await c.post(
            "/v1/onboarding/commit",
            json=_commit_body(department_id, phone),
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        assert commit.status_code == 200, commit.text
        grant_id = commit.json()["grant"]["public_id"]

        # patient logs in
        tok = (
            await c.post("/v1/auth/patient/otp/verify", json={"phone": phone, "code": "0000"})
        ).json()
        auth = {"Authorization": f"Bearer {tok['access_token']}"}

        # access journal shows one active grant
        grants = (await c.get("/v1/me/access-grants", headers=auth)).json()
        assert len(grants) == 1 and grants[0]["status"] == "active"

        # /me returns identity via the resolver
        me = (await c.get("/v1/me", headers=auth)).json()
        assert me["identity"]["name"].startswith("Волков")

        # revoke
        rv = await c.post(
            f"/v1/me/access-grants/{grant_id}/revoke",
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert rv.status_code == 200
        assert rv.json()["status"] == "revoked"

    # INV-RV-1: revoke wrote grant.revoked_at + audit + outbox, all committed together
    with superuser_engine.connect() as conn:
        revoked_at = conn.execute(
            sa.text("SELECT revoked_at FROM app.access_grant WHERE public_id = :g"),
            {"g": grant_id},
        ).scalar()
        assert revoked_at is not None
        audit_n = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event "
                "WHERE event_type = 'access_revoked' AND target_id = "
                "(SELECT internal_id FROM app.access_grant WHERE public_id = :g)"
            ),
            {"g": grant_id},
        ).scalar()
        assert audit_n == 1
        outbox_n = conn.execute(
            sa.text(
                "SELECT count(*) FROM app.outbox_event "
                "WHERE event_type IN ('revoke_access','invalidate_summary','invalidate_doctor_queue') "
                "AND payload_json->>'grant_id' = :g"
            ),
            {"g": grant_id},
        ).scalar()
        assert outbox_n == 3


async def test_identity_edit_resets_verification_and_extend_on_revoked_404(
    department_id: str,
) -> None:
    phone = _fresh_phone()
    async with await _client() as c:
        commit = await c.post(
            "/v1/onboarding/commit",
            json=_commit_body(department_id, phone),
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        grant_id = commit.json()["grant"]["public_id"]
        tok = (
            await c.post("/v1/auth/patient/otp/verify", json={"phone": phone, "code": "0000"})
        ).json()
        auth = {"Authorization": f"Bearer {tok['access_token']}"}

        patched = await c.patch("/v1/me/identity", json={"name": "Волков С. Н."}, headers=auth)
        assert patched.status_code == 200
        assert patched.json()["name"] == "Волков С. Н."
        assert patched.json()["identity_verified_at"] is None

        # revoke then extend → 404 (revoked grant is not extendable)
        await c.post(
            f"/v1/me/access-grants/{grant_id}/revoke",
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        ext = await c.post(
            f"/v1/me/access-grants/{grant_id}/extend",
            json={"new_expires_at": None},
            headers={**auth, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert ext.status_code == 404
