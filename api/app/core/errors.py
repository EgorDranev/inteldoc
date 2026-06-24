"""RFC 7807 problem+json errors (spec §7.1).

Error bodies carry: type, title, status, detail, instance, trace_id.
NEVER PII or medical values in error bodies (INV-RES-2).
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_CONTENT_TYPE = "application/problem+json"
PROBLEM_BASE = "https://inteldoc.local/problems"


class ProblemException(Exception):
    """Domain/service-raised error mapped to an RFC 7807 response."""

    def __init__(
        self,
        status: int,
        title: str,
        *,
        code: str,
        detail: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status = status
        self.title = title
        self.code = code
        self.detail = detail
        self.headers = headers
        super().__init__(title)


def _problem_body(
    *, status: int, title: str, code: str, detail: str | None, instance: str, trace_id: str
) -> dict[str, Any]:
    return {
        "type": f"{PROBLEM_BASE}/{code}",
        "title": title,
        "status": status,
        "detail": detail,
        "instance": instance,
        "trace_id": trace_id,
    }


def _trace_id(request: Request) -> str:
    return request.headers.get("x-trace-id") or request.headers.get("x-request-id") or "-"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemException)
    async def _problem(request: Request, exc: ProblemException) -> JSONResponse:
        body = _problem_body(
            status=exc.status,
            title=exc.title,
            code=exc.code,
            detail=exc.detail,
            instance=str(request.url.path),
            trace_id=_trace_id(request),
        )
        return JSONResponse(
            body,
            status_code=exc.status,
            media_type=PROBLEM_CONTENT_TYPE,
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        body = _problem_body(
            status=exc.status_code,
            title=str(exc.detail),
            code="http-error",
            detail=None,
            instance=str(request.url.path),
            trace_id=_trace_id(request),
        )
        return JSONResponse(
            body,
            status_code=exc.status_code,
            media_type=PROBLEM_CONTENT_TYPE,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Do not echo input values back (avoid leaking PII into error payloads).
        fields = [".".join(str(p) for p in e["loc"]) for e in exc.errors()]
        body = _problem_body(
            status=422,
            title="Validation error",
            code="validation-error",
            detail=f"Invalid fields: {', '.join(fields)}",
            instance=str(request.url.path),
            trace_id=_trace_id(request),
        )
        return JSONResponse(body, status_code=422, media_type=PROBLEM_CONTENT_TYPE)


# --- Common problem factories (used by services/domain) ---


def forbidden(detail: str | None = None) -> ProblemException:
    # No active grant ⇒ no clinical data; never partial (INV-AC-1).
    return ProblemException(403, "Forbidden", code="forbidden", detail=detail)


def not_found(detail: str | None = None) -> ProblemException:
    return ProblemException(404, "Not found", code="not-found", detail=detail)


def conflict(detail: str | None = None) -> ProblemException:
    return ProblemException(409, "Conflict", code="conflict", detail=detail)


def unauthorized(detail: str | None = None) -> ProblemException:
    return ProblemException(
        401, "Unauthorized", code="unauthorized", detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def bad_request(detail: str | None = None) -> ProblemException:
    return ProblemException(400, "Bad request", code="bad-request", detail=detail)


def too_many_requests(
    detail: str | None = None, *, retry_after: int | None = None
) -> ProblemException:
    return ProblemException(
        429,
        "Too many requests",
        code="rate-limited",
        detail=detail,
        headers={"Retry-After": str(retry_after)} if retry_after is not None else None,
    )
