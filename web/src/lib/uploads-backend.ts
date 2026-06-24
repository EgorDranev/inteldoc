// Live-backend counterpart to ocr-mock.ts. Used ONLY when BACKEND_MODE is on;
// the demo's default path stays entirely on the mock store + runOcr() stub.
//
// uploadAnalysis() (store/actions.ts) calls uploadAnalysisBackend() in
// BACKEND_MODE to run the real upload → OCR round-trip against the API,
// authenticated by the patient JWT minted during onboarding:
//   1a. POST /uploads/file (multipart)     → object_key, bytes stored  [real file]
//   1b. POST /uploads/sign                 → object_key, no bytes      [no file]
//   2.  POST /analyses                     → analysis + per-field OCR rows
// With a real file we PROXY it through the backend (1a) rather than the presigned
// PUT — a self-hosted object store isn't browser-reachable. The backend then OCRs
// the actual bytes (OCR_ENGINE=tesseract). Without a file (simulated camera path)
// we mint a key (1b); OCR finds nothing → the document degrades to original_only.
//
// editOcrField() calls editOcrFieldBackend() to PATCH a patient correction.
//
// All shape conversion between the backend analysis contract and the store's
// Analysis model lives here, keeping the cutover in one file.

import { uploads } from '../api/client'
import type { components } from '../api/types'
import type { Analysis, AnalysisType, ID, OcrFieldMeta } from '../store/types'

type Schemas = components['schemas']
type RegisterAnalysisIn = Schemas['RegisterAnalysisIn']

// Backend analysis view (app/services/upload_service.py:analysis_view). Typed
// here because the client returns it loosely as Record<string, unknown>.
interface BackendOcrField {
  field_key: string
  raw_value: string
  unit: string | null
  reference_text: string | null
  confidence: number | null
  low_confidence: boolean
  patient_transcription_state: string
  doctor_metadata_verdict: string
}
export interface BackendAnalysis {
  public_id: string
  analysis_type: string
  label: string
  status: string
  lab_date: string | null
  uploaded_at: string
  quality_check: string
  fields: BackendOcrField[]
}

// Patient-facing labels + believable lab dates per type. The OCR stub keys its
// fixtures off analysis_type and does not return a label/date of its own, so we
// supply both in the request. Strings mirror the mock fixtures (ocr-mock.ts) to
// keep backend mode visually consistent with the demo path.
const TYPE_LABEL: Record<AnalysisType, string> = {
  HbA1c: 'Гликированный гемоглобин (HbA1c)',
  glucose: 'Глюкоза крови натощак',
  creatinine: 'Креатинин',
  cholesterol: 'Холестерин общий + ЛПНП',
  other: 'Анализ',
}
const TYPE_LAB_DATE: Record<AnalysisType, string> = {
  HbA1c: '2026-02-12',
  glucose: '2026-02-14',
  creatinine: '2026-02-14',
  cholesterol: '2026-02-10',
  other: '2026-02-01',
}

/** First signed number in a string, comma- or dot-decimal. */
function parseNumeric(raw: string): number | undefined {
  const m = raw.match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return undefined
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/** Best-effort numeric bounds from a reference string («< 6.5», «3.9–5.6», «62–115»). */
function parseReference(text: string | null): { refMin?: number; refMax?: number } {
  if (!text) return {}
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')))
  if (text.includes('<') && nums.length >= 1) return { refMax: nums[0] }
  if (text.includes('>') && nums.length >= 1) return { refMin: nums[0] }
  if (nums.length >= 2) return { refMin: nums[0], refMax: nums[1] }
  return {}
}

export interface MappedAnalysisUpload {
  backendId: string
  label: string
  date: string // ISO; renders via formatDateShort
  qualityCheck: 'clear' | 'acceptable'
  ocrFields: Record<string, string>
  ocrFieldMeta: Record<string, OcrFieldMeta>
}

/** Convert a backend analysis view into the store's Analysis-shaped fragment. */
function mapAnalysis(raw: BackendAnalysis, type: AnalysisType): MappedAnalysisUpload {
  const ocrFields: Record<string, string> = {}
  const ocrFieldMeta: Record<string, OcrFieldMeta> = {}
  for (const f of raw.fields) {
    // Display form keeps the unit on the value (matches the mock «7.2 %»).
    // raw_value stays unit-free server-side; a future GET /analyses hydration
    // would need to re-split value/unit before re-rendering.
    ocrFields[f.field_key] = f.unit ? `${f.raw_value} ${f.unit}` : f.raw_value
    ocrFieldMeta[f.field_key] = {
      unit: f.unit ?? undefined,
      ref: f.reference_text ?? undefined,
      numericValue: parseNumeric(f.raw_value),
      lowConfidence: f.low_confidence,
      ...parseReference(f.reference_text),
    }
  }
  return {
    backendId: raw.public_id,
    label: raw.label || TYPE_LABEL[type],
    date: raw.lab_date ?? TYPE_LAB_DATE[type],
    qualityCheck: raw.quality_check === 'acceptable' ? 'acceptable' : 'clear',
    ocrFields,
    ocrFieldMeta,
  }
}

// ─── List hydration (Slice 2: patient live loop) ─────────────────────────────
// uploadAnalysisBackend (below) maps ONE freshly-registered analysis into the
// store fragment. On reload we instead hydrate the patient's whole history from
// GET /analyses, which needs a mapper that yields a COMPLETE store Analysis
// (id, patientId, status, …), not just the OCR fragment. The per-field
// conversion is shared with mapAnalysis; only the envelope differs.

const ANALYSIS_TYPES: AnalysisType[] = ['HbA1c', 'glucose', 'creatinine', 'cholesterol', 'other']

/** Backend analysis_type → store AnalysisType, defaulting unknown values to 'other'. */
function toAnalysisType(raw: string): AnalysisType {
  return (ANALYSIS_TYPES as string[]).includes(raw) ? (raw as AnalysisType) : 'other'
}

/**
 * Backend AnalysisStatus → store Analysis['status']. The backend has an extra
 * `structured` state (OCR emitted fields, still awaiting a doctor) that the
 * store folds into `uploaded`; the rest map 1:1. Low confidence is NOT a status
 * here — it rides on each field's `low_confidence` (handled in mapAnalysis).
 */
function toAnalysisStatus(raw: string): Analysis['status'] {
  switch (raw) {
    case 'acknowledged':
      return 'acknowledged'
    case 'rejected':
      return 'rejected'
    case 'resend_requested':
      return 'resend_requested'
    default:
      return 'uploaded' // 'uploaded' | 'structured' | anything unexpected
  }
}

/**
 * Convert a backend analysis view into a COMPLETE store Analysis. The local id is
 * derived deterministically from the backend public_id (`be-<public_id>`) so
 * re-hydration on each reload replaces rather than duplicates the same record,
 * and so plan-item cross-links resolve by id. `linkedPlanItemId` is filled in by
 * the caller once the plan is loaded (the link lives on the plan side
 * server-side).
 */
export function mapAnalysisFromBackend(raw: BackendAnalysis, patientId: ID): Analysis {
  const type = toAnalysisType(raw.analysis_type)
  const fragment = mapAnalysis(raw, type)
  return {
    id: `be-${raw.public_id}`,
    patientId,
    type,
    label: fragment.label,
    date: fragment.date,
    originalFileUrl: '', // backend object store isn't browser-reachable — no inline image
    qualityCheck: fragment.qualityCheck,
    ocrFields: fragment.ocrFields,
    ocrFieldMeta: fragment.ocrFieldMeta,
    status: toAnalysisStatus(raw.status),
    uploadedAt: raw.uploaded_at,
    backendId: raw.public_id,
  }
}

/** Fetch + map the patient's full analysis history (GET /analyses, bare array). */
export async function loadAnalysesBackend(patientId: ID): Promise<Analysis[]> {
  const rows = (await uploads.listAnalyses()) as unknown as BackendAnalysis[]
  return rows.map((r) => mapAnalysisFromBackend(r, patientId))
}

/**
 * Run the live upload → OCR round-trip and return the store-shaped fragment.
 * With a real `file` the bytes are proxied to storage and OCR'd; without one a
 * key is minted (original_only). Throws on any failed step; the caller
 * (uploadAnalysis) falls back to the mock OCR so the spinner never dead-ends.
 */
export async function uploadAnalysisBackend(args: {
  type: AnalysisType
  file?: Blob
}): Promise<MappedAnalysisUpload> {
  const { type, file } = args
  const object_key = file
    ? (await uploads.uploadFile(file)).object_key
    : (await uploads.sign('image/jpeg')).object_key
  const body: RegisterAnalysisIn = {
    object_key,
    analysis_type: type,
    label: TYPE_LABEL[type],
    lab_date: TYPE_LAB_DATE[type],
  }
  const raw = (await uploads.registerAnalysis(body)) as unknown as BackendAnalysis
  return mapAnalysis(raw, type)
}

/**
 * PATCH a patient OCR correction. Best-effort: the optimistic local store update
 * already happened in editOcrField; a backend hiccup must not block the UI.
 */
export async function editOcrFieldBackend(
  backendId: string,
  fieldKey: string,
  value: string,
): Promise<void> {
  await uploads.editOcrField(backendId, fieldKey, value)
}
