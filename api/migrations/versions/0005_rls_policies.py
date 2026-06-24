"""RLS backstop on clinical tables (Slice B)

Revision ID: 0005_rls_policies
Revises: 0004_clinical_upload
Create Date: 2026-06-18

Defense-in-depth (INV-AC-5): every clinical query is scoped by ``internal_id`` in
the service WHERE clause (primary control). RLS is the backstop — if a service bug
builds a "global" query *inside a patient-scoped transaction*, RLS catches it.

The policy is permissive when the GUC ``app.current_internal_id`` is unset (so
legitimate cross-patient reads — doctor queue, admin aggregates — are unaffected)
and restrictive when a patient-scoped transaction has set it. The ``app`` role is
non-owner, so RLS applies to it; the migration owner / superuser bypasses.
"""

from __future__ import annotations

from alembic import op

revision = "0005_rls_policies"
down_revision = "0004_clinical_upload"
branch_labels = None
depends_on = None

_TABLES = ("medical_document", "analysis", "complaint")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(f"ALTER TABLE app.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_patient_scope ON app.{table}
            USING (
                current_setting('app.current_internal_id', true) IS NULL
                OR patient_internal_id = current_setting('app.current_internal_id', true)::uuid
            )
            """
        )


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_patient_scope ON app.{table}")
        op.execute(f"ALTER TABLE app.{table} DISABLE ROW LEVEL SECURITY")
