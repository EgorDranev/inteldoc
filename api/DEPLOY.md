# IntelDoc backend — VPS deployment runbook

Self-host the IntelDoc backend on a single VPS, fronted by HTTPS (Caddy + Let's
Encrypt), so the Vercel frontend can reach it. This targets the **Эндокор clinical-pilot
demo** (no real PHI), persistent (not a one-off tunnel).

**Stack brought up:** Postgres 16 · Redis 7 · MinIO · Alembic migrate (one-shot) ·
FastAPI app (uvicorn) · arq worker · Caddy reverse proxy (auto-TLS).

Files used here, all under `server/`:
- `docker-compose.prod.yml` — the production stack
- `.env.prod.example` — env template (copy to `.env`)
- `Caddyfile` — reverse-proxy + auto-TLS config

> Conventions: the API is mounted under the **`/v1`** prefix. The health route is
> **`/v1/healthz`**. The frontend env `VITE_API_BASE` is the bare origin with
> **no trailing `/v1`** — the client appends `/v1` itself.

---

## a. Prerequisites

- A VPS (RU-resident for the pilot) with:
  - **Docker Engine** + **Docker Compose v2** (`docker compose version` works).
  - Ports **80** and **443** open to the internet (80 is needed for the ACME
    HTTP-01 TLS challenge).
- A **domain name** with a **DNS A-record** pointing at the VPS public IP. This is
  **required** — Caddy cannot issue a Let's Encrypt cert without a resolvable domain.
  Example: `api.inteldoc.example.ru  A  203.0.113.10`.

Verify Docker:

```bash
docker --version
docker compose version
```

Verify DNS resolves to this host before continuing (replace with your domain):

```bash
dig +short api.inteldoc.example.ru
```

---

## b. Copy the `server/` directory to the VPS

Clone the repo (or copy just the `server/` subtree) onto the VPS, then work from
inside `server/`:

```bash
git clone <your-repo-url> inteldoc
cd inteldoc/react-prototype/server
```

If you copy instead of clone, make sure these all land next to each other:
`docker-compose.prod.yml`, `Caddyfile`, `Dockerfile`, `pyproject.toml`, `uv.lock`,
the `app/` source tree, and `.env.prod.example`.

---

## c. Create and fill `.env`

```bash
cp .env.prod.example .env
```

Generate the security secrets (do NOT reuse the dev placeholders):

```bash
# JWT signing key (>= 32 random bytes)
openssl rand -base64 48

# Audit pepper (random; compromise = reversible audit subjects)
openssl rand -base64 48

# DB / MinIO passwords (run per secret)
openssl rand -base64 24
```

Then edit `.env` and set, at minimum:

- `DOMAIN` — your real domain (matches the DNS A-record from step a).
- `POSTGRES_SUPERUSER_PASSWORD` — strong superuser/bootstrap password.
- `S3_ACCESS_KEY`, `S3_SECRET_KEY` — strong MinIO root creds.
- `JWT_SIGNING_KEY`, `AUDIT_PEPPER` — paste the `openssl` output.
- `CORS_ORIGINS` — your Vercel origin, e.g. `https://inteldoc-prototype.vercel.app`
  (see step h).
- `OCR_ENGINE` — `tesseract` if the Tesseract-enabled image is built (see note in
  `.env.prod.example`), otherwise leave `stub`.
- `DEV_OTP_CODE` — keep set (demo-only; the patient onboarding mints a session via
  this fixed OTP because there is no SMS gateway in the pilot).

> The runtime DB roles `app` and `admin_readonly` are created by **migration 0001**
> with fixed passwords (`app` / `admin_readonly`), which the compose DSNs use as-is.
> This is safe because Postgres publishes **no host port** in prod — the roles are
> reachable only on the internal compose network. The `migrate` one-shot connects as
> the Postgres **superuser** so role bootstrap runs; app and worker then connect
> under the least-privileged roles. (To use strong role passwords, add a post-migrate
> `ALTER ROLE … PASSWORD` step and parameterise the DSNs — not needed for the demo.)

---

## d. Bring up the stack + run migrations

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

What happens, in order (Compose enforces this via `depends_on`):
1. `postgres`, `redis`, `minio` start and become healthy.
2. `createbuckets` creates the `inteldoc` bucket in MinIO (idempotent).
3. `migrate` runs `alembic upgrade head` as the superuser (creates schema + the
   `app` / `admin_readonly` roles), then exits 0.
4. `app` (uvicorn) and `worker` (arq) start once `migrate` has completed
   successfully.
5. `caddy` starts, obtains a Let's Encrypt cert for `${DOMAIN}`, and proxies to
   `app:8000`.

Watch the migration one-shot finish:

```bash
docker compose -f docker-compose.prod.yml logs -f migrate
```

Confirm health. The deep health check verifies DB + Redis + S3 and lives at
**`/v1/healthz`**:

```bash
curl -fsS https://api.inteldoc.example.ru/v1/healthz
```

Expected (HTTP 200):

```json
{"status":"ok","checks":{"db":"ok","redis":"ok","s3":"ok"}}
```

A `503` with `"status":"degraded"` means one dependency is failing — check
`checks` to see which (db / redis / s3) and read that service's logs.

> First Caddy startup may take a few seconds to issue the cert. If `curl` fails
> with a TLS error initially, wait ~10–30s and retry; check `docker compose -f
> docker-compose.prod.yml logs -f caddy` for ACME progress. Caddy needs port 80
> reachable for the HTTP-01 challenge.

---

## e. Seed the demo data

Run the seed **inside** the app container (it has the code + DB access). Use
`run --rm` so a throwaway container executes it:

```bash
# Three separate, mutually-exclusive seed steps — run all three, in order:
docker compose -f docker-compose.prod.yml run --rm app uv run python -m app.seed.seed --doctor   # base Эндокор + doctor/admin logins + 3 patients + D01/D02 enrichment
docker compose -f docker-compose.prod.yml run --rm app uv run python -m app.seed.seed --admin    # A01 KPI snapshots (overview) + 20 demo access grants (A02)
docker compose -f docker-compose.prod.yml run --rm app uv run python -m app.seed.seed --refresh  # anchor appointment/lab/plan dates to "today"
```

This is idempotent (safe to re-run). It creates:
- the **Эндокор** partner / clinic / «Отделение диабетологии» department + legal text
  versions,
- a **doctor** login `sokolov` and an **admin** login `admin`, both with password
  **`demo1234`**,
- three demo patients via the real onboarding flow: **Мария Иванова** (canonical,
  fully prepped — analyses, questions, overdue plan item), **Андрей Волков**
  (in-progress prep, critical HbA1c), **Игорь Лебедев** (prep not started),
  each with a today appointment so the doctor D01 queue / D02 summary render.

> The three flags are **mutually exclusive** — each is a separate run, so do all three:
> - `--doctor` — base Эндокор partner/doctor/admin + the three demo patients with D01/D02 enrichment.
> - `--admin` — the A01 cockpit aggregates (`PilotKpiSnapshot` / funnel / adoption / trend / departments) **and** the 20 demo access grants behind A02. **Skip it and `GET /v1/admin/overview` returns 404** (`build_overview` finds no snapshot → router raises not-found).
> - `--refresh` — re-anchors appointment/lab/plan dates to "today" so the doctor queue isn't empty after a clock change. Run it again before each demo day.
>
> Without any flag (`... -m app.seed.seed`) only the base Эндокор partner/doctor/admin is created.

---

## f. MinIO bucket

The `createbuckets` one-shot in `docker-compose.prod.yml` already creates the
`inteldoc` bucket on startup (`mc mb --ignore-existing local/${S3_BUCKET}`), so no
manual step is needed. To verify it exists:

```bash
docker compose -f docker-compose.prod.yml run --rm createbuckets
```

(Idempotent — prints `bucket ready`.) If you switched to an **external** S3 bucket
(see `.env.prod.example`), create the bucket in that provider's console instead and
remove the `minio` + `createbuckets` services.

---

## g. Wire the frontend (Vercel)

In the Vercel **project settings → Environment Variables**, set:

```
VITE_BACKEND_MODE=1
VITE_API_BASE=https://api.inteldoc.example.ru
```

Then **redeploy** the Vercel project (env changes only apply to new builds).

Two rules that bite people:

- **No trailing `/v1`** on `VITE_API_BASE`. The client appends `/v1` itself
  (`apiUrl = ${API_BASE}${/v1}${path}`), so `https://DOMAIN/v1` would produce
  `https://DOMAIN/v1/v1/...` and 404. Use the bare origin.
- **HTTPS is mandatory.** The Vercel app is served over HTTPS, so a browser will
  block calls to an `http://` backend as **mixed content**. That is exactly why
  Caddy/TLS is in this stack and not optional — the backend must be reachable at
  `https://DOMAIN`.

---

## h. CORS

Set `CORS_ORIGINS` in `.env` to **exactly** the Vercel origin (scheme + host, no
trailing slash, no path):

```
CORS_ORIGINS=https://inteldoc-prototype.vercel.app
```

- Multiple origins are **comma-separated** (e.g. a preview domain plus production):
  ```
  CORS_ORIGINS=https://inteldoc-prototype.vercel.app,https://inteldoc-prototype-git-main.vercel.app
  ```
- After editing `.env`, recreate the app so it re-reads the env:
  ```bash
  docker compose -f docker-compose.prod.yml up -d app
  ```

A CORS mismatch shows up as the browser blocking the request with a CORS error in
the console even though `curl` to `/v1/healthz` works — the origin string must match
the Vercel URL character-for-character.

---

## i. Verify end-to-end

1. Open the deployed patient PWA on the Vercel URL.
2. Walk patient onboarding (QR/link entry → partner context → consent → profile →
   grant access). Use the demo OTP `0000` if prompted.
3. Confirm a patient + access grant is created and **persists** (refresh the page;
   the grant is still there — it's now in Postgres, not just localStorage).
4. Open the doctor dashboard and log in with **`sokolov` / `demo1234`**. You should
   see today's queue with Мария / Андрей / Игорь and their prep status; open Мария
   to see the three-section summary.
5. (Optional) Log into the admin cockpit with **`admin` / `demo1234`** to see KPIs +
   the access audit log.

Quick backend sanity check from the shell:

```bash
curl -fsS https://api.inteldoc.example.ru/v1/healthz
```

---

## j. Operations

**Logs** (follow a service):

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f caddy
```

**Restart / recreate**:

```bash
# restart one service
docker compose -f docker-compose.prod.yml restart app

# apply .env changes (recreates containers with new env)
docker compose -f docker-compose.prod.yml up -d

# rebuild after a code change
docker compose -f docker-compose.prod.yml up -d --build

# stop everything (volumes/data preserved)
docker compose -f docker-compose.prod.yml down
```

**Back up Postgres** (logical dump — preferred, restorable anywhere):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" \
  | gzip > inteldoc-$(date +%F).sql.gz
```

Restore a dump into a fresh DB:

```bash
gunzip -c inteldoc-2026-06-19.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB"
```

Back up the raw volume (filesystem-level snapshot of `pgdata`) if you prefer:

```bash
docker run --rm \
  -v server_pgdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/pgdata-$(date +%F).tgz -C /data .
```

> Volume names are prefixed with the Compose project name (the directory, here
> `server`). Confirm with `docker volume ls`. The MinIO data lives in the
> `miniodata` volume and the issued TLS certs in `caddy_data` — back those up too
> if you cannot afford to re-issue certs / re-upload objects.

**Rotate secrets**:

1. `JWT_SIGNING_KEY` — generate a new value (`openssl rand -base64 48`), update
   `.env`, then `docker compose -f docker-compose.prod.yml up -d app worker`.
   Rotating it invalidates all existing access/refresh tokens (everyone re-logs in).
2. `AUDIT_PEPPER` — rotating changes how new audit subject IDs are derived; existing
   audit rows keep their old derivation. Treat as a one-way change; coordinate before
   rotating in anything beyond the demo.
3. DB / MinIO passwords — these are set at first bootstrap (migration 0001 / MinIO
   root). Changing them in `.env` after the fact does **not** retroactively change
   the stored role/root passwords; you must `ALTER ROLE ... PASSWORD` in Postgres (or
   reset MinIO creds) and update `.env` to match.
