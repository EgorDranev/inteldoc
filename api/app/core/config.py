"""Application configuration (pydantic-settings).

Secrets and per-role DB URLs come from the environment. Three DB roles map to
three connection strings (spec §6.6, §13):

- ``app``             — RW on ``app``; INSERT-only on ``audit``; restricted ``identity``.
- ``admin_readonly``  — SELECT on aggregate views only; no PII/clinical (INV-ID-3).
- ``migration_owner`` — DDL only, used by Alembic in CI (never the runtime role).

The API talks async (asyncpg); Alembic + offline-SQL generation talk sync (psycopg).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "dev"
    api_v1_prefix: str = "/v1"
    # Browser origins allowed to call the API (frontend dev server). Comma-separated in env.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # --- Database (per role) ---
    # async DSNs (asyncpg) used by the FastAPI app
    database_url_app: str = (
        "postgresql+asyncpg://app:app@localhost:5432/inteldoc"
    )
    database_url_admin_readonly: str = (
        "postgresql+asyncpg://admin_readonly:admin_readonly@localhost:5432/inteldoc"
    )
    # sync DSN (psycopg) used by Alembic migrations + offline SQL generation
    database_url_migration: str = (
        "postgresql+psycopg://migration_owner:migration_owner@localhost:5432/inteldoc"
    )

    # --- Redis (cache + arq broker) ---
    redis_url: str = "redis://localhost:6379/0"

    # --- Object storage (MinIO, S3-compatible) ---
    s3_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "ru-central1"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "inteldoc"
    s3_presign_ttl_seconds: int = 300  # ≤5 min (INV-RES-3 / §9.2)

    # --- OCR engine ---
    # "stub"      → fixture extraction keyed by analysis_type (no file read). Default
    #               so local/dev/tests never need an OCR runtime.
    # "tesseract" → real extraction: read the accepted object's bytes and run
    #               Tesseract OCR + the RU lab parser (app/infra/ocr_engine.py).
    # The swap point is one env var (OCR_ENGINE) — a future "yandex_vision" engine
    # plugs in behind the same OcrFieldData contract.
    ocr_engine: str = "stub"
    # Tesseract language packs (rus needed for RU lab reports; eng for analyte names/units).
    ocr_tesseract_lang: str = "rus+eng"

    # --- Security ---
    jwt_signing_key: str = "dev-insecure-change-me-min-32-bytes-long"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_seconds: int = 900  # ≤15 min (§6.3)
    refresh_ttl_seconds: int = 60 * 60 * 24 * 30  # 30 days
    # HMAC pepper for audit_subject_id = HMAC(pepper, internal_id) — guarded secret (§6.1)
    audit_pepper: str = "dev-insecure-audit-pepper"

    # --- Patient OTP / SMS delivery (ENG-09) ---
    # The patient login OTP runs behind a vendor-neutral provider seam
    # (app/infra/otp/). The provider id is the single dev↔prod gate:
    #   "mock" → no SMS is sent; the fixed `dev_otp_code` below is accepted.
    #            This is the dev / demo posture (and the only one that keeps «0000»).
    #   <real> → e.g. "smsru": a random code is issued, stored (hashed, TTL,
    #            attempt-capped) and delivered via the provider; «0000» is rejected.
    # Switching to a real provider is what makes the production DoD true
    # ("no «0000» in prod"; arbitrary-patient impersonation closed).
    otp_provider: str = "mock"
    otp_code_length: int = 4  # matches the 4-cell OTP UI
    otp_ttl_seconds: int = 300  # issued-code lifetime
    otp_max_attempts: int = 5  # verify attempts per issued code, then it is burned
    otp_resend_cooldown_seconds: int = 30  # matches the UI resend countdown
    # Persistent per-phone failure budget that survives code rotation. Without it,
    # re-issuing a code would reset the per-code attempt counter and let an attacker
    # brute-force the small numeric space indefinitely. Once tripped, both verify and
    # re-issue are locked for the window.
    otp_max_failures: int = 10
    otp_failure_window_seconds: int = 3600
    # Dedicated pepper for hashing stored OTP codes — kept separate from audit_pepper
    # so the two secrets live in different trust domains and rotate independently.
    otp_pepper: str = "dev-insecure-otp-pepper"
    # Explicit, auditable escape hatch: allow the «0000» mock provider under APP_ENV=prod.
    # Off by default so a real-PHI deploy fails closed on a misconfig (see app/main.py).
    # A demo deploy that wants «0000» sets ALLOW_DEV_OTP=1 (or runs APP_ENV=demo).
    allow_dev_otp: bool = False

    # --- Dev / OTP ---
    # Fixed shortcut OTP. Accepted ONLY while `otp_provider == "mock"` (see
    # `dev_otp_enabled`); a real provider makes it inert. DEMO-ONLY — never set a
    # mock provider in a real-PHI deployment.
    dev_otp_code: str = "0000"  # mock OTP in dev (§5.10)

    # --- Pilot-ready hardening (Slice E, spec §12) ---
    # Fixed-window per-client rate limit. In-process (per uvicorn worker) — adequate
    # defense-in-depth for the single-VPS pilot; a Redis token bucket is the multi-worker
    # prod upgrade behind the same middleware seam.
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 300
    # Max request body the app will accept (bytes). Lab photos go via /uploads/file
    # (multipart, backend-proxied) so this must clear a photo; egregious payloads 413.
    max_body_bytes: int = 15_000_000  # 15 MB

    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"

    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"

    @property
    def otp_provider_id(self) -> str:
        """Normalized provider id — tolerant of stray case/whitespace in the env so
        a value like `" Mock"` can't silently land in a half-configured state."""
        return self.otp_provider.strip().casefold()

    @property
    def dev_otp_enabled(self) -> bool:
        """Whether the fixed `dev_otp_code` shortcut is honoured.

        True only on the mock provider — i.e. dev / demo. A real SMS provider
        turns it off, so production rejects «0000» and accepts only a real,
        delivered code. This is the env-gate that strips the patient backdoor
        without a code change (flip `OTP_PROVIDER`).
        """
        return self.otp_provider_id == "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
