"""Integration-test fixtures.

pytest-asyncio gives each test a fresh event loop, but the app's async engine is
lru_cached and would outlive its loop (→ asyncpg "Event loop is closed"). Rebuild
the engine per test on the current loop and dispose it cleanly afterwards.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from app.db import session as db_session


@pytest.fixture(autouse=True)
async def _fresh_async_engine() -> AsyncIterator[None]:
    # Both the app and admin_readonly engines are lru_cached and would otherwise
    # outlive the per-test event loop (asyncpg "Event loop is closed"). Rebuild +
    # dispose both per test so admin (Slice D) reads run on the current loop.
    db_session.app_engine.cache_clear()
    db_session.app_sessionmaker.cache_clear()
    db_session.admin_readonly_engine.cache_clear()
    db_session.admin_sessionmaker.cache_clear()
    yield
    for engine_factory in (db_session.app_engine, db_session.admin_readonly_engine):
        await engine_factory().dispose()
    db_session.app_engine.cache_clear()
    db_session.app_sessionmaker.cache_clear()
    db_session.admin_readonly_engine.cache_clear()
    db_session.admin_sessionmaker.cache_clear()
