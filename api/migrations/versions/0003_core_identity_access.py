"""core + identity + access tables (Slice 0/A)

Revision ID: 0003_core_identity_access
Revises: 0002_audit_trigger
Create Date: 2026-06-17

Creates the Slice 0/A tables from the ORM models (single source of truth). The
table set is enumerated EXPLICITLY (not "all metadata") so this migration stays
stable when later slices add models. ``create_all`` sorts by FK dependency and
emits the deferred ALTER for the user_account↔patient↔doctor cycle (use_alter).
"""

from __future__ import annotations

from alembic import op
from app.db.base import Base
from app.db.models.access import (
    AcceptanceRecord,
    AccessGrant,
    ConsentBundle,
    ConsentRecord,
    IdempotencyKey,
    OutboxEvent,
    RefreshToken,
)
from app.db.models.core import (
    Appointment,
    Clinic,
    ConditionContext,
    Department,
    Doctor,
    NotificationPrefs,
    Partner,
    Patient,
    PatientMedicalBaseline,
    Specialty,
    UserAccount,
)
from app.db.models.identity import LegalTextVersion, PatientPii

revision = "0003_core_identity_access"
down_revision = "0002_audit_trigger"
branch_labels = None
depends_on = None

_MODELS = (
    Partner,
    Clinic,
    Department,
    Specialty,
    PatientPii,
    LegalTextVersion,
    UserAccount,
    Doctor,
    Patient,
    PatientMedicalBaseline,
    ConditionContext,
    Appointment,
    NotificationPrefs,
    AccessGrant,
    ConsentBundle,
    ConsentRecord,
    AcceptanceRecord,
    OutboxEvent,
    RefreshToken,
    IdempotencyKey,
)
_TABLES = [m.__table__ for m in _MODELS]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=_TABLES, checkfirst=False)
