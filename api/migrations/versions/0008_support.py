"""support zone tables (Slice E) — tickets + dual-destination routing

Revision ID: 0008_support
Revises: 0007_admin_agg
Create Date: 2026-06-21

support_ticket + ticket_routing created from the ORM models. RLS backstop mirrors
0005/0006: permissive when ``app.current_internal_id`` is unset (so a service can
still read a ticket's routings cross-patient when it has already scoped by ticket),
restrictive inside a patient-scoped transaction. Both tables carry
``patient_internal_id`` so the same policy applies.
"""

from __future__ import annotations

from alembic import op
from app.db.base import Base
from app.db.models.support import SupportTicket, TicketRouting

revision = "0008_support"
down_revision = "0007_admin_agg"
branch_labels = None
depends_on = None

_MODELS = (SupportTicket, TicketRouting)
_TABLES = [m.__table__ for m in _MODELS]
_RLS_TABLES = ("support_ticket", "ticket_routing")


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)
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
    Base.metadata.drop_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)
