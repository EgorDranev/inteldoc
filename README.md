# IntelDoc

**Preparation-before-visit for endocrinology care — one system, three role-scoped surfaces.**

IntelDoc turns the gap between booking and seeing a doctor into useful work: the patient prepares at home (uploads documents, reviews OCR-extracted lab values, follows a plan), and the clinician opens an already-structured, doctor-ready summary instead of starting cold. A partner-clinic admin watches adoption and access — never the clinical content.

A full-stack pilot build for a real clinical pilot: a React front end covering all three surfaces, and a FastAPI/PostgreSQL backend that makes the patient → doctor → admin loop real — OTP auth, uploads, OCR, audit, server-enforced access control, and admin KPIs.

**What it demonstrates:** full-stack product engineering across mobile + web, a real auth / upload / OCR / audit backend, and compliance-aware design — explicit access transparency, a PII-blind admin role, and consultative-only AI.

> **Anonymized portfolio showcase — production code is private (NDA).**
> The production IntelDoc codebase is confidential and under NDA. This repository is a **self-contained, representative subset** rebuilt for public showcase: the partner clinic is a placeholder (**«Эндокор»**), all data is **synthetic** (no real patients, no PHI), and partner-specific and production-only pieces (multi-partner isolation, the live deployment pipeline, real integrations) are omitted. It runs locally and is faithful to the real architecture — it just isn't the production tree.

---

## Three surfaces, one codebase

| Surface | Audience | Form factor | What it does |
|---|---|---|---|
| **Patient** | Patient (35–65) | Mobile (390 px) | QR/link entry → consent + access grant → home prep → visit checklist → upload → OCR review → plan follow-through → next appointment |
| **Doctor** | Endocrinologist | Desktop (≥1280 px) | Today's queue with prep status at a glance → open a prepared patient → three-section summary (analyses · gaps · questions) |
| **Admin** | Partner-clinic admin | Desktop (≥1280 px) | Adoption / prep-rate KPIs → access audit log → revoke / extend / inspect any grant — **PII-blind** (aggregates + masked identifiers only) |

Role is selected via a dev-only switcher; the showcase simulates auth. All three surfaces read from one shared state, so a single action — e.g. an admin revoking access — propagates across the patient app, the doctor queue, and the audit log at once.

---

## The end-to-end loop

```
Patient                          Doctor                     Admin
───────                          ──────                     ─────
QR/link → partner context
consent + profile
grant access to clinic ──────────────────────────────────▶ appears in audit log
prep at home
upload analysis ─▶ OCR review
                                 opens queue (prep status)
                                 reads structured summary
                                 requests a missing analysis ─▶ patient notified
completes the plan ─────────────▶ summary updates
confirm next appointment         (revoke/extend) ◀────────── admin acts on access
```

---

## Engineering highlights

- **One store, three role-scoped UIs.** Cross-surface data (a patient's access grant, its scope/expiry/status) lives once and is read by patient, doctor, and admin views — grant/revoke/expire transitions are visible and consistent everywhere.
- **Real patient OTP auth with a fail-closed prod gate.** Phone + SMS one-time code behind a vendor-neutral provider seam; codes are stored hashed (dedicated pepper), TTL'd, attempt-capped, with a persistent per-phone lockout that survives code rotation. The app **refuses to boot** in production on the mock provider, so the demo «0000» shortcut can never silently ship.
- **OCR pipeline.** Uploaded lab images run through Tesseract + a Russian lab-report parser; low-confidence fields are surfaced for review. The patient reviews values **read-only** and flags misreads (a data-integrity report) — they never rewrite clinical content; the doctor verifies/flags OCR with a name + timestamp audit stamp.
- **PII-blind admin cockpit.** Admin endpoints serve only aggregates and masked identifiers — the admin role can never read a patient's clinical content, enforced server-side.
- **Auditable, server-enforced access control.** Postgres **row-level security** plus HMAC-peppered access identifiers keep the access model enforced in the database, not just the application layer; grants, revokes, and extensions are logged and attributable.
- **Consultative AI, not diagnostic.** The patient-side assistant («Василий») helps with preparation, clarification, and plan guidance — never diagnosis, treatment, or prescription. Disclaimers accompany every AI-like summary. *(In this showcase the assistant is a prototype-only, clearly-flagged browser call; production routes all inference server-side — see the note in `web/src/services/vasilyLlm.ts`.)*
- **97 backend tests** (unit + integration over a real Postgres/Redis/MinIO stack + schema/contract invariants).

---

## Tech stack

**Frontend** (`web/`) — Vite · React 18 · TypeScript · React Router · Zustand · Framer Motion · Tailwind · Lucide · PWA. Mobile-first patient app + dense desktop doctor/admin surfaces.

**Backend** (`api/`) — Python 3.13 · FastAPI · Pydantic v2 · SQLAlchemy 2 (async) · Alembic · PostgreSQL (row-level security) · Redis 7 · arq (workers) · MinIO / S3 · Tesseract OCR · Docker Compose · Caddy (auto-TLS). Layered modular monolith.

---

## Run it locally

**Frontend** (mock mode — no backend needed; the in-browser store drives everything):
```bash
cd web
npm install
npm run dev          # http://localhost:5173 — use the role switcher to tour all three surfaces
```

**Backend** (full stack via Docker Compose — Postgres, Redis, MinIO, app, worker):
```bash
cd api
cp .env.example .env
docker compose up -d --build
docker compose run --rm app uv run python -m app.seed.seed --doctor   # seed demo data
curl -s localhost:8000/v1/healthz
```

**Wire the two together** — set `VITE_BACKEND_MODE=1` and `VITE_API_BASE=http://localhost:8000` in `web/.env`, then `npm run dev`. The front end now talks to the live API instead of the mock store. See [`api/DEPLOY.md`](api/DEPLOY.md) for the production (VPS + HTTPS) runbook.

---

## Layout

```
inteldoc/
├── web/   React app — patient (mobile) + doctor & admin (desktop) surfaces
└── api/   FastAPI backend — auth, onboarding, uploads, OCR, plan loop, admin aggregates, audit
```

---

## Disclaimers

An anonymized, synthetic-data showcase; the production codebase is private under NDA. Optimized for pilot clarity, not production completeness — mocked/simulated where it should be (OCR can run real Tesseract or a stub; AI summaries are consultative only). No real auth secrets, PHI, EHR/MIS integration, or payments. The partner clinic is anonymized and all data is synthetic.

Built by [Egor Dranev](https://github.com/EgorDranev).
