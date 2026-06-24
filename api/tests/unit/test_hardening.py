"""Slice E hardening unit tests — rate limit + body cap + PII log scrubbing.

Infra-free: the middleware is exercised against a tiny isolated FastAPI app (so the
suite-wide disabled limiter doesn't interfere), and the scrubber is called directly.
"""

from __future__ import annotations

import httpx
import pytest
from app.core.logging import _scrub_pii
from app.core.middleware import BodySizeLimitMiddleware, RateLimitMiddleware
from fastapi import FastAPI
from httpx import ASGITransport


def _app_with(*middlewares: tuple[type, dict]) -> FastAPI:
    app = FastAPI()

    @app.get("/v1/ping")
    async def ping() -> dict[str, str]:
        return {"ok": "1"}

    @app.get("/v1/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/echo")
    async def echo(body: dict) -> dict:
        return body

    for cls, kwargs in middlewares:
        app.add_middleware(cls, **kwargs)
    return app


async def _client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


# ─── Rate limit ──────────────────────────────────────────────────────────────


async def test_rate_limit_allows_then_429s() -> None:
    app = _app_with((RateLimitMiddleware, {"limit": 3, "window_seconds": 60}))
    async with await _client(app) as c:
        for _ in range(3):
            assert (await c.get("/v1/ping")).status_code == 200
        blocked = await c.get("/v1/ping")
        assert blocked.status_code == 429
        assert blocked.headers.get("Retry-After")
        assert blocked.json()["type"].endswith("/rate-limited")
        assert blocked.headers["content-type"].startswith("application/problem+json")


async def test_rate_limit_exempts_healthz() -> None:
    app = _app_with((RateLimitMiddleware, {"limit": 1, "window_seconds": 60}))
    async with await _client(app) as c:
        # Health probes are never throttled, even past the limit.
        for _ in range(5):
            assert (await c.get("/v1/healthz")).status_code == 200


# ─── Body size cap ───────────────────────────────────────────────────────────


async def test_body_size_cap_413s_oversized() -> None:
    app = _app_with((BodySizeLimitMiddleware, {"max_bytes": 20}))
    async with await _client(app) as c:
        small = await c.post("/v1/echo", json={"a": 1})
        assert small.status_code == 200
        big = await c.post("/v1/echo", json={"k": "x" * 100})
        assert big.status_code == 413
        assert big.json()["type"].endswith("/payload-too-large")


# ─── PII log scrubbing ───────────────────────────────────────────────────────


def test_scrub_redacts_sensitive_keys() -> None:
    out = _scrub_pii(
        None,
        "info",
        {
            "event": "patient_action",
            "full_name": "Иванова Мария",
            "phone_e164": "+79990001122",
            "patient_id": "abc-uuid",
        },
    )
    assert out["full_name"] == "[redacted]"
    assert out["phone_e164"] == "[redacted]"
    # Opaque ids + the message itself survive.
    assert out["patient_id"] == "abc-uuid"
    assert out["event"] == "patient_action"


def test_scrub_redacts_value_patterns_in_freetext() -> None:
    out = _scrub_pii(
        None,
        "info",
        {"event": "напишите на ivan@example.com или +7 999 000-11-22 срочно"},
    )
    assert "ivan@example.com" not in out["event"]
    assert "[email]" in out["event"]
    assert "[phone]" in out["event"]


@pytest.mark.parametrize(
    "safe",
    [
        "outbox_dispatch",
        "trace_id",
        # FULL canonical uuid4 — the digit-heavy tail must NOT be mangled as a phone
        # (the scrubber logs opaque ids verbatim for debuggability).
        "550e8400-e29b-41d4-a716-446655440000",
        "uploads/01234567-89ab-cdef-0123-456789abcdef.jpg",
    ],
)
def test_scrub_leaves_safe_strings(safe: str) -> None:
    out = _scrub_pii(None, "info", {"id": safe, "object_key": safe})
    assert out["id"] == safe
    assert out["object_key"] == safe


def test_scrub_recurses_into_nested_structures() -> None:
    out = _scrub_pii(
        None,
        "info",
        {
            "event": "x",
            "payload": {"full_name": "Иванова Мария", "phone": "+79990001122", "id": "u-123"},
            "items": ["+7 999 000-11-22", "ivan@example.com", "safe-token"],
        },
    )
    # Nested sensitive keys redacted, opaque nested id survives.
    assert out["payload"]["full_name"] == "[redacted]"
    assert out["payload"]["phone"] == "[redacted]"
    assert out["payload"]["id"] == "u-123"
    # List free-text patterns scrubbed.
    assert "[phone]" in out["items"][0]
    assert out["items"][1] == "[email]"
    assert out["items"][2] == "safe-token"
