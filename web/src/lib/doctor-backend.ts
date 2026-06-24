// Live-backend counterpart for the DOCTOR surface (Slice C). Used ONLY in
// BACKEND_MODE; the demo's default path stays entirely on the mock store +
// doctorSelectors.
//
// Three jobs, all shape-conversion kept here so the cutover lives in one file
// (mirrors uploads-backend.ts / plan-backend.ts):
//   1. D01 queue  — GET /doctor/queue → row inputs the queue table renders.
//   2. D02 record — GET /doctor/patients/{id}/summary → reconstruct the store
//      entities (patient + analyses + complaints + plan + appointment) so the
//      existing PatientRecord selectors render live data unchanged. Demographic
//      chrome (dob / gender / diagnosis) is borrowed from the seed by name when
//      available; clinical content always comes from the backend.
//   3. Write verbs — verdict / acknowledge / dispatch hit the API.
//
// The generated types.ts predates these paths, so the backend contracts are
// hand-written here and the client returns them loosely (same idiom as
// BackendAnalysis in uploads-backend.ts).

import { auth as apiAuth, doctor as doctorApi, getAccessToken } from '../api/client'
import type {
  Analysis,
  Appointment,
  Complaint,
  DoctorRequest,
  ID,
  OcrFieldMeta,
  Patient,
  PlanItem,
} from '../store/types'

// ─── Web session (real JWT for the doctor/admin surface) ─────────────────────

const SEED_WEB_CREDS: Record<'doctor' | 'admin', { username: string; password: string }> = {
  doctor: { username: 'sokolov', password: 'demo1234' },
  admin: { username: 'admin', password: 'demo1234' },
}

let webSession: { role: 'doctor' | 'admin'; promise: Promise<void> } | null = null

/**
 * Ensure a web JWT for `role` is minted. Deduped per role within a session.
 * `force` re-mints (used on each doctor-surface entry so a web token always wins
 * over a stale patient token — the access token store is shared by both roles).
 */
export function ensureWebSession(
  role: 'doctor' | 'admin',
  opts: { force?: boolean } = {},
): Promise<void> {
  if (opts.force) webSession = null
  if (!webSession || webSession.role !== role) {
    const c = SEED_WEB_CREDS[role]
    webSession = {
      role,
      promise: apiAuth
        .webLogin(c.username, c.password)
        .then(() => undefined)
        .catch((e) => {
          webSession = null
          throw e
        }),
    }
  }
  return webSession.promise
}

// ─── Backend contracts (mirror app/api/v1/schemas/doctor.py) ─────────────────

export interface QueueIndicatorBackend {
  field: string
  display: string
  range: string // above | below
}
export interface QueueRowBackend {
  patient_public_id: string
  name: string
  scheduled_at: string
  appointment_type: string // main | preparatory
  prep_status: string // ready | in_progress | not_started
  plan_total: number
  plan_assigned: number
  plan_uploaded: number
  plan_acknowledged: number
  required_docs_present: number
  has_passport: boolean
  has_oms: boolean
  has_analyses: boolean
  has_complaints: boolean
  unseen_doctor_requests: boolean
  out_of_range_indicators: QueueIndicatorBackend[]
}
interface QueueBackend {
  as_of: string
  doctor_public_id: string
  rows: QueueRowBackend[]
}

interface AnalyteBackend {
  field: string
  display: string
  numeric_value: number | null
  unit: string | null
  ref: string | null
  ref_min: number | null
  ref_max: number | null
  range: string
  low_confidence: boolean
  verification: string | null // confirmed | rejected | null
  verified_by: string | null
  verified_at: string | null
  measured_at: string
  analysis_public_id: string
  analysis_label: string
  analysis_type: string
}
interface PrepUploadBackend {
  public_id: string
  analysis_type: string
  label: string
  status: string
  lab_date: string | null
  uploaded_at: string
  linked_plan_item: boolean
  analytes: AnalyteBackend[]
}
interface RankedQuestionBackend {
  public_id: string
  text: string
  kind: string
  tags: string[]
  priority: number | null
  created_at: string
}
interface AgendaRequestableBackend {
  plan_item_public_id: string | null
  analysis_type: string | null
  label: string | null
  reason: string | null
  last_requested_at: string | null
}
interface AgendaItemBackend {
  id: string
  label: string
  sources: string[]
  rationale: string | null
  requestable: AgendaRequestableBackend | null
}
interface SummaryBackend {
  patient_public_id: string
  display_name: string
  dob: string | null
  gender: string | null
  diagnosis: { label: string; confirmed: boolean } | null
  prep_meta: {
    prepared_at: string | null
    time_spent_min: number | null
    docs_count: number
    questions_count: number
  }
  analyses: { prep_uploads: PrepUploadBackend[] }
  gaps: { credit: string; agenda: AgendaItemBackend[] }
  questions: { ranked: RankedQuestionBackend[]; total: number }
  disclaimer_key: string
}

// Compact write-response (verdict / acknowledge), app/api/v1/schemas/doctor.py:DoctorAnalysisOut.
export interface DoctorAnalysisBackend {
  patient_public_id: string
  analysis_public_id: string
  status: string
  fields: Array<{
    field_key: string
    low_confidence: boolean
    verification: string | null
    verified_by: string | null
    verified_at: string | null
  }>
}

// ─── Shared mappers ──────────────────────────────────────────────────────────

const ANALYSIS_TYPES = ['HbA1c', 'glucose', 'creatinine', 'cholesterol', 'other'] as const
type AnalysisType = (typeof ANALYSIS_TYPES)[number]

function toAnalysisType(raw: string | null | undefined): AnalysisType {
  return raw && (ANALYSIS_TYPES as readonly string[]).includes(raw)
    ? (raw as AnalysisType)
    : 'other'
}

function toAnalysisStatus(raw: string): Analysis['status'] {
  switch (raw) {
    case 'acknowledged':
      return 'acknowledged'
    case 'rejected':
      return 'rejected'
    case 'resend_requested':
      return 'resend_requested'
    default:
      return 'uploaded' // 'uploaded' | 'structured' fold into 'uploaded'
  }
}

// Carries D01 scheduled_at / name into the D02 hydration (the summary payload
// has no appointment). Module-scoped, demo-session only (not persisted).
const queueMeta = new Map<string, { scheduledAt: string; name: string; appointmentType: string }>()

// Render the backend's UTC instant as a naive (timezone-free) ISO of its UTC wall
// clock, so D02's formatDateTime shows the appointment at the same hour the D01
// queue does (which reads getUTCHours). The seed authors appointments at a clinic
// hour tagged UTC, so the UTC wall clock IS the intended display time — without
// this, a UTC-aware ISO would shift e.g. 10:00 → 13:00 in a +03:00 browser.
function utcWallClockIso(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`
  )
}

// ─── 1. Queue (D01) ──────────────────────────────────────────────────────────

export async function loadDoctorQueueBackend(): Promise<QueueRowBackend[]> {
  const raw = (await doctorApi.queue()) as unknown as QueueBackend
  for (const r of raw.rows) {
    queueMeta.set(r.patient_public_id, {
      scheduledAt: r.scheduled_at,
      name: r.name,
      appointmentType: r.appointment_type,
    })
  }
  return raw.rows
}

// ─── 2. Record (D02) — reconstruct store entities from the summary ───────────

export interface DoctorRecordEntities {
  patient: Patient
  analyses: Analysis[]
  complaints: Complaint[]
  planItems: PlanItem[]
  doctorRequests: DoctorRequest[]
  appointments: Appointment[]
}

function mapAnalytes(analytes: AnalyteBackend[]): {
  ocrFields: Record<string, string>
  ocrFieldMeta: Record<string, OcrFieldMeta>
} {
  const ocrFields: Record<string, string> = {}
  const ocrFieldMeta: Record<string, OcrFieldMeta> = {}
  for (const a of analytes) {
    ocrFields[a.field] =
      a.display ||
      (a.numeric_value != null ? `${a.numeric_value}${a.unit ? ' ' + a.unit : ''}` : a.field)
    ocrFieldMeta[a.field] = {
      unit: a.unit ?? undefined,
      ref: a.ref ?? undefined,
      refMin: a.ref_min ?? undefined,
      refMax: a.ref_max ?? undefined,
      numericValue: a.numeric_value ?? undefined,
      lowConfidence: a.low_confidence,
      verification:
        a.verification === 'confirmed' || a.verification === 'rejected'
          ? {
              decision: a.verification,
              verifiedBy: a.verified_by ?? 'Врач',
              verifiedAt: a.verified_at ?? new Date(0).toISOString(),
            }
          : undefined,
    }
  }
  return { ocrFields, ocrFieldMeta }
}

export async function hydrateDoctorRecordBackend(
  patientPublicId: string,
  attendingDoctorId: ID,
): Promise<DoctorRecordEntities> {
  await ensureWebSession('doctor')
  const s = (await doctorApi.summary(patientPublicId)) as unknown as SummaryBackend
  const meta = queueMeta.get(patientPublicId)

  const patient: Patient = {
    id: patientPublicId,
    name: s.display_name,
    dob: s.dob ?? '1970-01-01',
    gender: s.gender === 'male' ? 'male' : 'female',
    phone: '', // not exposed on the doctor summary
    identifiers: {},
    partnerClinic: 'Эндокор',
    department: 'Отделение диабетологии',
    attendingDoctorId,
    createdAt: new Date().toISOString(),
    prepCompletedAt: s.prep_meta.prepared_at ?? undefined,
    prepTimeSpentMin: s.prep_meta.time_spent_min ?? undefined,
    diagnosis: s.diagnosis ?? undefined,
  }

  const analyses: Analysis[] = s.analyses.prep_uploads.map((pu) => {
    const { ocrFields, ocrFieldMeta } = mapAnalytes(pu.analytes)
    return {
      id: `be-${pu.public_id}`,
      patientId: patientPublicId,
      type: toAnalysisType(pu.analysis_type),
      label: pu.label,
      date: pu.lab_date ?? pu.uploaded_at.slice(0, 10),
      originalFileUrl: '',
      qualityCheck: 'clear',
      ocrFields,
      ocrFieldMeta,
      status: toAnalysisStatus(pu.status),
      uploadedAt: pu.uploaded_at,
      backendId: pu.public_id,
    }
  })

  // The summary returns only the top-ranked questions (capped) — enough for the
  // doctor's «Вопросы» section; the full count rides in questions.total.
  const complaints: Complaint[] = s.questions.ranked.map((q) => ({
    id: `be-${q.public_id}`,
    patientId: patientPublicId,
    text: q.text,
    createdAt: q.created_at,
    priority: q.priority ?? undefined,
  }))

  // Best-effort plan reconstruction from the agenda's requestable gaps (the
  // summary doesn't carry the full plan). Enough to render the «Назначения»
  // block + drive re-request. A single synthetic parent request groups them.
  const requestId = `be-req-${patientPublicId}`
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const planItems: PlanItem[] = s.gaps.agenda
    .filter((a) => a.requestable?.plan_item_public_id)
    .map((a) => {
      const r = a.requestable as AgendaRequestableBackend
      return {
        id: `be-${r.plan_item_public_id}`,
        patientId: patientPublicId,
        requestId,
        analysisType: toAnalysisType(r.analysis_type),
        label: r.label ?? a.label,
        reason: r.reason ?? undefined,
        status: 'assigned' as const,
        createdAt: new Date().toISOString(),
        dueDate: a.sources.includes('plan-overdue') ? yesterday : undefined,
        lastRequestedAt: r.last_requested_at ?? undefined,
        kind: 'lab' as const,
      }
    })
  const doctorRequests: DoctorRequest[] = planItems.length
    ? [
        {
          id: requestId,
          patientId: patientPublicId,
          fromDoctorId: attendingDoctorId,
          title: 'Перед приёмом',
          body: 'Назначения к визиту.',
          planItemIds: planItems.map((p) => p.id),
          createdAt: new Date().toISOString(),
          seenByPatient: true,
          intent: 'before-visit',
        },
      ]
    : []

  const appointments: Appointment[] = meta?.scheduledAt
    ? [
        {
          id: `be-appt-${patientPublicId}`,
          patientId: patientPublicId,
          doctorId: attendingDoctorId,
          type: meta.appointmentType === 'preparatory' ? 'preparatory' : 'main',
          date: utcWallClockIso(meta.scheduledAt),
          status: 'scheduled',
          createdAt: new Date().toISOString(),
        },
      ]
    : []

  return { patient, analyses, complaints, planItems, doctorRequests, appointments }
}

// ─── 3. Write verbs ──────────────────────────────────────────────────────────

export async function stampVerdictBackend(
  patientPublicId: string,
  analysisPublicId: string,
  fieldKey: string,
  decision: 'confirmed' | 'rejected',
): Promise<DoctorAnalysisBackend> {
  await ensureWebSession('doctor')
  return (await doctorApi.stampVerdict(
    patientPublicId,
    analysisPublicId,
    fieldKey,
    decision,
  )) as unknown as DoctorAnalysisBackend
}

export async function acknowledgeAnalysisBackend(
  patientPublicId: string,
  analysisPublicId: string,
): Promise<DoctorAnalysisBackend> {
  await ensureWebSession('doctor')
  return (await doctorApi.acknowledge(
    patientPublicId,
    analysisPublicId,
  )) as unknown as DoctorAnalysisBackend
}

export interface SendRequestBackendItem {
  analysis_type?: string | null
  label: string
  reason?: string | null
  kind?: string | null
  prep?: string | null
}
export async function sendRequestBackend(
  patientPublicId: string,
  body: { title: string; body: string; intent?: string | null; items: SendRequestBackendItem[] },
): Promise<void> {
  await ensureWebSession('doctor')
  await doctorApi.sendRequest(patientPublicId, body as unknown as Record<string, unknown>)
}

export { getAccessToken }
