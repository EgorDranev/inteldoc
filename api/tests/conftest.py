"""Shared test fixtures.

Unit tests need no infra. Integration / CI-invariant DB tests use sync psycopg
engines per role (simpler than async for raw SQL assertions) and skip cleanly if
Postgres is unreachable.

DB isolation — the suite NEVER touches the dev database. At conftest import (before
``requires_db`` is evaluated or any engine is built) every DB role is redirected to a
dedicated ``inteldoc_test`` database, which is dropped + recreated + migrated to head
once per session. A test run therefore cannot pollute demo data in ``inteldoc``. Tests
self-seed what they need (``seed_demo`` / direct inserts) and use membership — not
exact-count — assertions, so a clean-per-session DB is enough; they tolerate intra-run
accumulation. If Postgres is unreachable the redirect is skipped silently and the
DB-marked tests skip via ``requires_db``.

The schema is built via ``alembic upgrade head`` — the same path prod/CI use — so the
suite continuously proves the migration chain builds a usable DB from empty (this guards
the regression where 0004's create_all auto-emitted a deferred analysis→plan_item FK
before plan_item existed). Roles are cluster-global, so admin_readonly PII-blindness
(INV-ID-3) is preserved across databases.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import sqlalchemy as sa
from app.core.config import get_settings
from sqlalchemy.engine import make_url

TEST_DB_NAME = "inteldoc_test"
_ALEMBIC_INI = str(Path(__file__).resolve().parent.parent / "alembic.ini")

# The integration suite drives the ASGI app hundreds of times from one client; the
# per-IP rate limiter would 429 mid-run. Disable it app-wide here (set before the first
# get_settings()), and prove the limiter itself in an isolated unit test.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")


def _sync(dsn: str) -> str:
    return dsn.replace("+asyncpg", "+psycopg")


def _engine(dsn: str) -> sa.Engine:
    return sa.create_engine(dsn, poolclass=sa.pool.NullPool, future=True)


def _with_db(dsn: str, name: str) -> str:
    return make_url(dsn).set(database=name).render_as_string(hide_password=False)


def _redirect_to_test_db() -> bool:
    """Recreate + migrate ``inteldoc_test`` and point every DB role at it.

    Returns ``False`` (leaving dev settings untouched) if Postgres is unreachable or the
    migration fails, so unit tests still collect and DB tests skip via ``requires_db``.
    """
    dev = get_settings()
    try:
        # Recreate an empty test DB (FORCE drops any stale connections from a crash).
        maintenance = make_url(_sync(dev.database_url_migration)).set(database="postgres")
        eng = sa.create_engine(
            maintenance, isolation_level="AUTOCOMMIT", poolclass=sa.pool.NullPool
        )
        with eng.connect() as c:
            c.execute(sa.text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)'))
            c.execute(sa.text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
        eng.dispose()
    except Exception:
        return False

    # Redirect settings (env wins over .env) and drop cached engines BEFORE migrating, so
    # alembic env.py — which reads ``database_url_migration`` — targets the test DB.
    os.environ["DATABASE_URL_APP"] = _with_db(dev.database_url_app, TEST_DB_NAME)
    os.environ["DATABASE_URL_ADMIN_READONLY"] = _with_db(
        dev.database_url_admin_readonly, TEST_DB_NAME
    )
    os.environ["DATABASE_URL_MIGRATION"] = _with_db(
        dev.database_url_migration, TEST_DB_NAME
    )
    get_settings.cache_clear()

    from app.db import session as db_session

    for cached in (
        db_session.app_engine,
        db_session.app_sessionmaker,
        db_session.admin_readonly_engine,
        db_session.admin_sessionmaker,
    ):
        cached.cache_clear()

    try:
        from alembic import command
        from alembic.config import Config

        command.upgrade(Config(_ALEMBIC_INI), "head")
    except Exception:
        return False
    return True


_DB_REDIRECTED = _redirect_to_test_db()

requires_db = pytest.mark.skipif(
    not _DB_REDIRECTED, reason="Postgres not reachable / test DB unprovisionable"
)


@pytest.fixture
def superuser_engine() -> sa.Engine:
    # migration DSN is the dev superuser (can bypass grants to test the trigger itself)
    return _engine(get_settings().database_url_migration)


@pytest.fixture
def app_engine_sync() -> sa.Engine:
    return _engine(_sync(get_settings().database_url_app))


@pytest.fixture
def admin_engine_sync() -> sa.Engine:
    return _engine(_sync(get_settings().database_url_admin_readonly))
