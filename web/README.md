# IntelDoc — web

The React front end for IntelDoc, covering all three role surfaces from one codebase. Part of the [IntelDoc monorepo](../README.md).

## Surfaces

- **Patient** (`src/routes/patient/`) — mobile-first (390 px), low cognitive load, one primary action per screen: onboarding → consent + access grant → home prep → visit checklist → upload → OCR review → plan → appointment.
- **Doctor** (`src/routes/doctor/`) — dense desktop (≥1280 px): today's queue with prep status, and a three-section patient summary (analyses · gaps · questions).
- **Admin** (`src/routes/admin/`) — desktop KPI cockpit + access audit (revoke / extend / inspect), PII-blind.

A dev-only role switcher (`DEMO_MODE`) jumps between surfaces for a demo; there are no real role gates beyond routing.

## Stack

Vite · React 18 · TypeScript · React Router · **Zustand** (single shared store across all three surfaces) · Framer Motion · Tailwind · Lucide.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

### Mock vs live backend

By default the app runs against an **in-browser mock store** — every surface renders with realistic data, no backend required. To talk to the real API instead:

```bash
# web/.env
VITE_BACKEND_MODE=1
VITE_API_BASE=http://localhost:8000
```

`VITE_DEMO_MODE` (default on) gates the demo affordances — role switcher, `/dev` routes, the «0000» OTP hint. A production build sets `VITE_DEMO_MODE=0` (which requires `VITE_BACKEND_MODE=1`) to strip every dev backdoor.

## Layout

```
src/
├── routes/      patient · doctor · admin · web (login) surfaces
├── components/  shared + per-surface components
├── store/       Zustand store, actions, seed, types
├── api/         backend client (active in BACKEND_MODE)
├── copy/        Russian UI copy
└── lib/         formatters, consent text, analytics, backend adapters
```

> Prototype, not production. UI copy is Russian; code is English. The partner clinic is anonymized («Эндокор») and all data is synthetic.
