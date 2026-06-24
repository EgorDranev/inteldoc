"""schemas + roles + default privileges

Revision ID: 0001_schemas_and_roles
Revises:
Create Date: 2026-06-17

Day-one schemas (identity/app/audit) and the 3 DB roles (spec §4.4, §6.6).
Default privileges make the role model the DB floor: ``app`` gets RW on app +
identity (code-restricted via the resolver) and INSERT/SELECT-only on audit;
``admin_readonly`` gets NO base-table grants (INV-ID-3) — view grants come later.

Roles are created idempotently so the migration self-bootstraps in dev (the
migration connection is a superuser there). In prod, roles are pre-provisioned
and a dedicated ``migration_owner`` runs DDL.
"""

from __future__ import annotations

from alembic import op

revision = "0001_schemas_and_roles"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
                CREATE ROLE app LOGIN PASSWORD 'app';
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_readonly') THEN
                CREATE ROLE admin_readonly LOGIN PASSWORD 'admin_readonly';
            END IF;
        END $$;
        """
    )
    op.execute("CREATE SCHEMA IF NOT EXISTS identity")
    op.execute("CREATE SCHEMA IF NOT EXISTS app")
    op.execute("CREATE SCHEMA IF NOT EXISTS audit")

    # Schema usage
    op.execute("GRANT USAGE ON SCHEMA app TO app")
    op.execute("GRANT USAGE ON SCHEMA identity TO app")
    op.execute("GRANT USAGE ON SCHEMA audit TO app")
    op.execute("GRANT USAGE ON SCHEMA audit TO admin_readonly")

    # Default privileges for tables the migration role creates later.
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA app "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA identity "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app"
    )
    # audit is append-only for app: INSERT + SELECT, never UPDATE/DELETE (INV-AU-1).
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT, INSERT ON TABLES TO app"
    )
    # admin_readonly gets NO default table grants — PII-blind floor (INV-ID-3).


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS audit CASCADE")
    op.execute("DROP SCHEMA IF EXISTS app CASCADE")
    op.execute("DROP SCHEMA IF EXISTS identity CASCADE")
    # Roles intentionally left in place (may be shared); drop manually if needed.
