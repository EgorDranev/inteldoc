"""SQLAlchemy declarative base + shared metadata (spec §4.1 db/ layer).

One MetaData spanning the three day-one schemas (``identity`` / ``app`` / ``audit``);
each model pins its schema via ``__table_args__``. A constraint naming convention
keeps Alembic migrations deterministic.

ORM models are NOT Pydantic API schemas — that separation is hard (spec §3).
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import DateTime, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Day-one schemas (spec §4.4). ``ai_ops`` stays reserved (not created).
SCHEMA_IDENTITY = "identity"
SCHEMA_APP = "app"
SCHEMA_AUDIT = "audit"
# ``admin_agg`` lands with Slice D: PII-free aggregate snapshots + the live
# access-audit view, the only objects the ``admin_readonly`` role may read
# besides ``audit.clinic_admin_audit_view`` (spec §4.4, §5.9, §6.6).
SCHEMA_ADMIN_AGG = "admin_agg"


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    # All datetimes are timestamptz (data-model uses timestamptz throughout).
    type_annotation_map = {dt.datetime: DateTime(timezone=True)}


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


def uuid_public() -> Mapped[uuid.UUID]:
    # Opaque, UNIQUE — the only patient/entity id that appears on the API (INV-ID-2/5).
    return mapped_column(unique=True, default=uuid.uuid4, index=True)


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(
        default=lambda: dt.datetime.now(tz=dt.UTC)
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        default=lambda: dt.datetime.now(tz=dt.UTC),
        onupdate=lambda: dt.datetime.now(tz=dt.UTC),
    )


class SoftDeleteMixin:
    deleted_at: Mapped[dt.datetime | None] = mapped_column(default=None)
