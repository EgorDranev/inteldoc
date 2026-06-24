// Thin typed API client for the IntelDoc backend (OpenAPI at /v1).
// Used only in BACKEND_MODE; the demo's default path stays on the mock store.

import { apiUrl } from "./config";
import type { components } from "./types";

type Schemas = components["schemas"];

const TOKEN_KEY = "inteldoc-access-token";
const REFRESH_KEY = "inteldoc-refresh-token";

export function setTokens(access: string | null, refresh?: string | null): void {
  if (access) localStorage.setItem(TOKEN_KEY, access);
  else localStorage.removeItem(TOKEN_KEY);
  if (refresh !== undefined) {
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, title: string, detail?: string) {
    super(detail ? `${title}: ${detail}` : title);
    this.status = status;
    this.detail = detail;
  }
}

const newIdempotencyKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

interface RequestOpts {
  body?: unknown;
  auth?: boolean;
  idempotent?: boolean;
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  if (opts.idempotent) headers["Idempotency-Key"] = newIdempotencyKey();

  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    // An expired/invalid session on an authed call → drop the stale tokens so the
    // patient auth gate routes back to login (ENG-09). Skip for the login calls
    // themselves, which carry no auth and surface their 401 as an inline error.
    if (res.status === 401 && opts.auth) setTokens(null, null);
    throw new ApiError(res.status, data?.title ?? "Request failed", data?.detail);
  }
  return data as T;
}

// --- Auth ---
export const auth = {
  requestOtp: (phone: string) =>
    request<void>("POST", "/auth/patient/otp/request", { body: { phone } }),
  verifyOtp: async (phone: string, code: string) => {
    const tok = await request<Schemas["TokenOut"]>("POST", "/auth/patient/otp/verify", {
      body: { phone, code },
    });
    setTokens(tok.access_token, tok.refresh_token);
    return tok;
  },
  webLogin: async (username: string, password: string) => {
    const tok = await request<Schemas["TokenOut"]>("POST", "/auth/web/login", {
      body: { username, password },
    });
    setTokens(tok.access_token, tok.refresh_token);
    return tok;
  },
  session: () => request<Schemas["SessionOut"]>("GET", "/auth/session", { auth: true }),
  logout: async () => {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (refresh) await request<void>("POST", "/auth/logout", { body: { refresh_token: refresh } });
    setTokens(null, null);
  },
};

// --- Onboarding ---
export const onboarding = {
  partnerContext: (code = "enc") =>
    request<Schemas["PartnerContextOut"]>("GET", `/onboarding/partner-context?code=${code}`),
  commit: (body: Schemas["CommitIn"]) =>
    request<Schemas["CommitOut"]>("POST", "/onboarding/commit", { body, idempotent: true }),
};

// --- Patient self-service ---
export const me = {
  get: () => request<Record<string, unknown>>("GET", "/me", { auth: true }),
  accessGrants: () => request<Schemas["GrantOut"][]>("GET", "/me/access-grants", { auth: true }),
  revokeGrant: (grantId: string) =>
    request<Schemas["GrantOut"]>("POST", `/me/access-grants/${grantId}/revoke`, {
      auth: true,
      idempotent: true,
    }),
  patchIdentity: (patch: Record<string, unknown>) =>
    request<Record<string, unknown>>("PATCH", "/me/identity", { auth: true, body: patch }),
  // Explicit «Подготовка завершена» — sets prep_completed_at, which moves the
  // patient's label in the doctor queue (Slice C headline write path).
  completePrep: (timeSpentMin?: number) =>
    request<Record<string, unknown>>("POST", "/me/prep/complete", {
      auth: true,
      body: { time_spent_min: timeSpentMin ?? null },
    }),
};

// --- Uploads / analyses / complaints (Slice B) ---
export const uploads = {
  sign: (contentType?: string) =>
    request<Schemas["SignUploadOut"]>("POST", "/uploads/sign", {
      auth: true,
      body: { content_type: contentType ?? null },
    }),
  // Backend-proxied upload (multipart). The shared `request` helper forces a JSON
  // content-type, so multipart needs its own fetch (and must NOT set Content-Type —
  // the browser writes the multipart boundary). Returns the stored object_key.
  uploadFile: async (file: Blob): Promise<{ object_key: string }> => {
    const token = getAccessToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(apiUrl("/uploads/file"), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new ApiError(res.status, data?.title ?? "Upload failed", data?.detail);
    return data as { object_key: string };
  },
  registerAnalysis: (body: Schemas["RegisterAnalysisIn"]) =>
    request<Record<string, unknown>>("POST", "/analyses", { auth: true, body, idempotent: true }),
  listAnalyses: () => request<Record<string, unknown>[]>("GET", "/analyses", { auth: true }),
  editOcrField: (analysisId: string, fieldKey: string, value: string) =>
    request<Record<string, unknown>>(
      "PATCH",
      `/analyses/${analysisId}/ocr-fields/${encodeURIComponent(fieldKey)}`,
      { auth: true, body: { value } },
    ),
  addComplaint: (text: string, tags?: string[], priority?: number) =>
    request<Record<string, unknown>>("POST", "/complaints", {
      auth: true,
      body: { text, tags: tags ?? null, priority: priority ?? null },
    }),
};

// --- Plan (Slice 2: Home hydration) ---
// GET /plan returns an object envelope { doctor_requests, plan_items }. The
// generated OpenAPI types.ts is stale (no /plan path yet), so the response is
// typed loosely here and cast to a hand-written contract in lib/plan-backend.ts
// — mirroring how uploads.listAnalyses + uploads-backend.ts handle analyses.
export const plan = {
  get: () => request<Record<string, unknown>>("GET", "/plan", { auth: true }),
};

// --- Doctor web surface (Slice C: D01 queue + D02 summary + write verbs) ---
// Responses are typed loosely here (the generated types.ts predates these paths)
// and given hand-written contracts in lib/doctor-backend.ts — same idiom as
// uploads.listAnalyses / plan.get.
export const doctor = {
  queue: () => request<Record<string, unknown>>("GET", "/doctor/queue", { auth: true }),
  summary: (patientPublicId: string) =>
    request<Record<string, unknown>>(
      "GET",
      `/doctor/patients/${patientPublicId}/summary`,
      { auth: true },
    ),
  // Dispatch a doctor request + plan items. patient_public_id is a query param;
  // the endpoint requires an Idempotency-Key (idempotent: true).
  sendRequest: (patientPublicId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(
      "POST",
      `/doctor/requests?patient_public_id=${patientPublicId}`,
      { auth: true, body, idempotent: true },
    ),
  // Stamp the structuring-metadata verdict on one OCR field (confirmed | rejected).
  stampVerdict: (
    patientPublicId: string,
    analysisPublicId: string,
    fieldKey: string,
    verdict: "confirmed" | "rejected",
  ) =>
    request<Record<string, unknown>>(
      "POST",
      `/doctor/patients/${patientPublicId}/analyses/${analysisPublicId}/ocr-fields/${encodeURIComponent(
        fieldKey,
      )}/verdict`,
      { auth: true, body: { verdict } },
    ),
  // Accept a structured analysis into the clinical grid + advance its plan item.
  acknowledge: (patientPublicId: string, analysisPublicId: string) =>
    request<Record<string, unknown>>(
      "POST",
      `/doctor/patients/${patientPublicId}/analyses/${analysisPublicId}/acknowledge`,
      { auth: true },
    ),
};

// --- Admin web surface (Slice D: A01 overview + A02 access audit, PII-blind) ---
// Read-only aggregate reads under the clinic_admin role. Responses are typed
// loosely here (the generated types.ts predates these paths) and given
// hand-written contracts in lib/admin-backend.ts — same idiom as doctor.queue.
export const admin = {
  overview: () => request<Record<string, unknown>>("GET", "/admin/overview", { auth: true }),
  access: () => request<Record<string, unknown>>("GET", "/admin/access", { auth: true }),
  audit: () => request<Record<string, unknown>>("GET", "/admin/audit", { auth: true }),
};

export const apiClient = {
  auth,
  onboarding,
  me,
  uploads,
  plan,
  doctor,
  admin,
  setTokens,
  getAccessToken,
};
