"""Workers: access-expiry (idempotent compliance job) + outbox drain."""

from __future__ import annotations

import uuid

import httpx
import pytest
import sqlalchemy as sa
from app.main import app
from app.seed.seed import seed_demo
from app.services import access_service, outbox_service
from httpx import ASGITransport

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


async def _onboard_grant() -> str:
    dept = (await seed_demo())["department_public_id"]
    phone = f"+79{uuid.uuid4().int % 10**9:09d}"
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(
            "/v1/onboarding/commit",
            json={
                "department_public_id": dept,
                "name": "Волков Сергей Николаевич",
                "dob": "1968-03-12",
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
    return r.json()["grant"]["public_id"]


async def test_access_expiry_is_idempotent(superuser_engine: sa.Engine) -> None:
    grant_id = await _onboard_grant()
    # Force the grant past its expiry.
    with superuser_engine.begin() as conn:
        conn.execute(
            sa.text(
                "UPDATE app.access_grant SET expires_at = now() - interval '1 day' "
                "WHERE public_id = :g"
            ),
            {"g": grant_id},
        )

    await access_service.expire_due_grants()
    await access_service.expire_due_grants()  # second run must not double-emit

    with superuser_engine.connect() as conn:
        n = conn.execute(
            sa.text(
                "SELECT count(*) FROM audit.audit_event WHERE event_type = 'access_expired' "
                "AND target_id = (SELECT internal_id FROM app.access_grant WHERE public_id = :g)"
            ),
            {"g": grant_id},
        ).scalar()
    assert n == 1  # idempotent — exactly one access_expired event


async def test_outbox_drain_marks_done(superuser_engine: sa.Engine) -> None:
    await _onboard_grant()
    # Onboarding enqueued an invalidate_doctor_queue outbox row (pending). Drain in
    # batches until the queue empties — dispatch_pending() is capped (limit=50), and
    # the shared test DB accumulates rows across the session, so one pass may not
    # clear everything. The drain itself is the unit under test, not the cap.
    for _ in range(50):
        result = await outbox_service.dispatch_pending()
        if result["scanned"] == 0:
            break
    with superuser_engine.connect() as conn:
        pending = conn.execute(
            sa.text("SELECT count(*) FROM app.outbox_event WHERE status = 'pending'")
        ).scalar()
    assert pending == 0  # all drained to done
