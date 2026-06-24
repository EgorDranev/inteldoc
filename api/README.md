# IntelDoc — api

The FastAPI backend for IntelDoc. It makes the patient → doctor → admin loop real: auth, onboarding, document upload + OCR, the doctor plan loop, PII-blind admin aggregates, and an attributable audit trail. Part of the [IntelDoc monorepo](../README.md).

## Stack

Python 3.13 · FastAPI · Pydantic v2 · SQLAlchemy 2 (async) · Alembic · PostgreSQL · Redis 7 · arq (background workers) · MinIO / S3 · Tesseract OCR · Docker Compose · Caddy (auto-TLS in prod). Layered modular monolith.

## Design notes

- **Capability vs session.** Auth endpoints mint a session only; capability (what a role may do) is resolved per-request from server state, never trusted from the token.
- **Patient OTP behind a provider seam.** `OTP_PROVIDER=mock` (dev/demo) accepts a fixed code; a real vendor issues a random code stored hashed (dedicated pepper), TTL'd, attempt-capped, with a persistent per-phone lockout that survives code rotation. Under `APP_ENV=prod` the app **refuses to boot** on the mock provider, so the demo shortcut can't silently ship.
- **PII-blind admin.** Admin routes return only aggregates and masked identifiers — clinical content is never exposed to the admin role.
- **Auditable subjects.** Audit subject IDs are `HMAC(pepper, internal_id)` — attributable, not reversible from a dump alone.
- **OCR.** `OCR_ENGINE=tesseract` runs Tesseract + a Russian lab-report parser; `stub` returns deterministic fixtures for tests/demos.

## API surface

Routers under `app/api/v1/`: `auth` · `onboarding` · `uploads` · `plan` · `doctor` · `admin` · `support` · `me` · `health`. The API is mounted under `/v1`; deep health check at `/v1/healthz`.

## Run

```bash
cp .env.example .env
docker compose up -d --build              # postgres · redis · minio · app · worker
docker compose run --rm app uv run python -m app.seed.seed --doctor   # demo data
curl -s localhost:8000/v1/healthz         # {"status":"ok","checks":{...}}
```

Seed flags are mutually exclusive — run all three for the full demo: `--doctor` (base clinic + doctor/admin logins + patients), `--admin` (KPI snapshots + access grants), `--refresh` (anchor demo dates to today).

## Tests

```bash
uv run pytest
```

97 tests: unit (identity, OTP, OCR parser, grant status, hardening), integration over a real Postgres/Redis/MinIO stack (auth, onboarding/access, upload, plan loop, doctor reads/writes, admin metrics, audit/roles, support, workers, pilot smoke), plus schema-shape and frontend-enum contract invariants.

## Deploy

[`DEPLOY.md`](DEPLOY.md) — single-VPS production runbook (Docker Compose + Caddy auto-TLS).

> Prototype, not production. The partner clinic is anonymized («Эндокор») and all data is synthetic. `.env.example` / `.env.prod.example` carry placeholder secrets only.
