"""Deep health check (spec §12.1): DB + Redis + S3."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db.session import app_engine
from app.infra.redis import get_redis
from app.infra.s3_client import head_bucket

router = APIRouter(tags=["health"])


async def _check_db() -> bool:
    async with app_engine().connect() as conn:
        await conn.execute(text("SELECT 1"))
    return True


async def _check_redis() -> bool:
    return bool(await get_redis().ping())


async def _check_s3() -> bool:
    return await asyncio.to_thread(head_bucket)


@router.get("/healthz")
async def healthz() -> JSONResponse:
    checks: dict[str, str] = {}
    ok = True
    for name, coro in (("db", _check_db()), ("redis", _check_redis()), ("s3", _check_s3())):
        try:
            await coro
            checks[name] = "ok"
        except Exception as exc:
            checks[name] = f"error: {type(exc).__name__}"
            ok = False
    status = "ok" if ok else "degraded"
    return JSONResponse(
        {"status": status, "checks": checks},
        status_code=200 if ok else 503,
    )
