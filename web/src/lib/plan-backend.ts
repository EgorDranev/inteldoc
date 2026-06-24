// Live-backend plan loader (Slice 2: patient live loop). Used ONLY in
// BACKEND_MODE; the demo's default path stays entirely on the mock store + seed.
//
// hydratePatientFromBackend() (store/actions.ts) calls loadPlanBackend() on app
// load to re-derive the live patient's plan from the API:
//   GET /plan → { doctor_requests, plan_items }   (app/api/v1/plan.py, PlanOut)
//
// The generated OpenAPI types.ts is stale (no /plan path yet), so the backend
// contract is hand-typed here — mirroring BackendAnalysis in uploads-backend.ts.
// All conversion between the backend plan view and the store's PlanItem /
// DoctorRequest models lives in this file, keeping the cutover in one place.

import { plan } from '../api/client'
import type {
  AnalysisType,
  DoctorRequest,
  ID,
  OrderIntent,
  OrderKind,
  PlanItem,
  PlanItemStatus,
} from '../store/types'

// Backend plan view (app/api/v1/schemas/plan.py: PlanItemOut / DoctorRequestOut).
// Typed here because the client returns it loosely as Record<string, unknown>.
interface BackendPlanItem {
  public_id: string
  request_public_id: string
  analysis_type: string | null
  label: string
  reason: string | null
  status: string // assigned | uploaded | acknowledged
  linked_analysis_public_id: string | null
  due_date: string | null
  last_requested_at: string | null
  kind: string | null // lab | instrumental | referral | self-monitor
  prep: string | null
  created_at: string
}
interface BackendDoctorRequest {
  public_id: string
  from_doctor_public_id: string
  title: string
  body: string
  intent: string | null // before-visit | dynamics-control | additional-check | ocr-clarification
  plan_item_public_ids: string[]
  seen_by_patient: boolean
  // Derived (open | in_progress | completed) — the store recomputes progress
  // from plan-item statuses via selectors, so this is intentionally dropped.
  progress: string
  created_at: string
}
interface BackendPlan {
  doctor_requests: BackendDoctorRequest[]
  plan_items: BackendPlanItem[]
}

const ANALYSIS_TYPES: AnalysisType[] = ['HbA1c', 'glucose', 'creatinine', 'cholesterol', 'other']
const PLAN_ITEM_STATUSES: PlanItemStatus[] = ['assigned', 'uploaded', 'acknowledged']
const ORDER_KINDS: OrderKind[] = ['lab', 'instrumental', 'referral', 'self-monitor']
const ORDER_INTENTS: OrderIntent[] = [
  'before-visit',
  'dynamics-control',
  'additional-check',
  'ocr-clarification',
]

/** Local id derived from a backend public_id — shared by analyses and plan rows
 *  so cross-links (PlanItem.linkedAnalysisId ↔ Analysis.id) resolve after map. */
const localId = (publicId: string): ID => `be-${publicId}`

/** Backend analysis_type (nullable for e.g. referrals) → store AnalysisType. */
function toAnalysisType(raw: string | null): AnalysisType {
  return raw && (ANALYSIS_TYPES as string[]).includes(raw) ? (raw as AnalysisType) : 'other'
}
function toPlanItemStatus(raw: string): PlanItemStatus {
  return (PLAN_ITEM_STATUSES as string[]).includes(raw) ? (raw as PlanItemStatus) : 'assigned'
}
function toOrderKind(raw: string | null): OrderKind | undefined {
  return raw && (ORDER_KINDS as string[]).includes(raw) ? (raw as OrderKind) : undefined
}
function toOrderIntent(raw: string | null): OrderIntent | undefined {
  return raw && (ORDER_INTENTS as string[]).includes(raw) ? (raw as OrderIntent) : undefined
}

function mapPlanItem(raw: BackendPlanItem, patientId: ID): PlanItem {
  return {
    id: localId(raw.public_id),
    patientId,
    requestId: localId(raw.request_public_id),
    analysisType: toAnalysisType(raw.analysis_type),
    label: raw.label,
    reason: raw.reason ?? undefined,
    status: toPlanItemStatus(raw.status),
    linkedAnalysisId: raw.linked_analysis_public_id
      ? localId(raw.linked_analysis_public_id)
      : undefined,
    createdAt: raw.created_at,
    dueDate: raw.due_date ?? undefined,
    lastRequestedAt: raw.last_requested_at ?? undefined,
    kind: toOrderKind(raw.kind),
    prep: raw.prep ?? undefined,
  }
}

function mapDoctorRequest(raw: BackendDoctorRequest, patientId: ID): DoctorRequest {
  return {
    id: localId(raw.public_id),
    patientId,
    // The pilot is single-doctor; the backend from_doctor_public_id is a UUID
    // with no matching seed Doctor, so we anchor to the demo endocrinologist
    // 'd1' (= patient.attendingDoctorId / store.currentDoctorId) to keep the
    // «получен … · <врач>» line and doctor-name lookups coherent on the patient UI.
    fromDoctorId: 'd1',
    title: raw.title,
    body: raw.body,
    planItemIds: raw.plan_item_public_ids.map(localId),
    createdAt: raw.created_at,
    seenByPatient: raw.seen_by_patient,
    intent: toOrderIntent(raw.intent),
  }
}

export interface LoadedPlan {
  planItems: PlanItem[]
  doctorRequests: DoctorRequest[]
}

/** Fetch + map the patient's plan (GET /plan → { doctor_requests, plan_items }). */
export async function loadPlanBackend(patientId: ID): Promise<LoadedPlan> {
  const raw = (await plan.get()) as unknown as BackendPlan
  return {
    planItems: (raw.plan_items ?? []).map((p) => mapPlanItem(p, patientId)),
    doctorRequests: (raw.doctor_requests ?? []).map((r) => mapDoctorRequest(r, patientId)),
  }
}
