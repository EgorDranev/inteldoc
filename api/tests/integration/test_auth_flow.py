"""Auth round-trip against live infra: patient OTP, web login, refresh, logout.

Seeds minimal accounts via the superuser engine (fresh ids/phone per run, so no
cross-run unique-key collisions), then drives the async app via httpx.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.core.security import hash_password
from app.main import app
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


@pytest.fixture
def seeded(superuser_engine: sa.Engine) -> dict[str, str]:
    """Insert Эндокор + one patient account + one doctor account. Returns handles."""
    ids = {k: uuid.uuid4() for k in (
        "partner", "clinic", "dept", "patient", "pat_user", "doc", "doc_user"
    )}
    national = f"9{uuid.uuid4().int % 10**9:09d}"
    phone = f"+7{national}"
    username = f"doc_{uuid.uuid4().hex[:8]}"
    pwd_hash = hash_password("secret")

    with superuser_engine.begin() as c:
        c.execute(sa.text(
            "INSERT INTO app.partner (internal_id, public_id, name, short_name, created_at, updated_at)"
            " VALUES (:i, :p, 'Медицинский центр «Эндокор»', 'Эндокор', now(), now())"
        ), {"i": ids["partner"], "p": uuid.uuid4()})
        c.execute(sa.text(
            "INSERT INTO app.clinic (internal_id, public_id, partner_id, name, short_name, created_at, updated_at)"
            " VALUES (:i, :p, :pa, 'Эндокор', 'Эндокор', now(), now())"
        ), {"i": ids["clinic"], "p": uuid.uuid4(), "pa": ids["partner"]})
        c.execute(sa.text(
            "INSERT INTO app.department (internal_id, public_id, partner_id, clinic_id, name, created_at, updated_at)"
            " VALUES (:i, :p, :pa, :cl, 'Отделение диабетологии', now(), now())"
        ), {"i": ids["dept"], "p": uuid.uuid4(), "pa": ids["partner"], "cl": ids["clinic"]})
        c.execute(sa.text(
            "INSERT INTO identity.patient_pii (internal_id, partner_id, full_name, birth_date, gender, phone_e164, created_at, updated_at)"
            " VALUES (:i, :pa, 'Волков Сергей Николаевич', '1968-03-12', 'male', :ph, now(), now())"
        ), {"i": ids["patient"], "pa": ids["partner"], "ph": phone})
        c.execute(sa.text(
            "INSERT INTO app.patient (internal_id, public_id, partner_id, clinic_id, department_id, created_at, updated_at)"
            " VALUES (:i, :p, :pa, :cl, :de, now(), now())"
        ), {"i": ids["patient"], "p": uuid.uuid4(), "pa": ids["partner"], "cl": ids["clinic"], "de": ids["dept"]})
        c.execute(sa.text(
            "INSERT INTO app.user_account (internal_id, public_id, partner_id, role, patient_internal_id, phone_e164, created_at, updated_at)"
            " VALUES (:i, :p, :pa, 'patient', :pat, :ph, now(), now())"
        ), {"i": ids["pat_user"], "p": uuid.uuid4(), "pa": ids["partner"], "pat": ids["patient"], "ph": phone})
        c.execute(sa.text(
            "INSERT INTO app.user_account (internal_id, public_id, partner_id, role, username, password_hash, created_at, updated_at)"
            " VALUES (:i, :p, :pa, 'doctor', :u, :h, now(), now())"
        ), {"i": ids["doc_user"], "p": uuid.uuid4(), "pa": ids["partner"], "u": username, "h": pwd_hash})
        c.execute(sa.text(
            "INSERT INTO app.doctor (internal_id, public_id, partner_id, clinic_id, name, user_account_id, created_at, updated_at)"
            " VALUES (:i, :p, :pa, :cl, 'Соколов А.В.', :ua, now(), now())"
        ), {"i": ids["doc"], "p": uuid.uuid4(), "pa": ids["partner"], "cl": ids["clinic"], "ua": ids["doc_user"]})

    yield {"phone": phone, "username": username, "partner_id": str(ids["partner"])}

    with superuser_engine.begin() as c:
        c.execute(sa.text("DELETE FROM app.refresh_token WHERE partner_id = :p"), {"p": ids["partner"]})
        c.execute(sa.text("DELETE FROM app.doctor WHERE partner_id = :p"), {"p": ids["partner"]})
        c.execute(sa.text("DELETE FROM app.user_account WHERE partner_id = :p"), {"p": ids["partner"]})
        c.execute(sa.text("DELETE FROM app.patient WHERE partner_id = :p"), {"p": ids["partner"]})
        c.execute(sa.text("DELETE FROM identity.patient_pii WHERE partner_id = :p"), {"p": ids["partner"]})
        c.execute(sa.text("DELETE FROM app.department WHERE partner_id = :p"), {"p": ids["partner"]})
        c.execute(sa.text("DELETE FROM app.clinic WHERE partner_id = :p"), {"p": ids["partner"]})
        c.execute(sa.text("DELETE FROM app.partner WHERE internal_id = :p"), {"p": ids["partner"]})


async def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def test_patient_otp_login_and_session(seeded: dict[str, str]) -> None:
    async with await _client() as c:
        r = await c.post("/v1/auth/patient/otp/request", json={"phone": seeded["phone"]})
        assert r.status_code == 204
        r = await c.post("/v1/auth/patient/otp/verify", json={"phone": seeded["phone"], "code": "0000"})
        assert r.status_code == 200, r.text
        tok = r.json()
        assert tok["role"] == "patient"

        # wrong code rejected
        bad = await c.post("/v1/auth/patient/otp/verify", json={"phone": seeded["phone"], "code": "9999"})
        assert bad.status_code == 401

        # authenticated session echo
        r = await c.get("/v1/auth/session", headers={"Authorization": f"Bearer {tok['access_token']}"})
        assert r.status_code == 200
        assert r.json()["role"] == "patient"
        assert r.json()["partner_id"] == seeded["partner_id"]


async def test_session_requires_bearer() -> None:
    async with await _client() as c:
        r = await c.get("/v1/auth/session")
        assert r.status_code == 401
        assert r.headers["content-type"].startswith("application/problem+json")


async def test_web_login_refresh_logout(seeded: dict[str, str]) -> None:
    async with await _client() as c:
        r = await c.post("/v1/auth/web/login", json={"username": seeded["username"], "password": "secret"})
        assert r.status_code == 200, r.text
        tok = r.json()
        assert tok["role"] == "doctor"

        bad = await c.post("/v1/auth/web/login", json={"username": seeded["username"], "password": "nope"})
        assert bad.status_code == 401

        # refresh rotates
        r = await c.post("/v1/auth/refresh", json={"refresh_token": tok["refresh_token"]})
        assert r.status_code == 200, r.text
        new_tok = r.json()
        assert new_tok["access_token"] != tok["access_token"]

        # old refresh now rotated → rejected
        reused = await c.post("/v1/auth/refresh", json={"refresh_token": tok["refresh_token"]})
        assert reused.status_code == 401

        # logout revokes the new refresh
        r = await c.post("/v1/auth/logout", json={"refresh_token": new_tok["refresh_token"]})
        assert r.status_code == 204
        after = await c.post("/v1/auth/refresh", json={"refresh_token": new_tok["refresh_token"]})
        assert after.status_code == 401
