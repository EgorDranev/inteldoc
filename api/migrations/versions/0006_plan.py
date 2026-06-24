"""plan zone tables (Slice C) — doctor→patient loop

Revision ID: 0006_plan
Revises: 0005_rls_policies
Create Date: 2026-06-18

doctor_request + plan_item created from the ORM models. Also lands the deferred
``analysis.linked_plan_item_id`` FK (use_alter on the model → an explicit ALTER
here, since the cycle analysis↔plan_item can't be ordered in a single CREATE).

RLS backstop mirrors 0005: permissive when ``app.current_internal_id`` is unset
(cross-patient doctor reads unaffected), restrictive inside a patient-scoped txn.
The ``app`` role is a non-owner so RLS applies; the migration owner bypasses.
``admin_readonly`` is SELECT-only at the grant level (no aggregate view here yet),
so no separate write policy is required — RLS denies writes it never had.
"""

from __future__ import annotations

from alembic import op
from app.db.base import Base
from app.db.models.plan import DoctorRequest, PlanItem

revision = "0006_plan"
down_revision = "0005_rls_policies"
branch_labels = None
depends_on = None

_MODELS = (DoctorRequest, PlanItem)
_TABLES = [m.__table__ for m in _MODELS]

# The deferred FK on analysis (use_alter=True) — named by the convention in base.py.
_ANALYSIS_FK = "fk_analysis_linked_plan_item_id_plan_item"

_RLS_TABLES = ("doctor_request", "plan_item")


def upgrade() -> None:
    # doctor_request → plan_item (plan_item FKs analysis, which already exists).
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)

    # Land the deferred analysis → plan_item FK now that plan_item exists.
    op.create_foreign_key(
        _ANALYSIS_FK,
        source_table="analysis",
        referent_table="plan_item",
        local_cols=["linked_plan_item_id"],
        remote_cols=["internal_id"],
        source_schema="app",
        referent_schema="app",
    )

    # RLS backstop (INV-AC-5), mirroring 0005.
    for table in _RLS_TABLES:
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
    for table in _RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_patient_scope ON app.{table}")
        op.execute(f"ALTER TABLE app.{table} DISABLE ROW LEVEL SECURITY")

    op.drop_constraint(_ANALYSIS_FK, table_name="analysis", schema="app", type_="foreignkey")
    # Clear the now-dangling links so a later re-upgrade can re-add the FK cleanly
    # (the column survives the FK drop; its values would otherwise orphan plan_item).
    op.execute("UPDATE app.analysis SET linked_plan_item_id = NULL")

    Base.metadata.drop_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)
