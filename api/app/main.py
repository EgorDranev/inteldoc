"""FastAPI application factory (spec §4.1).

Mounts the ``/v1`` router, RFC 7807 handlers, structlog. Capabilities are
resolved per-request in deps (§6.2), never from the token.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import BodySizeLimitMiddleware, RateLimitMiddleware
from app.infra.otp import get_otp_provider


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    settings = get_settings()
    # Fail loud on an unknown/typo'd OTP_PROVIDER so a misconfig can't sit in a
    # half-broken state (verify silently rejects everything) until first use.
    get_otp_provider()
    if settings.is_prod and settings.dev_otp_enabled and not settings.allow_dev_otp:
        # Fail CLOSED: a prod deploy still on the mock provider keeps the «0000»
        # patient backdoor (ENG-09) and lets any known phone be impersonated. Refuse
        # to boot. A demo deploy that genuinely wants «0000» must opt in explicitly
        # (ALLOW_DEV_OTP=1) or run APP_ENV=demo.
        raise RuntimeError(
            "Refusing to start: APP_ENV=prod with OTP_PROVIDER=mock would accept the "
            "fixed dev OTP «0000» and allow patient impersonation. Set OTP_PROVIDER to "
            "a real SMS vendor, or set ALLOW_DEV_OTP=1 / APP_ENV=demo to keep the demo "
            "shortcut intentionally."
        )
    if settings.dev_otp_enabled and settings.allow_dev_otp:
        logging.getLogger("app.otp").warning(
            "DEV OTP «0000» is ACTIVE (mock provider, ALLOW_DEV_OTP). Demo-only — any "
            "known phone can be impersonated. Never run a real-PHI deploy like this."
        )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="IntelDoc API",
        version="0.1.0",
        description="IntelDoc backend — Эндокор pilot MVP",
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url=f"{settings.api_v1_prefix}/docs",
        lifespan=lifespan,
    )
    register_error_handlers(app)
    # Hardening (spec §12): cap body size + rate-limit per client (problem+json, no PII).
    # Added before CORS so they run AFTER CORS in the stack (last-added runs first) —
    # a rejected request still carries CORS headers for the browser.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    if settings.rate_limit_enabled:
        app.add_middleware(RateLimitMiddleware, limit=settings.rate_limit_per_minute)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
