"""Pilot-ready hardening middleware (spec §12, Slice E) — body-size cap + rate limit.

Both reject with RFC 7807 problem+json (INV-RES-2: never PII in error bodies). The
rate limiter is an in-process FIXED WINDOW per client IP — adequate defense-in-depth
for the single-VPS pilot; the seam swaps to a Redis token bucket for multi-worker prod
without touching call sites. ``/v1/healthz`` is exempt so liveness probes are never
throttled or capped.
"""

from __future__ import annotations

import datetime as dt

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.errors import PROBLEM_BASE, PROBLEM_CONTENT_TYPE

_EXEMPT_PATHS = frozenset({"/v1/healthz"})
# Opportunistic prune ceiling so the per-IP map can't grow unbounded under churn.
_MAX_TRACKED_CLIENTS = 10_000


def _problem(
    *,
    status: int,
    title: str,
    code: str,
    detail: str,
    instance: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = {
        "type": f"{PROBLEM_BASE}/{code}",
        "title": title,
        "status": status,
        "detail": detail,
        "instance": instance,
        "trace_id": "-",
    }
    return JSONResponse(
        body, status_code=status, media_type=PROBLEM_CONTENT_TYPE, headers=headers
    )


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """413 when ``Content-Length`` exceeds the cap (cheap header check, before the body
    is read). A missing/invalid header is allowed through — the framework's own limits
    and the rate limiter remain the backstop."""

    def __init__(self, app: object, *, max_bytes: int) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self.max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    return _problem(
                        status=413,
                        title="Payload too large",
                        code="payload-too-large",
                        detail=f"Request body exceeds {self.max_bytes} bytes",
                        instance=request.url.path,
                    )
            except ValueError:
                pass
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """429 once a client IP exceeds ``limit`` requests in a rolling ``window_seconds``
    fixed window. Returns ``Retry-After``. In-process state per worker (see module doc)."""

    def __init__(self, app: object, *, limit: int, window_seconds: int = 60) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, tuple[int, int]] = {}  # ip -> (window_start_epoch, count)

    def _client(self, request: Request) -> str:
        return request.client.host if request.client else "unknown"

    def _prune(self, now: int) -> None:
        if len(self._hits) <= _MAX_TRACKED_CLIENTS:
            return
        stale = [k for k, (start, _) in self._hits.items() if now - start >= self.window]
        for k in stale:
            del self._hits[k]

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)
        now = int(dt.datetime.now(tz=dt.UTC).timestamp())
        key = self._client(request)
        start, count = self._hits.get(key, (now, 0))
        if now - start >= self.window:
            start, count = now, 0
        count += 1
        self._hits[key] = (start, count)
        self._prune(now)
        if count > self.limit:
            retry_after = max(1, self.window - (now - start))
            return _problem(
                status=429,
                title="Too many requests",
                code="rate-limited",
                detail="Rate limit exceeded — please slow down",
                instance=request.url.path,
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
