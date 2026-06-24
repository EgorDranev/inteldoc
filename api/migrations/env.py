"""Alembic environment. Migrations run under ``migration_owner`` (sync psycopg).

URL comes from app settings (``database_url_migration``); secrets stay out of
alembic.ini. ``include_schemas=True`` so the three schemas are visible to
autogenerate/offline. Roles/RLS/triggers/views are hand-written (not autogen-able).
"""

from __future__ import annotations

import app.db.models  # noqa: F401 — populate Base.metadata
from alembic import context
from app.core.config import get_settings
from app.db.base import Base
from sqlalchemy import create_engine, pool

target_metadata = Base.metadata


def _url() -> str:
    return get_settings().database_url_migration


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool, future=True)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
