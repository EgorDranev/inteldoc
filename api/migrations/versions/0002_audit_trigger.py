"""audit_event table + INSERT-only trigger + 3 role-scoped views

Revision ID: 0002_audit_trigger
Revises: 0001_schemas_and_roles
Create Date: 2026-06-17

The audit table is created from the ORM model (single source of truth). A
BEFORE UPDATE OR DELETE trigger enforces append-only at the DB (INV-AU-1).
Three role-scoped views (spec §11.1); ``clinic_admin_audit_view`` omits
``audit_subject_id`` (INV-AU-3) and is the only one ``admin_readonly`` may read.
"""

from __future__ import annotations

from alembic import op
from app.db.models.audit import AuditEvent

revision = "0002_audit_trigger"
down_revision = "0001_schemas_and_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    AuditEvent.__table__.create(bind=op.get_bind(), checkfirst=False)

    # Append-only enforcement (INV-AU-1).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit.reject_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_event is append-only (INV-AU-1): % rejected', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_event_append_only
        BEFORE UPDATE OR DELETE ON audit.audit_event
        FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
        """
    )

    # Patient's own access history (filtered by audit_subject_id at query time).
    op.execute(
        """
        CREATE VIEW audit.patient_access_history_view AS
        SELECT audit_subject_id, event_type, target_type, target_id,
               actor_role, created_at, metadata_json
        FROM audit.audit_event;
        """
    )
    # Compliance view (reserved): full technical detail incl. subject pseudonym.
    op.execute(
        """
        CREATE VIEW audit.compliance_audit_view AS
        SELECT internal_id, partner_id, audit_subject_id, actor_role, actor_ref,
               event_type, target_type, target_id, trace_id, metadata_json, created_at
        FROM audit.audit_event;
        """
    )
    # Clinic-admin view: NO audit_subject_id (INV-AU-3) — org-level only.
    op.execute(
        """
        CREATE VIEW audit.clinic_admin_audit_view AS
        SELECT partner_id, actor_role, event_type, target_type, created_at, metadata_json
        FROM audit.audit_event;
        """
    )
    op.execute("GRANT SELECT ON audit.clinic_admin_audit_view TO admin_readonly")


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS audit.clinic_admin_audit_view")
    op.execute("DROP VIEW IF EXISTS audit.compliance_audit_view")
    op.execute("DROP VIEW IF EXISTS audit.patient_access_history_view")
    op.execute("DROP TRIGGER IF EXISTS audit_event_append_only ON audit.audit_event")
    op.execute("DROP FUNCTION IF EXISTS audit.reject_mutation()")
    op.drop_table("audit_event", schema="audit")
