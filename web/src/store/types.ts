// IntelDoc store — domain types
// Shared by patient and doctor surfaces. Keep additions backwards-compatible
// since persisted state lives in localStorage between sessions.

export type ID = string

export type Gender = 'female' | 'male'

export interface Patient {
  id: ID
  name: string
  dob: string // ISO yyyy-mm-dd
  gender: Gender
  phone: string // RU format, captured during onboarding
  email?: string // optional contact
  identifiers: { snils?: string; oms?: string }
  partnerClinic: string
  department: string
  attendingDoctorId: ID
  createdAt: string // ISO
  /** ISO timestamp at which the patient marked preparation complete. */
  prepCompletedAt?: string
  /** Approximate minutes the patient spent on preparation across sessions. */
  prepTimeSpentMin?: number
  /**
   * Working diagnosis carried into the visit. Surfaced on the doctor record
   * left-rail so the endocrinologist sees clinical context at a glance.
   * `confirmed` reflects whether a clinic-side specialist has signed off —
   * the prototype does not model the confirmation workflow further.
   */
  diagnosis?: {
    label: string
    confirmed: boolean
  }
  // ─── Medical baseline (Profile · «Базовые данные») ───────────────────────
  /** Self-reported height in cm. */
  heightCm?: number
  /** Self-reported weight in kg. */
  weightKg?: number
  /** Free-text chronic conditions, e.g. «Гипертония 2 ст.». Non-diagnostic. */
  chronicConditions?: string[]
  /** Free-text allergy labels, e.g. «Пенициллин». */
  allergies?: string[]
  /** ISO timestamp of the last patient-side baseline edit. */
  baselineUpdatedAt?: string
  /** ISO timestamp of the last patient-side identity edit (ФИО/ДР/пол/ОМС). */
  identityUpdatedAt?: string
  /** ISO timestamp at which the partner clinic last confirmed identity match. */
  identityVerifiedAt?: string
}

// ─── Onboarding draft (transient, before commit) ────────────────────────────

export interface AccountDraft {
  name: string
  dob: string
  gender: Gender | null
  phone: string
  email: string
}

// ─── E-signature for the access grant (clinic_access consent block) ────────

export interface ESignRecord {
  id: ID
  userId: ID
  documentHash: string // hash of the granted-document text + recipient
  signedAt: string // ISO
  signatureMethod: 'mock_no_otp' // OTP omitted per pilot decision
  recipientClinicId: ID
  partnerId: string
}

// ─── Consent bundle (Consents screen, Appendix A.5 schema) ──────────────────

export type ConsentId =
  | 'pdn_general'
  | 'pdn_special'
  | 'cross_border'
  | 'clinic_access'
  | 'tos'
  | 'marketing'
export type AckMechanism =
  | 'scroll_to_end'
  | 'a11y_checkbox'
  | 'direct_tick'
  | 'not_applicable'

export interface ConsentRecord {
  id: ConsentId
  version: string // semantic version of the legal text
  accepted: boolean
  ackMechanism: AckMechanism
  channels?: string[] // for marketing: ['email','sms','push']
  /** Set for pdn_special: the user confirmed via an SMS one-time code. */
  smsConfirmed?: boolean
  /** ISO timestamp of the SMS confirmation, if applicable. */
  smsConfirmedAt?: string
  /** ISO timestamp at which the patient withdrew this consent. */
  withdrawnAt?: string
  /** ISO timestamp at which the patient re-signed after a version bump. */
  reSignedAt?: string
}

export interface ConsentBundle {
  bundleId: ID
  userId: ID
  capturedAt: string // ISO UTC
  ipAddress: string // unknown in browser; recorded as 'browser-unknown'
  userAgent: string
  consents: ConsentRecord[]
  linkedEsignId: ID
  partnerId: string
}

export interface AccessGrant {
  id: ID
  patientId: ID
  clinicId: ID
  scope: 'lifetime-clinic'
  grantedAt: string
  /** Optional explicit expiry — undefined for lifetime grants. */
  expiresAt?: string
  /** Set when the grant was revoked (by patient or admin — see audit source). */
  revokedAt?: string
  /** Originating surface of the revocation, for honest cross-surface attribution. */
  revokedBy?: 'patient' | 'admin'
  /** Optional department label captured at grant time (for admin rollups). */
  department?: string
  /** ISO timestamp of the most recent clinic-side view, surfaced to the patient. */
  lastViewedAt?: string
  /**
   * Admin-cockpit display metadata. Present only on grants surfaced in the A02
   * access audit (the partner's masked, per-grant view). Grants without it are
   * patient/doctor-only and never appear on admin. Patient identifiers are
   * always masked here — admin never sees a full name (CLAUDE.md guardrail).
   */
  admin?: AccessGrantAdminMeta
}

/** Masked, per-grant display fields for the admin A02 audit table + drawer. */
export interface AccessGrantAdminMeta {
  /** Masked patient label, e.g. «М. Иванова». */
  mask: string
  /** Attending doctor display name, e.g. «Др. Соколов А.В.». */
  doctorName: string
  /** Human scope label, e.g. «Анализы и подготовка». */
  scopeLabel: string
  /** A02 department label (brief vocabulary), e.g. «Эндокринология взрослая». */
  departmentLabel: string
}

/** Derived lifecycle status of an access grant. */
export type AccessGrantStatus = 'active' | 'expiring' | 'expired' | 'revoked'

export type AnalysisType =
  | 'HbA1c'
  | 'glucose'
  | 'creatinine'
  | 'cholesterol'
  | 'other'

/**
 * Per-field metadata for OCR-extracted analyte values. Optional and
 * additive — when absent, rendering falls back to raw `ocrFields` strings
 * with no range / confidence indicators.
 */
export interface OcrFieldMeta {
  /** Display-form reference, e.g. "< 6.5 %". */
  ref?: string
  /** Numeric reference bounds, when comparable. */
  refMin?: number
  refMax?: number
  /** Numeric value parsed from `ocrFields[key]`. */
  numericValue?: number
  /** Unit string for compact rendering, e.g. "%", "ммоль/л". */
  unit?: string
  /** True when OCR confidence is below the demo threshold. */
  lowConfidence?: boolean
  /**
   * Doctor's verdict on a low-confidence reading. Absent ⇒ still pending.
   * Set by the OCR-verification flow in the doctor surface.
   */
  verification?: {
    decision: 'confirmed' | 'rejected'
    verifiedBy: string
    verifiedAt: string
  }
  /**
   * Patient flagged this recognised value as misrecognised. The patient never
   * edits clinical content (read-only review) — flagging routes a data-integrity
   * report to Эндокор (исправление записи) + IntelDoc (аудит). Records the report;
   * the correction is the clinician's, via the doctor verification flow.
   */
  patientReport?: { reportedAt: string }
}

/**
 * Reason the doctor flagged an upload as not belonging to this record. Drives
 * the wrong-upload chip on the analysis tile and the audit footnote. The
 * patient-facing copy resolves the reason in their own language; only the id
 * is persisted.
 */
export type AnalysisRejectionReason =
  | 'not_my_clinic'
  | 'wrong_patient'
  | 'wrong_panel'
  | 'duplicate'
  | 'other'

/**
 * Reason the doctor asked the patient to re-upload. Source-quality issues
 * only — clinical interpretation never lives here.
 */
export type AnalysisResendReason =
  | 'poor_quality'
  | 'missing_pages'
  | 'date_unreadable'
  | 'lab_stamp_missing'
  | 'other'

export interface Analysis {
  id: ID
  patientId: ID
  type: AnalysisType
  label: string
  date: string // ISO
  originalFileUrl: string
  qualityCheck: 'clear' | 'acceptable'
  ocrFields: Record<string, string>
  /** Sibling map keyed by the same field names as `ocrFields`. */
  ocrFieldMeta?: Record<string, OcrFieldMeta>
  linkedPlanItemId?: ID
  /**
   * Verification lifecycle:
   *  - `uploaded` — patient uploaded; not yet seen by doctor.
   *  - `acknowledged` — doctor verified (or auto-trusted) all readings.
   *  - `rejected` — doctor flagged the whole upload as not belonging to
   *    this record (wrong patient / wrong clinic / duplicate). Kept visible
   *    for audit, no longer surfaces as work to do.
   *  - `resend_requested` — doctor asked the patient to re-upload. Ball is
   *    in the patient's court; the original artefact stays in the audit
   *    trail but drops out of the verification queue.
   */
  status: 'uploaded' | 'acknowledged' | 'rejected' | 'resend_requested'
  uploadedAt: string
  /**
   * Backend `public_id` of this analysis. Set ONLY in BACKEND_MODE, when the
   * analysis was registered server-side; lets `editOcrField` round-trip
   * corrections to `PATCH /analyses/{id}/ocr-fields/{key}`. Absent for seed and
   * mock-mode analyses (their edits stay local).
   */
  backendId?: string
  /** Doctor's audit footprint when `status === 'rejected'`. */
  rejection?: {
    reason: AnalysisRejectionReason
    rejectedBy: string
    rejectedAt: string
  }
  /** Doctor's audit footprint when `status === 'resend_requested'`. */
  resendRequest?: {
    reason: AnalysisResendReason
    requestedBy: string
    requestedAt: string
  }
}

export type DocumentType =
  | 'passport'
  | 'snils'
  | 'oms'
  | 'referral'
  | 'other'

export interface Document {
  id: ID
  patientId: ID
  type: DocumentType
  label: string
  originalFileUrl: string
  qualityCheck: 'clear' | 'acceptable'
  status: 'uploaded'
  uploadedAt: string
  /** OCR/structuring outcome surfaced to the doctor («Структура» column). */
  structureStatus?: 'structured' | 'original-only'
  /** Doctor-side clinical context for type='referral': source clinic name. */
  sourceFacility?: string
  /** Doctor-side clinical context for type='referral': specialty / reason. */
  referralReason?: string
  /** Doctor-side clinical context for type='referral': ISO date of the referral itself (not the upload). */
  referralDate?: string
}

/** Non-clinical organizational tags chosen by the patient (per spec 017). */
export type ComplaintTag =
  | 'energy' // «Самочувствие и силы»
  | 'sleep' // «Сон»
  | 'weight' // «Вес и аппетит»
  | 'glucose' // «Сахар крови»
  | 'mood' // «Настроение»
  | 'other' // «Другое»

export interface Complaint {
  id: ID
  patientId: ID
  text: string
  createdAt: string
  /** Patient-assigned organizational tags (non-diagnostic). */
  tags?: ComplaintTag[]
  /**
   * Patient-set priority — 1 is highest. Drives the «Что важно пациенту»
   * ranking on the doctor Сводка. Absent ⇒ recency fallback.
   */
  priority?: number
}

export type PlanItemStatus = 'assigned' | 'uploaded' | 'acknowledged'

/**
 * Category of a doctor-issued order. Drives patient-side rendering (kind
 * tag, icon, action label) and doctor-side grouping inside «Назначения к
 * приёму». `undefined` is treated as legacy `'lab'`.
 *
 *   • lab           — лабораторный анализ (HbA1c, креатинин, …)
 *   • instrumental  — инструментальное исследование (УЗИ, ЭКГ, холтер)
 *   • referral      — направление к узкому специалисту
 *   • self-monitor  — домашний самоконтроль (дневник глюкозы, АД, вес)
 */
export type OrderKind = 'lab' | 'instrumental' | 'referral' | 'self-monitor'

/**
 * Patient-facing clinical intent of a request — closed list shown to the
 * patient over the request's items and to the doctor in the dispatched-orders
 * ledger. Distinct from `TestOrderIntent` (the doctor-internal reasoning chip
 * on a pending row in «Назначения к следующему приёму»).
 *
 *   • before-visit         — проверки перед визитом
 *   • dynamics-control     — контроль динамики
 *   • additional-check     — дополнительная проверка
 *   • ocr-clarification    — уточнить OCR
 */
export type OrderIntent =
  | 'before-visit'
  | 'dynamics-control'
  | 'additional-check'
  | 'ocr-clarification'

export interface PlanItem {
  id: ID
  patientId: ID
  requestId: ID
  analysisType: AnalysisType
  label: string
  reason?: string
  status: PlanItemStatus
  linkedAnalysisId?: ID
  createdAt: string
  /** Optional ISO timestamp by which the patient should upload the result. */
  dueDate?: string
  /**
   * ISO timestamp of the most recent explicit «Запросить анализ» nudge from
   * the doctor — drives the «✓ Запрошено» pill on the visit agenda.
   */
  lastRequestedAt?: string
  /**
   * Order category. Drives patient-side row rendering and doctor-side
   * grouping. Absent on legacy lab plan items; new code should set it.
   */
  kind?: OrderKind
  /**
   * Patient-facing preparation hint shown directly under the row label —
   * «натощак», «возьмите направление в регистратуре», «утром, до завтрака»,
   * etc. Optional: only set when prep matters.
   */
  prep?: string
}

export interface DoctorRequest {
  id: ID
  patientId: ID
  fromDoctorId: ID
  title: string
  body: string
  planItemIds: ID[]
  createdAt: string
  seenByPatient: boolean
  /**
   * Patient-facing clinical intent — drives the category header the patient
   * sees and the chip on the doctor-side dispatched-orders ledger. Optional
   * for legacy requests created before the field existed.
   */
  intent?: OrderIntent
}

export interface Appointment {
  id: ID
  patientId: ID
  doctorId: ID
  type: 'main' | 'preparatory'
  date: string
  status: 'scheduled' | 'completed'
  createdAt: string
}

export interface Doctor {
  id: ID
  name: string
  specialty: string
  clinicId: ID
}

export interface Clinic {
  id: ID
  name: string
  shortName: string
  department: string
}

// ─── Admin surface (aggregate-only, no PII) ─────────────────────────────────

/**
 * Pilot goal for the partner clinic — drives the «Прогресс к цели»
 * indicator in the admin overview header. Aggregate-only.
 */
export interface PilotGoal {
  /** Target number of patients with an active access grant by `targetDate`. */
  targetOnboarded: number
  /** ISO yyyy-mm-dd deadline. */
  targetDate: string
  /** Human label used as a fallback in the header, e.g. «к 15 мая». */
  targetLabel: string
}

/**
 * One stage of the adoption funnel surfaced as the hero block on the
 * admin overview. `count` is the cumulative number of pilot patients who
 * reached this stage. Stages are ordered narrowest-last by convention:
 * invited → installed → consented → granted → prepared.
 */
export type FunnelStageId =
  | 'invited'
  | 'installed'
  | 'consented'
  | 'granted'
  | 'prepared'

export interface FunnelStage {
  id: FunnelStageId
  label: string
  count: number
}

/**
 * Per-department or per-doctor adoption breakdown — same five funnel
 * stages, scoped to one slice. Used by the «Где теряем» block.
 */
export interface AdoptionBreakdownRow {
  /** Stable key for React lists. */
  id: string
  /** Display label — department name or doctor name. */
  label: string
  /** Optional secondary line, e.g. department for a doctor row. */
  sublabel?: string
  invited: number
  installed: number
  consented: number
  granted: number
  prepared: number
}

/** Top-three KPI tiles shown on the admin pilot overview. */
export interface PilotKpis {
  /** Number of patients onboarded during the pilot window. */
  onboarded: number
  /** % of visits where preparation was completed before the visit. */
  prepRate: number
  /** % of uploaded documents successfully recognized by OCR. */
  ocrRate: number
  /** Period label, e.g. «Пилот Эндокор, апрель 2026». */
  periodLabel: string
  /** Snapshot timestamp (ISO). */
  asOf: string
}

export type KpiId = 'onboarded' | 'prepRate' | 'ocrRate'

/** One sample on the KPI sparkline. */
export interface KpiTrendPoint {
  kpi: KpiId
  date: string // ISO yyyy-mm-dd
  value: number // 0..100
}

/** Aggregated rollout state for one department of the partner clinic. */
export interface DepartmentAccess {
  department: string
  activeCount: number
  /** Active grants whose expiry is within the next 7 days. */
  expiringSoon: number
}

export type AuditEventType =
  | 'access_granted'
  | 'access_revoked'
  | 'access_expired'
  | 'access_extended'
  | 'consent_recorded'
  | 'admin_kpi_viewed'

/** Aggregate journal entry — never carries PII. */
export interface AuditEvent {
  id: ID
  type: AuditEventType
  /** Department or clinic the event relates to (no patient ids). */
  target: string
  /** ISO timestamp. */
  timestamp: string
  /** Originating surface for traceability. */
  source: 'patient' | 'doctor' | 'admin' | 'system'
  /** Free-form aggregate label, e.g. «доступ для отделения эндокринологии». */
  note?: string
}

/** Recent revoke / expire incidents shown on admin rollout screen. */
export interface AccessIncidentBucket {
  type: 'revoked' | 'expired'
  count: number
  lastEventAt: string
}

/**
 * Live roll-up of the A02 grant set, derived from `accessGrants` so admin
 * counts move the moment a grant is revoked or extended in-session.
 */
export interface AdminAccessAggregate {
  /** Active + expiring-soon grants (i.e. not expired, not revoked). */
  activeTotal: number
  /** Active grants whose expiry is within the «Истекает скоро» threshold. */
  expiringSoon: number
  /** Grants revoked (this session or seeded). */
  revoked: number
  /** Grants whose expiry has lapsed. */
  expired: number
}

export type ComplianceState = 'green' | 'amber' | 'red'

export interface ComplianceChecks {
  /** N3: consent versioned + timestamped. */
  n3ConsentRecorded: boolean
  /** N4: access scope explicitly defined for the patient. */
  n4ScopeDefined: boolean
  /** N5: audit log enabled and writing events. */
  n5AuditLogEnabled: boolean
  /** N7: access expiry tracked and not massively overdue. */
  n7ExpiryHealthy: boolean
}

// ─── Web (doctor + admin) auth ──────────────────────────────────────────────

export type WebRole = 'doctor' | 'admin'

export interface WebAuthSession {
  role: WebRole
  username: string
  signedInAt: string // ISO
}

// ─── Store shape ─────────────────────────────────────────────────────────────

export interface InteldocState {
  // Surfaces
  currentPatientId: ID | null
  doctorActivePatientId: ID | null
  currentDoctorId: ID

  // Web (doctor + admin) auth — mocked, no real verification
  webAuth: WebAuthSession | null

  // Onboarding gate (per spec §Product guardrails: persist locally)
  hasCompletedOnboarding: boolean
  // Onboarding draft (transient form state, kept in store so back-nav doesn't lose it)
  accountDraft: AccountDraft | null
  // Consents are captured before the e-sign (legal foundation precedes clinic
  // binding). The bundle is held as a draft and committed when signAccessGrant
  // creates the e-sign it must link to.
  consentDraft: ConsentRecord[] | null
  accessSigned: boolean // whether the access grant has been e-signed in this session

  // Last user-driven save (any checklist-mutating action). Drives the
  // «Сохранено — …» reassurance line on the patient prep screen.
  lastSavedAt: string | null

  // Backend `patient.public_id` captured at the onboarding commit (BACKEND_MODE
  // only). The patient's clinical-record public alias — informational and a
  // cross-surface link to the doctor queue / admin audit. Authenticated reads
  // key off the JWT subject (user_account.public_id), NOT this id. Absent (null)
  // in mock mode and for patients onboarded before this field existed.
  backendPatientPublicId: string | null

  // Collections
  clinics: Clinic[]
  doctors: Doctor[]
  patients: Patient[]
  accessGrants: AccessGrant[]
  esignRecords: ESignRecord[]
  consentBundles: ConsentBundle[]
  analyses: Analysis[]
  documents: Document[]
  complaints: Complaint[]
  planItems: PlanItem[]
  doctorRequests: DoctorRequest[]
  appointments: Appointment[]

  // ─── Admin slices (aggregate-only) ─────────────────────────────────────────
  pilotKpis: PilotKpis
  pilotGoal: PilotGoal
  funnel: FunnelStage[]
  adoptionByDepartment: AdoptionBreakdownRow[]
  adoptionByDoctor: AdoptionBreakdownRow[]
  kpiTrend: KpiTrendPoint[]
  accessByDepartment: DepartmentAccess[]
  accessIncidents: AccessIncidentBucket[]
  auditEvents: AuditEvent[]
  complianceState: ComplianceState
  complianceChecks: ComplianceChecks
}

// ─── Patient prep section status (shared by Checklist sections and progress) ─
// `info` covers reference-only sections (history, recommendations) that are
// rendered but not counted toward «X из Y».
export type SectionStatus = 'not_started' | 'in_progress' | 'done' | 'info'

export interface PrepSectionStatuses {
  newAnalyses: SectionStatus | null // null when no plan exists → section hidden
  documents: SectionStatus
  complaints: SectionStatus
  additionalDoctors: SectionStatus // always 'info'
  oldAnalyses: SectionStatus // always 'info'
  appointment: SectionStatus
}
