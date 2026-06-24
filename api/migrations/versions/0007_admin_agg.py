"""admin_agg schema — aggregate snapshots + live access-audit view (Slice D)

Revision ID: 0007_admin_agg
Revises: 0006_plan
Create Date: 2026-06-21

Lands the ``admin_agg`` schema (reserved until now — spec §4.4) with the
materialized KPI/funnel/adoption/trend snapshot tables (created from the ORM
models) and a single LIVE view, ``access_audit_view``, that joins the curated
``access_grant_display`` rows onto the real ``app.access_grant`` rows so the A02
audit reflects revoke/expire instantly.

Role grants are the compliance floor (INV-ID-3): ``admin_readonly`` gets USAGE on
``admin_agg`` + SELECT on the snapshots and the view, and nothing in
``identity``/clinical. The view runs with definer rights (its owner — the migration
role — can read ``app.access_grant``), so ``admin_readonly`` reads aggregated rows
without any base-table grant. Same pattern as ``audit.clinic_admin_audit_view`` (0002).
``app`` gets RW so the seed can populate the snapshots.
"""

from __future__ import annotations

from alembic import op
from app.db.base import Base
from app.db.models.admin_agg import (
    AccessGrantDisplay,
    AdoptionSnapshot,
    DepartmentKpiSnapshot,
    FunnelSnapshot,
    KpiTrendPoint,
    PilotKpiSnapshot,
)

revision = "0007_admin_agg"
down_revision = "0006_plan"
branch_labels = None
depends_on = None

_MODELS = (
    PilotKpiSnapshot,
    FunnelSnapshot,
    AdoptionSnapshot,
    KpiTrendPoint,
    DepartmentKpiSnapshot,
    AccessGrantDisplay,
)
_TABLES = [m.__table__ for m in _MODELS]


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS admin_agg")
    op.execute("GRANT USAGE ON SCHEMA admin_agg TO app")
    op.execute("GRANT USAGE ON SCHEMA admin_agg TO admin_readonly")

    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)

    # app populates the snapshots (the seed runs under the app role); admin_readonly
    # reads them. The grants are explicit because admin_agg post-dates the day-one
    # ALTER DEFAULT PRIVILEGES (0001), which only covered identity/app/audit.
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin_agg TO app")
    op.execute("GRANT SELECT ON ALL TABLES IN SCHEMA admin_agg TO admin_readonly")

    # LIVE access audit: curated display rows × real grants. INNER JOIN means only
    # grants with a display row surface (doctor-demo grants never leak), and the
    # grant's own valid_from/expires_at/revoked_at drive a per-read derived status.
    op.execute(
        """
        CREATE VIEW admin_agg.access_audit_view AS
        SELECT g.public_id      AS grant_public_id,
               g.partner_id     AS partner_id,
               d.patient_mask   AS patient_mask,
               d.doctor_name    AS doctor_name,
               d.department_label AS department_label,
               d.scope_label    AS scope_label,
               g.valid_from     AS valid_from,
               g.expires_at     AS expires_at,
               g.revoked_at     AS revoked_at,
               g.is_suspended   AS is_suspended,
               g.last_viewed_at AS last_viewed_at,
               g.created_at     AS created_at
        FROM app.access_grant g
        JOIN admin_agg.access_grant_display d
          ON d.grant_internal_id = g.internal_id
        """
    )
    op.execute("GRANT SELECT ON admin_agg.access_audit_view TO admin_readonly")


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS admin_agg.access_audit_view")
    Base.metadata.drop_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)
    op.execute("DROP SCHEMA IF EXISTS admin_agg CASCADE")
