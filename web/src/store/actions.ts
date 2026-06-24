import { getState, setState, useInteldoc } from './store'
import { SEED } from './seed'
import type {
  AccountDraft,
  Analysis,
  AnalysisRejectionReason,
  AnalysisResendReason,
  AnalysisType,
  Appointment,
  AuditEvent,
  AuditEventType,
  Complaint,
  ComplaintTag,
  ConsentBundle,
  ConsentId,
  ConsentRecord,
  Document,
  DocumentType,
  DoctorRequest,
  ESignRecord,
  Gender,
  ID,
  OrderIntent,
  OrderKind,
  Patient,
  PlanItem,
  WebRole,
} from './types'
import { runOcr } from '../lib/ocr-mock'
import {
  ACCESS_GRANT_DOCUMENT,
  ACCESS_GRANT_VERSION,
} from '../lib/consent-text'
import {
  hashSignedDocument,
  submitAccessGrant,
  submitConsentBundle as submitConsentBundleMock,
} from '../lib/onboarding-mocks'
import { commitOnboardingBackend } from '../lib/onboarding-backend'
import {
  editOcrFieldBackend,
  loadAnalysesBackend,
  uploadAnalysisBackend,
} from '../lib/uploads-backend'
import { loadPlanBackend } from '../lib/plan-backend'
import { loadAdminBackend } from '../lib/admin-backend'
import {
  acknowledgeAnalysisBackend,
  ensureWebSession,
  hydrateDoctorRecordBackend,
  sendRequestBackend,
  stampVerdictBackend,
} from '../lib/doctor-backend'
import { auth as apiAuth, getAccessToken, me as apiMe, setTokens } from '../api/client'
import { BACKEND_MODE } from '../api/config'
import { track } from '../lib/analytics'
import { maskName } from '../lib/formatters'

// ─── ID generator ────────────────────────────────────────────────────────────
let _seq = 1
function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`
}
function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Stamp the «Сохранено» indicator on the prep screen. Called from any
 * checklist-mutating action so the patient sees explicit reassurance that
 * their last input was persisted (state lives in localStorage via
 * zustand/persist — the timestamp surfaces that fact in UI).
 */
function touchSaved(): void {
  setState({ lastSavedAt: nowIso() })
}

// ─── Onboarding ─────────────────────────────────────────────────────────────
//
// Two-step onboarding: account → consents (with the clinic access grant as a
// consent block on the same screen).
//   Screen 2 (account)  → saveAccountDraft   : transient identity draft
//   Screen 3 (consents) → signAccessGrant    : Patient + AccessGrant + ESignRecord
//                                              (fires inside the clinic_access
//                                              modal when the patient signs)
//                       → saveConsentDraft   : transient consent records
//                       → finalizeOnboarding : commits ConsentBundle linked to
//                                              the e-sign, clears drafts, flips
//                                              hasCompletedOnboarding
//
// Two-step commit on the last screen so the gate flag flips exactly when the
// patient taps continue (between sign and continue the user is still on the
// Consents screen, which the OnboardingGate does NOT whitelist).
//
// Drafts live in the store (not component state) so back-navigation across
// the routes doesn't lose typed input. `submitConsentBundle` is still
// exported for `completeEntryFlow` (demo fast-forward), which runs the
// commits in legacy order.

export function saveAccountDraft(draft: AccountDraft): void {
  setState({ accountDraft: draft })
}

export function saveConsentDraft(records: ConsentRecord[]): void {
  setState({ consentDraft: records })
}

export interface SignAccessGrantArgs {
  /** Convenience override; otherwise we read the in-store draft. */
  draft?: AccountDraft
}

/**
 * Persist Patient + AccessGrant + ESignRecord. Called after the user ticks
 * the confirmation checkbox and taps «Подписать» inside the clinic_access
 * consent block on the Consents screen.
 *
 * OTP step is omitted per pilot decision; signature is recorded with method
 * `mock_no_otp` for the audit trail to flag the deviation.
 */
export async function signAccessGrant(
  args: SignAccessGrantArgs = {},
): Promise<{ patient: Patient; esign: ESignRecord; grantId: ID }> {
  const state = getState()
  const draft = args.draft ?? state.accountDraft
  if (!draft) throw new Error('signAccessGrant: account draft missing')
  if (!draft.gender) throw new Error('signAccessGrant: gender missing')

  const patientId: ID = 'p1'
  const grantId = nextId('ag')
  const esignId = nextId('esign')
  const ts = nowIso()

  const patient: Patient = {
    id: patientId,
    name: draft.name.trim(),
    dob: draft.dob,
    gender: draft.gender,
    phone: draft.phone.trim(),
    email: draft.email?.trim() || undefined,
    identifiers: {},
    partnerClinic: 'enc',
    department: 'Отделение диабетологии',
    attendingDoctorId: 'd1',
    createdAt: ts,
  }

  const documentHash = await hashSignedDocument(
    `${ACCESS_GRANT_VERSION}|${ACCESS_GRANT_DOCUMENT}|recipient=enc|user=${patientId}`,
  )

  const esign: ESignRecord = {
    id: esignId,
    userId: patientId,
    documentHash,
    signedAt: ts,
    signatureMethod: 'mock_no_otp',
    recipientClinicId: 'enc',
    partnerId: 'enc',
  }

  setState((s) => ({
    patients: [
      ...s.patients.filter((p) => p.id !== patientId),
      patient,
    ],
    accessGrants: [
      ...s.accessGrants.filter((g) => g.patientId !== patientId),
      {
        id: grantId,
        patientId,
        clinicId: 'enc',
        scope: 'lifetime-clinic',
        grantedAt: ts,
        // Lifetime clinic grant — no expiry (the patient app renders
        // «бессрочно»). The real system clock is months ahead of the demo
        // frame, so a fixed date here would read as already expired.
        // Static recent-view timestamp so the patient sees a believable
        // "last viewed" line on Profile without backend access events.
        lastViewedAt: '2026-04-24T09:12:00Z',
        // Admin display metadata so the patient's own grant appears — masked —
        // as row 1 of the A02 audit, the cross-surface revocation hero.
        admin: {
          mask: maskName(patient.name),
          doctorName: 'Др. Соколов А.В.',
          scopeLabel: 'Анализы и подготовка',
          departmentLabel: 'Эндокринология взрослая',
        },
      },
    ],
    esignRecords: [
      ...s.esignRecords.filter((r) => r.userId !== patientId),
      esign,
    ],
    auditEvents: [
      {
        id: nextId('ae'),
        type: 'access_granted' as const,
        target: 'Эндокринология взрослая',
        timestamp: ts,
        source: 'patient' as const,
        note: 'пациент выдал доступ Эндокор',
      },
      ...s.auditEvents,
    ],
    currentPatientId: patientId,
    accessSigned: true,
  }))

  track({ name: 'access_grant_signed', esignId })

  // Backend stub — currently just simulates latency.
  await submitAccessGrant()
  track({ name: 'access_granted', grantId, esignId })

  return { patient, esign, grantId }
}

/**
 * Finalize onboarding from the Consents screen. Commits the consent bundle
 * (linked to the e-sign created by signAccessGrant inside the clinic_access
 * block), clears drafts, and flips `hasCompletedOnboarding`. This is the
 * single moment where the onboarding gate transitions from "in entry" →
 * "in app".
 *
 * Held separate from signAccessGrant so the flag flip happens exactly when
 * the user taps «Принять и продолжить» — not while the access-grant modal is
 * still open — which keeps OnboardingGate's `/patient/entry/setup` whitelist
 * correct.
 */
export async function finalizeOnboarding(): Promise<ConsentBundle | null> {
  const state = getState()
  const userId = state.currentPatientId
  if (!userId) throw new Error('finalizeOnboarding: no active patient')
  const linkedEsign = state.esignRecords.find((r) => r.userId === userId)
  if (!linkedEsign) throw new Error('finalizeOnboarding: no e-sign record')

  const draftConsents = state.consentDraft
  const consentBundle: ConsentBundle | null = draftConsents
    ? {
        bundleId: nextId('bundle'),
        userId,
        capturedAt: nowIso(),
        ipAddress: 'browser-unknown',
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
        consents: draftConsents,
        linkedEsignId: linkedEsign.id,
        partnerId: 'enc',
      }
    : null

  // Network call must complete BEFORE we flip the gate flag — otherwise
  // OnboardingGate re-renders while the patient is still on /consents (which
  // isn't whitelisted) and bounces them straight to /home.
  //
  // BACKEND_MODE: this is the real atomic commit (patient + access grant +
  // consents) against the API, plus a silent session mint. A failure throws so
  // the Consents screen surfaces it and the gate flag stays false. MOCK mode
  // keeps the latency-only stub unchanged.
  let backendPatientPublicId: string | null = null
  if (BACKEND_MODE) {
    const patient = state.patients.find((p) => p.id === userId)
    if (!patient || !patient.gender) {
      throw new Error('finalizeOnboarding: patient identity missing for commit')
    }
    const result = await commitOnboardingBackend({
      name: patient.name,
      dob: patient.dob,
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      consents: draftConsents ?? [],
      documentHash: linkedEsign.documentHash,
    })
    // Capture the patient's backend public_id (previously discarded). It is the
    // clinical-record alias returned by the commit and stays stable across QR
    // re-scans (dedup), so it's safe to persist as the patient's backend handle.
    backendPatientPublicId = result.patientPublicId
  } else if (consentBundle) {
    await submitConsentBundleMock()
  }

  setState((s) => ({
    consentBundles: consentBundle
      ? [
          ...s.consentBundles.filter((b) => b.userId !== userId),
          consentBundle,
        ]
      : s.consentBundles,
    hasCompletedOnboarding: true,
    accountDraft: null,
    consentDraft: null,
    // Only set when the commit returned one — never clobber a prior value with null.
    ...(backendPatientPublicId ? { backendPatientPublicId } : {}),
  }))

  if (consentBundle) {
    track({ name: 'consents_submitted', bundle: consentBundle })
  }
  return consentBundle
}

/**
 * Persist the consent bundle and mark onboarding complete. Legacy helper used
 * by the demo fast-forward path (`completeEntryFlow`). Real onboarding goes
 * through saveConsentDraft + signAccessGrant + finalizeOnboarding.
 */
export async function submitConsentBundle(
  consents: ConsentRecord[],
): Promise<ConsentBundle> {
  const state = getState()
  const userId = state.currentPatientId
  if (!userId) throw new Error('submitConsentBundle: no active patient')
  const linkedEsign = state.esignRecords.find((r) => r.userId === userId)
  if (!linkedEsign) throw new Error('submitConsentBundle: no e-sign record')

  const bundle: ConsentBundle = {
    bundleId: nextId('bundle'),
    userId,
    capturedAt: nowIso(),
    ipAddress: 'browser-unknown',
    userAgent:
      typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
    consents,
    linkedEsignId: linkedEsign.id,
    partnerId: 'enc',
  }

  setState((s) => ({
    consentBundles: [
      ...s.consentBundles.filter((b) => b.userId !== userId),
      bundle,
    ],
    hasCompletedOnboarding: true,
    accountDraft: null,
    accessSigned: false,
  }))

  track({ name: 'consents_submitted', bundle })

  await submitConsentBundleMock()
  return bundle
}

/** Idempotent helper — used by demo segments and the «Сбросить» toolbar. */
export function clearOnboarding() {
  setState({
    accountDraft: null,
    consentDraft: null,
    accessSigned: false,
    hasCompletedOnboarding: false,
  })
}

// ─── Legacy wrapper (kept for segments.ts back-compat during migration) ─────
// One-shot helper that goes from zero to a fully onboarded p1. Used by the
// demo fast-forward segments only. Real onboarding goes through saveDraft →
// signAccessGrant → submitConsentBundle.
export async function completeEntryFlow(input: {
  name: string
  dob: string
  gender: Gender
  phone: string
  email?: string
}): Promise<Patient> {
  saveAccountDraft({
    name: input.name,
    dob: input.dob,
    gender: input.gender,
    phone: input.phone,
    email: input.email ?? '',
  })
  const { patient } = await signAccessGrant()
  await submitConsentBundle([
    {
      id: 'pdn_general',
      version: ACCESS_GRANT_VERSION,
      accepted: true,
      ackMechanism: 'scroll_to_end',
    },
    {
      id: 'pdn_special',
      version: ACCESS_GRANT_VERSION,
      accepted: true,
      ackMechanism: 'scroll_to_end',
    },
  ])
  return patient
}

// ─── Backend hydration (Slice 2: patient live loop) ──────────────────────────
//
// On every app load in BACKEND_MODE, re-derive the live patient's clinical state
// from the API using the JWT that survives reload — so the app reads REAL data
// instead of trusting whatever mock snapshot zustand/persist happened to keep.
// We replace ONLY the current patient's analyses, plan items, and doctor
// requests; the seeded demo patients (p2–p4) and non-clinical collections
// (appointments, access grants) are left untouched so the doctor/admin surfaces
// keep their scripted data.
//
// The GET /auth/session call is the lightweight session-refresh hook: it
// validates the bearer token before we read. A dead/expired token — or any
// fetch failure — is non-fatal: we log and fall back to the persisted snapshot,
// never logging the patient out mid-demo. No-op outside BACKEND_MODE or without
// a token, so the offline walkthrough is completely unaffected.
export async function hydratePatientFromBackend(): Promise<void> {
  if (!BACKEND_MODE) return
  if (!getAccessToken()) return
  const { currentPatientId } = getState()
  if (!currentPatientId) return

  try {
    // Session refresh hook — confirms the token is still valid before reading.
    await apiAuth.session()

    const [analyses, planData] = await Promise.all([
      loadAnalysesBackend(currentPatientId),
      loadPlanBackend(currentPatientId),
    ])

    // Cross-link analyses ↔ plan items. The server tracks the link on the plan
    // side (plan_item.linked_analysis_public_id → PlanItem.linkedAnalysisId);
    // mirror it back onto Analysis.linkedPlanItemId so both directions resolve.
    const planItemByAnalysis = new Map<ID, ID>()
    for (const pi of planData.planItems) {
      if (pi.linkedAnalysisId) planItemByAnalysis.set(pi.linkedAnalysisId, pi.id)
    }
    const linkedAnalyses = analyses.map((a) => {
      const piId = planItemByAnalysis.get(a.id)
      return piId ? { ...a, linkedPlanItemId: piId } : a
    })

    setState((s) => ({
      analyses: [
        ...s.analyses.filter((a) => a.patientId !== currentPatientId),
        ...linkedAnalyses,
      ],
      planItems: [
        ...s.planItems.filter((p) => p.patientId !== currentPatientId),
        ...planData.planItems,
      ],
      doctorRequests: [
        ...s.doctorRequests.filter((r) => r.patientId !== currentPatientId),
        ...planData.doctorRequests,
      ],
    }))
  } catch (e) {
    console.error('[backend] hydratePatientFromBackend failed; using persisted state', e)
  }
}

// ─── Returning-patient login (ENG-09) ────────────────────────────────────────
// Real phone → SMS-OTP sign-in for a patient who already onboarded. BACKEND_MODE
// only: it runs the live OTP round-trip (rejected by the backend unless the code
// is valid), pulls the authenticated identity, and hydrates the patient surface.
// In a production build (DEMO_MODE off) this is the only way back into the app.

interface BackendIdentity {
  name?: string
  dob?: string
  gender?: Gender
  oms?: string
}

export async function loginPatientFromBackend(phone: string, code: string): Promise<void> {
  if (!BACKEND_MODE) throw new Error('loginPatientFromBackend requires BACKEND_MODE')
  // Throws ApiError(401) on a wrong code or a phone with no account (→ onboarding).
  await apiAuth.verifyOtp(phone, code)

  // Best-effort: show the real person on Home. A hiccup here must not fail login.
  let identity: BackendIdentity | null = null
  try {
    const meData = (await apiMe.get()) as { identity?: BackendIdentity | null }
    identity = meData.identity ?? null
  } catch {
    identity = null
  }

  // Reuse the persisted handle if any, else the seeded persona slot ('p1') so the
  // cross-surface demo (doctor queue / admin audit) stays coherent. The handle is
  // only a local tag — the live data is bound to the JWT, not this id.
  const id: ID = getState().currentPatientId ?? 'p1'
  setState((s) => {
    const existing = s.patients.find((p) => p.id === id)
    // Identity (name/dob/gender/phone/identifiers) ALWAYS derives from the
    // authenticated /me — never the previously persisted persona. Otherwise a /me
    // hiccup could render person A's PII under person B's session. Non-identifying
    // clinical scaffolding (diagnosis, baseline) is preserved from `existing` for
    // demo coherence.
    const patient: Patient = {
      ...(existing ?? {}),
      id,
      name: identity?.name ?? 'Пациент',
      dob: identity?.dob ?? '',
      gender: identity?.gender ?? 'female',
      phone: phone.trim(),
      identifiers: identity?.oms ? { oms: identity.oms } : {},
      partnerClinic: existing?.partnerClinic ?? 'enc',
      department: existing?.department ?? 'Отделение диабетологии',
      attendingDoctorId: existing?.attendingDoctorId ?? 'd1',
      createdAt: existing?.createdAt ?? nowIso(),
    }
    return {
      patients: [...s.patients.filter((p) => p.id !== id), patient],
      currentPatientId: id,
      hasCompletedOnboarding: true,
    }
  })

  await hydratePatientFromBackend()
}

/** End the patient session (token cleared). The auth gate then routes to login. */
export function signOutPatient(): void {
  setTokens(null, null)
  setState({ currentPatientId: null })
}

// ─── Uploads ────────────────────────────────────────────────────────────────

/** Insert a new analysis and link the plan item it fulfils (if any). */
function commitAnalysis(analysis: Analysis, planItemId?: ID): void {
  setState((s) => {
    const planItems = planItemId
      ? s.planItems.map((p) =>
          p.id === planItemId
            ? { ...p, status: 'uploaded' as const, linkedAnalysisId: analysis.id }
            : p,
        )
      : s.planItems
    return {
      analyses: [analysis, ...s.analyses],
      planItems,
    }
  })
  touchSaved()
}

export async function uploadAnalysis(args: {
  type: AnalysisType
  planItemId?: ID
  fileUrl?: string
  /** Real captured document (BACKEND_MODE) — proxied to storage and OCR'd. */
  file?: Blob
}): Promise<Analysis> {
  const { type, planItemId, fileUrl = '', file } = args
  const { currentPatientId } = getState()
  if (!currentPatientId) throw new Error('no active patient')

  // BACKEND_MODE: real upload → register round-trip, authenticated by the patient
  // JWT. On any failure we fall back to the mock OCR below so the OCR spinner
  // never dead-ends (demo guardrail). MOCK mode keeps the runOcr stub.
  if (BACKEND_MODE) {
    try {
      const mapped = await uploadAnalysisBackend({ type, file })
      const analysis: Analysis = {
        id: nextId('an'),
        patientId: currentPatientId,
        type,
        label: mapped.label,
        date: mapped.date,
        originalFileUrl: fileUrl,
        qualityCheck: mapped.qualityCheck,
        ocrFields: mapped.ocrFields,
        ocrFieldMeta: mapped.ocrFieldMeta,
        linkedPlanItemId: planItemId,
        status: 'uploaded',
        uploadedAt: nowIso(),
        backendId: mapped.backendId,
      }
      commitAnalysis(analysis, planItemId)
      return analysis
    } catch (e) {
      console.error('[backend] uploadAnalysis failed, falling back to mock OCR', e)
    }
  }

  const ocr = await runOcr(type)

  const analysis: Analysis = {
    id: nextId('an'),
    patientId: currentPatientId,
    type,
    label: ocr.label,
    date: ocr.fields['дата'] ?? '',
    originalFileUrl: fileUrl,
    qualityCheck: 'clear',
    ocrFields: ocr.fields,
    linkedPlanItemId: planItemId,
    status: 'uploaded',
    uploadedAt: nowIso(),
  }

  commitAnalysis(analysis, planItemId)
  return analysis
}

/**
 * Reuse an existing analysis as the result for a doctor-prescribed plan item.
 * Mirrors `uploadAnalysis` for the link side-effects but does not create a new
 * Analysis. Used by the «У вас уже есть подходящий» suggestion on the prep
 * checklist.
 */
export function reuseAnalysisForPlanItem(planItemId: ID, analysisId: ID): void {
  setState((s) => ({
    planItems: s.planItems.map((p) =>
      p.id === planItemId
        ? { ...p, status: 'uploaded' as const, linkedAnalysisId: analysisId }
        : p,
    ),
    analyses: s.analyses.map((a) =>
      a.id === analysisId ? { ...a, linkedPlanItemId: planItemId } : a,
    ),
  }))
  touchSaved()
}

/**
 * Patient transcription edit. NO LONGER WIRED to the patient UI: the patient
 * cannot edit clinical content of a processed analysis (read-only review policy
 * — mirrors the doctor's "structuring metadata, not clinical content" rule).
 * Misreads are flagged via {@link reportOcrFieldIssue}, not edited. Kept for the
 * backend endpoint contract; do not re-attach to a patient screen.
 */
export function editOcrField(analysisId: ID, field: string, value: string): void {
  // Optimistic local update first — the UI stays snappy and synchronous callers
  // (UploadFlow review, AnalysisCardScreen) don't need to await.
  setState((s) => ({
    analyses: s.analyses.map((a) =>
      a.id === analysisId
        ? { ...a, ocrFields: { ...a.ocrFields, [field]: value } }
        : a,
    ),
  }))
  touchSaved()

  // BACKEND_MODE: round-trip the correction for analyses registered server-side
  // (have a backendId) on a real OCR field (has meta). Fire-and-forget: a hiccup
  // must not undo the local edit. Seed/mock analyses skip this.
  if (BACKEND_MODE) {
    const a = getState().analyses.find((x) => x.id === analysisId)
    if (a?.backendId && a.ocrFieldMeta && field in a.ocrFieldMeta) {
      void editOcrFieldBackend(a.backendId, field, value).catch((e) =>
        console.error('[backend] editOcrField failed', e),
      )
    }
  }
}

/**
 * Patient flags a recognised value as misrecognised — WITHOUT changing it. The
 * value stays read-only; this records a data-integrity report routed to two
 * destinations (Эндокор · исправление записи + IntelDoc · аудит), per the support
 * model. The clinician corrects it via the doctor verification flow.
 */
export function reportOcrFieldIssue(analysisId: ID, field: string): void {
  const reportedAt = nowIso()
  setState((s) => ({
    analyses: s.analyses.map((a) =>
      a.id === analysisId
        ? {
            ...a,
            ocrFieldMeta: {
              ...a.ocrFieldMeta,
              [field]: { ...a.ocrFieldMeta?.[field], patientReport: { reportedAt } },
            },
          }
        : a,
    ),
  }))
  track({ name: 'ocr_field_issue_reported', analysisId, field })
  touchSaved()
}

export function uploadDocument(args: {
  type: DocumentType
  label: string
  fileUrl?: string
}): Document {
  const { type, label, fileUrl = '' } = args
  const { currentPatientId } = getState()
  if (!currentPatientId) throw new Error('no active patient')
  const doc: Document = {
    id: nextId('doc'),
    patientId: currentPatientId,
    type,
    label,
    originalFileUrl: fileUrl,
    qualityCheck: 'clear',
    status: 'uploaded',
    uploadedAt: nowIso(),
  }
  setState((s) => ({ documents: [doc, ...s.documents] }))
  touchSaved()
  return doc
}

export function addComplaint(text: string): Complaint | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const { currentPatientId } = getState()
  if (!currentPatientId) throw new Error('no active patient')
  const c: Complaint = {
    id: nextId('c'),
    patientId: currentPatientId,
    text: trimmed,
    createdAt: nowIso(),
  }
  setState((s) => ({ complaints: [c, ...s.complaints] }))
  touchSaved()
  return c
}

// ─── Identity & medical baseline (Profile · «Личная карточка», «Базовые данные») ─
//
// Identity edits clear the clinic-side verification timestamp — the chip flips
// to «Изменения отправлены в Эндокор» until a (mocked) clinic-side recheck. The
// prototype never re-verifies automatically; the demo can call markIdentityVerified
// from the role switcher if needed.
export interface IdentityPatch {
  name?: string
  dob?: string
  gender?: Gender
  oms?: string
}

export function updatePatientIdentity(patch: IdentityPatch): void {
  const { currentPatientId } = getState()
  if (!currentPatientId) throw new Error('no active patient')
  setState((s) => ({
    patients: s.patients.map((p) =>
      p.id === currentPatientId
        ? {
            ...p,
            name: patch.name ?? p.name,
            dob: patch.dob ?? p.dob,
            gender: patch.gender ?? p.gender,
            identifiers:
              patch.oms !== undefined
                ? { ...p.identifiers, oms: patch.oms || undefined }
                : p.identifiers,
            identityUpdatedAt: nowIso(),
          }
        : p,
    ),
  }))
  track({ name: 'identity_updated' })
}

export interface BaselinePatch {
  heightCm?: number
  weightKg?: number
  chronicConditions?: string[]
  allergies?: string[]
}

export function updatePatientBaseline(patch: BaselinePatch): void {
  const { currentPatientId } = getState()
  if (!currentPatientId) throw new Error('no active patient')
  setState((s) => ({
    patients: s.patients.map((p) =>
      p.id === currentPatientId
        ? {
            ...p,
            heightCm: patch.heightCm ?? p.heightCm,
            weightKg: patch.weightKg ?? p.weightKg,
            chronicConditions:
              patch.chronicConditions ?? p.chronicConditions,
            allergies: patch.allergies ?? p.allergies,
            baselineUpdatedAt: nowIso(),
          }
        : p,
    ),
  }))
  track({ name: 'baseline_updated' })
}

// ─── Doctor-side ────────────────────────────────────────────────────────────
export function openPatientRecord(patientId: ID): void {
  setState({ doctorActivePatientId: patientId })
}

export function sendRequest(args: {
  title: string
  body: string
  items: Array<{
    analysisType: AnalysisType
    label: string
    reason?: string
    /** Order category — defaults to `'lab'` for backward compatibility. */
    kind?: OrderKind
    /** Optional patient-facing prep instruction (see PlanItem.prep). */
    prep?: string
  }>
  /**
   * Patient-facing clinical intent of the batch — surfaced as the request's
   * category header on the patient side and as a chip on the doctor's
   * dispatched-orders ledger. Optional for legacy callers.
   */
  intent?: OrderIntent
}): DoctorRequest {
  const { doctorActivePatientId, currentDoctorId } = getState()
  const patientId = doctorActivePatientId
  if (!patientId) throw new Error('no active doctor patient')

  const requestId = nextId('req')
  const created = nowIso()

  const planItems: PlanItem[] = args.items.map((it) => ({
    id: nextId('pi'),
    patientId,
    requestId,
    analysisType: it.analysisType,
    label: it.label,
    reason: it.reason,
    status: 'assigned' as const,
    createdAt: created,
    kind: it.kind,
    prep: it.prep,
  }))

  const request: DoctorRequest = {
    id: requestId,
    patientId,
    fromDoctorId: currentDoctorId,
    title: args.title,
    body: args.body,
    planItemIds: planItems.map((p) => p.id),
    createdAt: created,
    seenByPatient: false,
    intent: args.intent,
  }

  setState((s) => ({
    doctorRequests: [request, ...s.doctorRequests],
    planItems: [...planItems, ...s.planItems],
  }))
  // BACKEND_MODE: dispatch the request to the live API so the patient sees it on
  // their next plan hydration. Optimistic — the local insert above already
  // updated the doctor UI; a hiccup must not block dispatch.
  if (BACKEND_MODE && patientId) {
    void sendRequestBackend(patientId, {
      title: args.title,
      body: args.body,
      intent: args.intent ?? null,
      items: args.items.map((it) => ({
        analysis_type: it.analysisType,
        label: it.label,
        reason: it.reason ?? null,
        kind: it.kind ?? null,
        prep: it.prep ?? null,
      })),
    }).catch((e) => console.error('[backend] sendRequest failed', e))
  }
  return request
}

/**
 * One-tap «Запросить анализ» on an existing plan item — used by the doctor's
 * visit-agenda when an assigned analysis is overdue or still pending. Stamps
 * the plan item with `lastRequestedAt` and re-flags the parent request as
 * unseen so the patient surface treats it as a fresh nudge.
 */
export function requestPlanItem(planItemId: ID): void {
  const now = nowIso()
  setState((s) => {
    const item = s.planItems.find((p) => p.id === planItemId)
    if (!item) return {}
    return {
      planItems: s.planItems.map((p) =>
        p.id === planItemId ? { ...p, lastRequestedAt: now } : p,
      ),
      doctorRequests: s.doctorRequests.map((r) =>
        r.id === item.requestId ? { ...r, seenByPatient: false } : r,
      ),
    }
  })
}

export function openNotification(requestId: ID): void {
  setState((s) => ({
    doctorRequests: s.doctorRequests.map((r) =>
      r.id === requestId ? { ...r, seenByPatient: true } : r,
    ),
  }))
}

export function acknowledgeAnalysis(analysisId: ID): void {
  const before = getState()
  const target = before.analyses.find((a) => a.id === analysisId)
  setState((s) => {
    const analysis = s.analyses.find((a) => a.id === analysisId)
    if (!analysis) return {}
    return {
      analyses: s.analyses.map((a) =>
        a.id === analysisId ? { ...a, status: 'acknowledged' as const } : a,
      ),
      planItems: s.planItems.map((p) =>
        p.id === analysis.linkedPlanItemId
          ? { ...p, status: 'acknowledged' as const }
          : p,
      ),
    }
  })
  if (BACKEND_MODE && target?.backendId && before.doctorActivePatientId) {
    void acknowledgeAnalysisBackend(before.doctorActivePatientId, target.backendId).catch((e) =>
      console.error('[backend] acknowledgeAnalysis failed', e),
    )
  }
  touchSaved()
}

/**
 * Look up the current doctor's display name for the audit footprint. Falls
 * back to the role label if the seed has no doctor record — the prototype is
 * single-doctor, so this is effectively constant.
 */
function currentDoctorDisplay(): string {
  const s = getState()
  const doc = s.doctors.find((d) => d.id === s.currentDoctorId)
  return doc?.name ?? 'Дежурный врач'
}

/**
 * Per-field OCR verdict. Stamps the field with verifier + timestamp and, once
 * every low-confidence field on the analysis is resolved (either confirmed or
 * rejected as an OCR error), flips the analysis status to `acknowledged` so
 * it drops out of the doctor's verification queue. Rejected-as-OCR-error
 * fields stay visible in audit views; only the analysis-level «pending»
 * footprint clears.
 */
export function verifyOcrField(
  analysisId: ID,
  field: string,
  decision: 'confirmed' | 'rejected',
): void {
  const verifiedBy = currentDoctorDisplay()
  const verifiedAt = nowIso()
  setState((s) => {
    const analyses = s.analyses.map((a) => {
      if (a.id !== analysisId) return a
      const meta = a.ocrFieldMeta?.[field]
      if (!meta) return a
      const nextMeta = {
        ...a.ocrFieldMeta,
        [field]: {
          ...meta,
          verification: { decision, verifiedBy, verifiedAt },
        },
      }
      // Auto-promote analysis to `acknowledged` when no low-confidence
      // field is still pending. Lets the verification queue self-empty.
      const allResolved = Object.entries(nextMeta).every(([, m]) =>
        !m?.lowConfidence || !!m?.verification,
      )
      return {
        ...a,
        ocrFieldMeta: nextMeta,
        status: allResolved && a.status === 'uploaded'
          ? ('acknowledged' as const)
          : a.status,
      }
    })
    // Mirror plan-item status only when the analysis itself was promoted.
    const promoted = analyses.find(
      (a) => a.id === analysisId && a.status === 'acknowledged',
    )
    const planItems = promoted?.linkedPlanItemId
      ? s.planItems.map((p) =>
          p.id === promoted.linkedPlanItemId
            ? { ...p, status: 'acknowledged' as const }
            : p,
        )
      : s.planItems
    return { analyses, planItems }
  })
  // BACKEND_MODE: stamp the verdict on the live OCR field. The optimistic local
  // update above already moved the drawer; the backend persists + audits it
  // (and may auto-acknowledge the analysis once all low-conf fields resolve).
  if (BACKEND_MODE) {
    const s = getState()
    const a = s.analyses.find((x) => x.id === analysisId)
    if (a?.backendId && s.doctorActivePatientId) {
      void stampVerdictBackend(s.doctorActivePatientId, a.backendId, field, decision).catch((e) =>
        console.error('[backend] verifyOcrField failed', e),
      )
    }
  }
  track({ name: 'ocr_field_verified', analysisId, field, decision })
  touchSaved()
}

/**
 * Wrong-upload rejection. Used when the artefact is technically OCR-readable
 * but doesn't belong to this patient record — wrong patient, wrong clinic,
 * wrong panel, or a duplicate of something already accepted. Distinct from a
 * per-field «ошибка OCR» verdict: this is about the source document's
 * identity, not the reading. Keeps the artefact in audit for the partner
 * clinic and unlinks any plan item that was waiting on it.
 */
export function rejectAnalysisAsWrongUpload(
  analysisId: ID,
  reason: AnalysisRejectionReason,
): void {
  const rejectedBy = currentDoctorDisplay()
  const rejectedAt = nowIso()
  setState((s) => {
    const analysis = s.analyses.find((a) => a.id === analysisId)
    if (!analysis) return {}
    return {
      analyses: s.analyses.map((a) =>
        a.id === analysisId
          ? {
              ...a,
              status: 'rejected' as const,
              rejection: { reason, rejectedBy, rejectedAt },
            }
          : a,
      ),
      planItems: analysis.linkedPlanItemId
        ? s.planItems.map((p) =>
            p.id === analysis.linkedPlanItemId
              ? { ...p, status: 'assigned' as const, linkedAnalysisId: undefined }
              : p,
          )
        : s.planItems,
    }
  })
  track({ name: 'analysis_rejected_as_wrong_upload', analysisId, reason })
  touchSaved()
}

/**
 * Resend request — third path when the doctor can neither confirm nor
 * reject the artefact and needs the patient to re-upload (poor quality,
 * missing pages, illegible date, etc.). The original artefact stays in the
 * audit; the analysis drops out of the verification queue until the patient
 * uploads a replacement.
 */
export function requestAnalysisResend(
  analysisId: ID,
  reason: AnalysisResendReason,
): void {
  const requestedBy = currentDoctorDisplay()
  const requestedAt = nowIso()
  setState((s) => ({
    analyses: s.analyses.map((a) =>
      a.id === analysisId
        ? {
            ...a,
            status: 'resend_requested' as const,
            resendRequest: { reason, requestedBy, requestedAt },
          }
        : a,
    ),
  }))
  track({ name: 'analysis_resend_requested', analysisId, reason })
  touchSaved()
}

// ─── Booking ────────────────────────────────────────────────────────────────
export function bookMainAppointment(args: { date: string }): Appointment {
  const { currentPatientId } = getState()
  if (!currentPatientId) throw new Error('no active patient')
  const appt: Appointment = {
    id: nextId('appt'),
    patientId: currentPatientId,
    doctorId: getState().currentDoctorId,
    type: 'main',
    date: args.date,
    status: 'scheduled',
    createdAt: nowIso(),
  }
  setState((s) => ({ appointments: [appt, ...s.appointments] }))
  touchSaved()
  return appt
}

// ─── Complaint tags (patient checklist spec 017) ────────────────────────────
export function setComplaintTags(complaintId: ID, tags: ComplaintTag[]): void {
  setState((s) => ({
    complaints: s.complaints.map((c) =>
      c.id === complaintId ? { ...c, tags } : c,
    ),
  }))
  touchSaved()
}

// ─── Access lifecycle (patient + admin write; both stamp the audit trail) ────

/**
 * Revoke an access grant. The originating surface is recorded on the grant
 * (`revokedBy`) and the audit event (`source`) so the cross-surface views can
 * attribute the action honestly — the patient is told «отозван администратором
 * Эндокор» rather than seeing the grant silently vanish (CLAUDE.md transparency).
 */
export function revokeAccess(
  grantId: ID,
  opts: { source?: 'patient' | 'admin' } = {},
): void {
  const source = opts.source ?? 'patient'
  const ts = nowIso()
  setState((s) => {
    const grant = s.accessGrants.find((g) => g.id === grantId)
    if (!grant) return {}
    return {
      accessGrants: s.accessGrants.map((g) =>
        g.id === grantId ? { ...g, revokedAt: ts, revokedBy: source } : g,
      ),
      auditEvents: [
        {
          id: nextId('ae'),
          type: 'access_revoked' as const,
          target: grant.department ?? 'ЛПУ',
          timestamp: ts,
          source,
          note:
            source === 'admin'
              ? 'администратор Эндокор отозвал доступ'
              : 'пациент отозвал доступ',
        },
        ...s.auditEvents,
      ],
    }
  })
  track({ name: 'access_revoked', grantId })
}

export function extendAccess(
  grantId: ID,
  newExpiresAt: string,
  opts: { source?: 'patient' | 'admin' } = {},
): void {
  const source = opts.source ?? 'patient'
  const ts = nowIso()
  setState((s) => {
    const grant = s.accessGrants.find((g) => g.id === grantId)
    if (!grant) return {}
    return {
      accessGrants: s.accessGrants.map((g) =>
        g.id === grantId ? { ...g, expiresAt: newExpiresAt } : g,
      ),
      auditEvents: [
        {
          id: nextId('ae'),
          type: 'access_extended' as const,
          target: grant.department ?? 'ЛПУ',
          timestamp: ts,
          source,
          note:
            source === 'admin'
              ? 'администратор Эндокор продлил доступ'
              : 'пациент продлил доступ',
        },
        ...s.auditEvents,
      ],
    }
  })
  track({ name: 'access_extended', grantId, newExpiresAt })
}

/**
 * Admin-initiated revoke from the A02 audit. Thin wrapper over `revokeAccess`
 * so the partner cockpit shares one source of truth with the patient surface —
 * a revoke here propagates to the patient app and doctor queue instantly.
 */
export function adminRevokeAccess(grantId: ID): void {
  revokeAccess(grantId, { source: 'admin' })
}

/** Admin-initiated extend from the A02 audit (quick-pick +N days). */
export function adminExtendAccess(grantId: ID, newExpiresAt: string): void {
  extendAccess(grantId, newExpiresAt, { source: 'admin' })
}

/**
 * Patient re-grants access after a revoke. Admin revoke is terminal on the
 * admin side — only the patient can restore it (CLAUDE.md transparency). Clears
 * the revoked marks and writes a fresh grant event to the shared journal.
 */
export function regrantAccess(grantId: ID): void {
  const ts = nowIso()
  setState((s) => {
    const grant = s.accessGrants.find((g) => g.id === grantId)
    if (!grant) return {}
    return {
      accessGrants: s.accessGrants.map((g) =>
        g.id === grantId
          ? { ...g, revokedAt: undefined, revokedBy: undefined }
          : g,
      ),
      auditEvents: [
        {
          id: nextId('ae'),
          type: 'access_granted' as const,
          target: grant.department ?? 'ЛПУ',
          timestamp: ts,
          source: 'patient' as const,
          note: 'пациент выдал доступ снова',
        },
        ...s.auditEvents,
      ],
    }
  })
  track({ name: 'access_granted', grantId, esignId: `regrant-${grantId}` })
}

/**
 * Demo-only: enter the patient app as the seeded persona (p1, Мария) without
 * replaying onboarding, so the cross-surface revocation ripple is reachable
 * from the role switcher. No-op if a patient session already exists.
 */
export function enterPatientDemo(): void {
  const s = getState()
  if (!s.currentPatientId) {
    setState({ currentPatientId: 'p1', hasCompletedOnboarding: true })
  }
}

// ─── Admin no-op-ish actions (aggregate only — never expose PII) ────────────
export function logAdminEvent(
  type: AuditEventType,
  target: string,
  note?: string,
): AuditEvent {
  const event: AuditEvent = {
    id: nextId('ae'),
    type,
    target,
    timestamp: nowIso(),
    source: 'admin',
    note,
  }
  setState((s) => ({ auditEvents: [event, ...s.auditEvents] }))
  return event
}

export function markIncidentSeen(type: 'revoked' | 'expired'): void {
  // The pilot prototype does not persist a seen-flag; the action is kept as a
  // hook for the admin surface to record that the row was acknowledged.
  track({ name: 'admin_incident_seen', type })
}

// ─── Web auth ───────────────────────────────────────────────────────────────
// Mock mode: accepts any credentials (webAuth is set locally). BACKEND_MODE:
// also mints a REAL web JWT with the seeded clinic creds (sokolov / admin) so
// the live doctor/admin endpoints authenticate. webAuth is set synchronously so
// the route gate passes instantly; the token resolves on the login promise,
// which the doctor data loaders await via ensureWebSession.
export function signInWeb(role: WebRole, username: string): void {
  setState({
    webAuth: {
      role,
      username: username.trim() || 'demo',
      signedInAt: nowIso(),
    },
  })
  if (BACKEND_MODE && (role === 'doctor' || role === 'admin')) {
    void ensureWebSession(role, { force: true }).catch((e) =>
      console.error('[backend] web login failed', e),
    )
  }
  track({ name: 'web_login', role })
}

/**
 * Patient confirms «Подготовка завершена» — the headline write of the doctor
 * live surface. Stamps the local patient's prepCompletedAt and, in BACKEND_MODE,
 * POSTs /me/prep/complete so the patient's label moves in the doctor queue.
 * Idempotent: safe to call again (the backend only audits the first completion).
 */
export function markPrepComplete(timeSpentMin?: number): void {
  const now = nowIso()
  const { currentPatientId } = getState()
  setState((s) => ({
    patients: s.patients.map((p) =>
      p.id === currentPatientId
        ? {
            ...p,
            prepCompletedAt: p.prepCompletedAt ?? now,
            prepTimeSpentMin: timeSpentMin ?? p.prepTimeSpentMin,
          }
        : p,
    ),
  }))
  if (BACKEND_MODE) {
    void apiMe.completePrep(timeSpentMin).catch((e) =>
      console.error('[backend] completePrep failed', e),
    )
  }
}

/**
 * Hydrate the doctor record (D02) for one patient from the live summary in
 * BACKEND_MODE: reconstructs the patient + analyses + complaints + plan +
 * appointment into the store so the existing PatientRecord selectors render
 * live data unchanged, and sets doctorActivePatientId to the backend public_id
 * so the write verbs (verdict / acknowledge / dispatch) resolve real ids.
 * No-op outside BACKEND_MODE (the seeded mock record renders as before).
 */
export async function hydrateDoctorRecord(patientPublicId: ID): Promise<void> {
  if (!BACKEND_MODE) return
  try {
    const { currentDoctorId } = getState()
    const ent = await hydrateDoctorRecordBackend(patientPublicId, currentDoctorId)
    setState((s) => ({
      patients: [...s.patients.filter((p) => p.id !== patientPublicId), ent.patient],
      analyses: [...s.analyses.filter((a) => a.patientId !== patientPublicId), ...ent.analyses],
      complaints: [
        ...s.complaints.filter((c) => c.patientId !== patientPublicId),
        ...ent.complaints,
      ],
      planItems: [...s.planItems.filter((p) => p.patientId !== patientPublicId), ...ent.planItems],
      doctorRequests: [
        ...s.doctorRequests.filter((r) => r.patientId !== patientPublicId),
        ...ent.doctorRequests,
      ],
      appointments: [
        ...s.appointments.filter((a) => a.patientId !== patientPublicId),
        ...ent.appointments,
      ],
      doctorActivePatientId: patientPublicId,
    }))
  } catch (e) {
    console.error('[backend] hydrateDoctorRecord failed', e)
  }
}

let adminHydrated = false

/**
 * Hydrate the admin cockpit (A01 overview + A02 access audit) from the live
 * PII-blind reads in BACKEND_MODE: maps /admin/overview + /admin/access into the
 * store admin slices so the Dashboard + AccessAudit selectors render live data
 * unchanged. Guarded once per session so an in-session admin revoke/extend isn't
 * reset by re-entering the surface (mirrors ensureWebSession's dedup). No-op
 * outside BACKEND_MODE (the seeded admin mock renders as before).
 */
export async function hydrateAdmin(): Promise<void> {
  if (!BACKEND_MODE) return
  if (adminHydrated) return
  try {
    await ensureWebSession('admin', { force: true })
    const slices = await loadAdminBackend()
    setState((st) => ({
      pilotKpis: slices.pilotKpis,
      pilotGoal: slices.pilotGoal,
      funnel: slices.funnel,
      adoptionByDepartment: slices.adoptionByDepartment,
      adoptionByDoctor: slices.adoptionByDoctor,
      kpiTrend: slices.kpiTrend,
      accessByDepartment: slices.accessByDepartment,
      accessIncidents: slices.accessIncidents,
      complianceChecks: slices.complianceChecks,
      complianceState: slices.complianceState,
      // Replace the seeded .admin grants with the backend curated set; keep
      // patient/doctor (non-admin) grants intact so those surfaces are untouched.
      accessGrants: [...st.accessGrants.filter((g) => !g.admin), ...slices.adminGrants],
    }))
    adminHydrated = true
  } catch (e) {
    console.error('[backend] hydrateAdmin failed', e)
  }
}

export function signOutWeb(): void {
  const role = getState().webAuth?.role
  setState({ webAuth: null })
  if (role) track({ name: 'web_logout', role })
}

// ─── Consents (Profile · «Согласия и документы») ────────────────────────────
//
// The pilot bundle is single-versioned per user; these actions mutate the
// matching `ConsentRecord` inside that bundle. Withdrawing a required consent
// flips it `accepted: false` and timestamps `withdrawnAt`. Re-signing clears
// `withdrawnAt`, sets `reSignedAt`, and pins the record to a new version.

function patchConsent(
  consentId: ConsentId,
  patch: Partial<ConsentRecord>,
): void {
  const { currentPatientId } = getState()
  if (!currentPatientId) throw new Error('no active patient')
  setState((s) => ({
    consentBundles: s.consentBundles.map((b) =>
      b.userId === currentPatientId
        ? {
            ...b,
            consents: b.consents.map((c) =>
              c.id === consentId ? { ...c, ...patch } : c,
            ),
          }
        : b,
    ),
  }))
}

export function withdrawConsent(consentId: ConsentId): void {
  patchConsent(consentId, {
    accepted: false,
    withdrawnAt: nowIso(),
  })
  track({ name: 'consent_withdrawn', consentId })
}

export function reSignConsent(
  consentId: ConsentId,
  newVersion: string,
): void {
  patchConsent(consentId, {
    accepted: true,
    version: newVersion,
    withdrawnAt: undefined,
    reSignedAt: nowIso(),
  })
  track({ name: 'consent_resigned', consentId, versionId: newVersion })
}

// Per-channel edit for the marketing consent. Mirrors the onboarding sheet:
// flipping the last channel off also flips `accepted` off; flipping the first
// channel back on flips `accepted` on with `direct_tick`.
export function setMarketingChannel(
  channel: 'email' | 'sms' | 'push',
  on: boolean,
): void {
  const { currentPatientId, consentBundles } = getState()
  if (!currentPatientId) throw new Error('no active patient')
  const bundle = consentBundles.find((b) => b.userId === currentPatientId)
  const current = bundle?.consents.find((c) => c.id === 'marketing')
  const prev = current?.channels ?? []
  const next = on
    ? Array.from(new Set([...prev, channel]))
    : prev.filter((c) => c !== channel)
  const accepted = next.length > 0
  patchConsent('marketing', {
    accepted,
    channels: next,
    ackMechanism: accepted
      ? current?.ackMechanism ?? 'direct_tick'
      : 'not_applicable',
    withdrawnAt: accepted ? undefined : current?.withdrawnAt,
  })
  track({
    name: 'consent_opt_in_toggled',
    consentId: 'marketing',
    channels: next,
  })
}

// ─── Account deletion (Profile · «Удалить аккаунт») ─────────────────────────
//
// «Право на забвение» (152-ФЗ ст. 14). In the prototype we wipe the local
// store back to seed; the data that lives in the partner clinic's own EHR is
// out of scope and remains there (explained in the confirmation sheet).
export function deleteAccount(): void {
  track({ name: 'account_deleted' })
  useInteldoc.persist.clearStorage()
  // Drop the BACKEND_MODE JWT too — persist.clearStorage only wipes the store
  // key, so a stale token would otherwise survive and let the next reload
  // hydrate the just-deleted patient's data. No-op in mock mode (keys absent).
  setTokens(null, null)
  setState({ ...SEED })
}

// ─── Demo helpers ───────────────────────────────────────────────────────────
export function resetToSeed(): void {
  useInteldoc.persist.clearStorage()
  setTokens(null, null) // clear the JWT alongside the store (see deleteAccount)
  setState({ ...SEED })
}
