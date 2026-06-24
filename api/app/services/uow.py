"""Unit of Work — the ONLY transaction owner (spec §4.2, the one rule).

Routers (``api/``) and workers (``workers/``) call service functions; only the
service opens a ``transaction()``. Audit emission and outbox enqueue take this
same session so they commit atomically with the mutation (INV-AU-4, INV-RV-3).

The optional ``internal_id`` sets a per-transaction GUC ``app.current_internal_id``
consumed by RLS policies as a backstop (INV-AC-5). Service-level WHERE clauses
remain the primary control; RLS only catches a buggy "global" query.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import app_sessionmaker


@dataclass(slots=True)
class UnitOfWork:
    session: AsyncSession


@asynccontextmanager
async def transaction(*, internal_id: str | None = None) -> AsyncIterator[UnitOfWork]:
    async with app_sessionmaker()() as session:
        async with session.begin():
            if internal_id is not None:
                await session.execute(
                    text("SELECT set_config('app.current_internal_id', :iid, true)"),
                    {"iid": internal_id},
                )
            yield UnitOfWork(session)
        # session.begin() commits on clean exit, rolls back on exception.
