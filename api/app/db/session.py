"""Async engines + sessionmakers, one per DB role (spec §6.6, §13).

- ``app``            — the runtime role for all business requests/services.
- ``admin_readonly`` — aggregate reads only; the DB refuses PII/clinical SELECT
  (INV-ID-3). This is the floor under "admin is structurally PII-blind".

Migrations run under ``migration_owner`` via Alembic (a sync engine, see env.py).
Engines are created lazily so importing this module needs no live database
(keeps OpenAPI export / unit collection infra-free).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


@lru_cache
def app_engine() -> AsyncEngine:
    return create_async_engine(get_settings().database_url_app, pool_pre_ping=True)


@lru_cache
def admin_readonly_engine() -> AsyncEngine:
    return create_async_engine(
        get_settings().database_url_admin_readonly, pool_pre_ping=True
    )


@lru_cache
def app_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(app_engine(), expire_on_commit=False)


@lru_cache
def admin_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(admin_readonly_engine(), expire_on_commit=False)


async def get_admin_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: a read-only session under ``admin_readonly``."""
    async with admin_sessionmaker()() as session:
        yield session
