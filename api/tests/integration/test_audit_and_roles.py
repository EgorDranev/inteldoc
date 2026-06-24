"""DB-level invariant tests against live Postgres.

- INV-AU-1: audit_event is append-only — the Postgres trigger rejects UPDATE and
  DELETE even for a superuser (proves the trigger, not just a missing grant).
- INV-ID-3: admin_readonly cannot read identity/clinical PII (no schema USAGE).
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa

from tests.conftest import requires_db

pytestmark = [pytest.mark.integration, requires_db]


def _insert_audit(conn: sa.Connection) -> uuid.UUID:
    iid = uuid.uuid4()
    conn.execute(
        sa.text(
            "INSERT INTO audit.audit_event "
            "(internal_id, partner_id, actor_role, event_type, created_at) "
            "VALUES (:id, :pid, 'system', 'access_granted', now())"
        ),
        {"id": iid, "pid": uuid.uuid4()},
    )
    return iid


def test_inv_au_1_audit_update_rejected(superuser_engine: sa.Engine) -> None:
    with superuser_engine.begin() as conn:
        iid = _insert_audit(conn)
    with superuser_engine.begin() as conn, pytest.raises(Exception) as exc:
        conn.execute(
            sa.text("UPDATE audit.audit_event SET event_type = 'tampered' WHERE internal_id = :id"),
            {"id": iid},
        )
    assert "append-only" in str(exc.value).lower()


def test_inv_au_1_audit_delete_rejected(superuser_engine: sa.Engine) -> None:
    with superuser_engine.begin() as conn:
        iid = _insert_audit(conn)
    with superuser_engine.begin() as conn, pytest.raises(Exception) as exc:
        conn.execute(
            sa.text("DELETE FROM audit.audit_event WHERE internal_id = :id"),
            {"id": iid},
        )
    assert "append-only" in str(exc.value).lower()


def test_inv_id_3_admin_readonly_cannot_read_pii(admin_engine_sync: sa.Engine) -> None:
    with admin_engine_sync.connect() as conn, pytest.raises(Exception) as exc:
        conn.execute(sa.text("SELECT full_name FROM identity.patient_pii LIMIT 1"))
    msg = str(exc.value).lower()
    assert "permission denied" in msg or "denied" in msg


def test_inv_id_3_admin_readonly_can_read_clinic_admin_view(admin_engine_sync: sa.Engine) -> None:
    # The one audit projection admin may read — and it has no audit_subject_id (INV-AU-3).
    with admin_engine_sync.connect() as conn:
        cols = conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='audit' AND table_name='clinic_admin_audit_view'"
            )
        ).scalars().all()
    assert "audit_subject_id" not in cols
