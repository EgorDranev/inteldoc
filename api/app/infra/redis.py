"""Redis client (cache + arq broker). RU-resident in prod (INV-RES-1)."""

from __future__ import annotations

from functools import lru_cache

import redis.asyncio as aioredis

from app.core.config import get_settings


@lru_cache
def get_redis() -> aioredis.Redis:
    client: aioredis.Redis = aioredis.from_url(  # type: ignore[no-untyped-call]
        get_settings().redis_url, decode_responses=True
    )
    return client
