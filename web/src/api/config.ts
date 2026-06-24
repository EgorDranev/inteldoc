// API connection config. The prototype runs in MOCK mode by default (the Zustand
// store + localStorage) so the demo never depends on a running backend. Set
// VITE_BACKEND_MODE=1 (and optionally VITE_API_BASE) to talk to the real API.

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export const API_PREFIX = "/v1";

export const BACKEND_MODE: boolean =
  (import.meta.env.VITE_BACKEND_MODE as string | undefined) === "1";

// Demo affordances (ENG-09 env-gate). ON by default so local dev + the demo
// deploy keep the role-switcher, the /dev routes and the «0000» hint. A real
// pilot build sets VITE_DEMO_MODE=0 to strip every dev backdoor: the returning
// patient must then sign in with a real SMS code via the backend.
export const DEMO_MODE: boolean =
  (import.meta.env.VITE_DEMO_MODE as string | undefined) !== "0";

// Invariant: a non-demo (production) build MUST talk to the real backend.
// Otherwise the patient auth gate would no-op and the login screen would fall back
// to the mock «0000» path — re-opening the very backdoor DEMO_MODE=0 exists to
// strip. Fail at module load so this misconfig can never ship.
if (!DEMO_MODE && !BACKEND_MODE) {
  throw new Error(
    "Invalid build config: VITE_DEMO_MODE=0 (production) requires VITE_BACKEND_MODE=1. " +
      "Without a backend, patient login would fall back to the «0000» dev shortcut.",
  );
}

export const apiUrl = (path: string): string => `${API_BASE}${API_PREFIX}${path}`;
