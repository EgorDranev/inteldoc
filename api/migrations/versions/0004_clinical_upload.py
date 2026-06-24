"""clinical zone tables (Slice B)

Revision ID: 0004_clinical_upload
Revises: 0003_core_identity_access
Create Date: 2026-06-18

storage_object, medical_document, analysis, ocr_field, ocr_field_revision,
complaint — created from the ORM models (explicit fixed list, FK-sorted).

Tables are emitted as CREATE TABLE + indexes in FK-dependency order, skipping
deferred (``use_alter``) constraints. ``create_all`` cannot be used directly here:
it auto-emits the deferred ``analysis.linked_plan_item_id → plan_item`` FK
(use_alter, added in Slice C) for the ``analysis`` table it creates, which would
ALTER ``analysis`` to reference a ``plan_item`` table that does not exist until
0006 — failing every from-scratch ``alembic upgrade head``. (The dev DB escaped
this only because it was built migration-by-migration before that FK existed.)
0006 lands that one FK explicitly once ``plan_item`` exists. Inline FKs to
already-created tables (partner/patient/medical_document/…) are part of each
CREATE TABLE and are unaffected.
"""

from __future__ import annotations

from alembic import op
from app.db.models.clinical import (
    Analysis,
    Complaint,
    MedicalDocument,
    OcrField,
    OcrFieldRevision,
    StorageObject,
)
from sqlalchemy.schema import (
    CreateIndex,
    CreateTable,
    DropTable,
    sort_tables_and_constraints,
)

revision = "0004_clinical_upload"
down_revision = "0003_core_identity_access"
branch_labels = None
depends_on = None

_MODELS = (StorageObject, MedicalDocument, Analysis, OcrField, OcrFieldRevision, Complaint)
_TABLES = [m.__table__ for m in _MODELS]


def upgrade() -> None:
    bind = op.get_bind()
    for table, _deferred in sort_tables_and_constraints(_TABLES):
        if table is None:
            continue  # a deferred use_alter constraint — landed explicitly in 0006
        bind.execute(CreateTable(table))
        for index in table.indexes:
            bind.execute(CreateIndex(index))


def downgrade() -> None:
    bind = op.get_bind()
    # Reverse dependency order. By the time this runs, 0006's downgrade has already
    # dropped the analysis→plan_item FK + plan_item, so the tables drop cleanly.
    for table, _deferred in reversed(sort_tables_and_constraints(_TABLES)):
        if table is None:
            continue
        bind.execute(DropTable(table))
