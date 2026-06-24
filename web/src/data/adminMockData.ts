// Admin-surface mock data — aggregate only (no PII).
// Owned by the contract layer; coder agents may import freely.

import type {
  AccessGrant,
  AccessIncidentBucket,
  AdoptionBreakdownRow,
  AuditEvent,
  ComplianceChecks,
  ComplianceState,
  DepartmentAccess,
  FunnelStage,
  KpiTrendPoint,
  PilotGoal,
  PilotKpis,
} from '../store/types'

export const PILOT_KPIS_SEED: PilotKpis = {
  onboarded: 128,
  prepRate: 72,
  ocrRate: 89,
  periodLabel: 'Пилот Эндокор, апрель 2026',
  asOf: '2026-04-25T08:00:00+03:00',
}

/**
 * Pilot goal — 200 patients with active access by 15 May 2026.
 * Partner-set; surfaced as a progress strip in the overview header.
 */
export const PILOT_GOAL_SEED: PilotGoal = {
  targetOnboarded: 200,
  targetDate: '2026-05-15',
  targetLabel: 'к 15 мая',
}

/**
 * Adoption funnel — five stages, narrowest-last. Anchored on the existing
 * 128 active grants and 72% prep rate so the funnel reconciles with the
 * other KPIs on the page.
 */
export const FUNNEL_SEED: FunnelStage[] = [
  { id: 'invited', label: 'Приглашены', count: 312 },
  { id: 'installed', label: 'Установили', count: 196 },
  { id: 'consented', label: 'Подписали согласие', count: 156 },
  { id: 'granted', label: 'Выдали доступ', count: 128 },
  { id: 'prepared', label: 'Подготовились к визиту', count: 92 },
]

/**
 * Department-scoped funnel breakdown. Sums across rows reconcile with the
 * top-level FUNNEL_SEED totals.
 */
export const ADOPTION_BY_DEPARTMENT_SEED: AdoptionBreakdownRow[] = [
  {
    id: 'dept-endo',
    label: 'Эндокринология',
    invited: 180,
    installed: 124,
    consented: 102,
    granted: 84,
    prepared: 64,
  },
  {
    id: 'dept-ter',
    label: 'Терапия',
    invited: 96,
    installed: 52,
    consented: 40,
    granted: 32,
    prepared: 19,
  },
  {
    id: 'dept-lab',
    label: 'Лабдиагностика',
    invited: 36,
    installed: 20,
    consented: 14,
    granted: 12,
    prepared: 9,
  },
]

/**
 * Doctor-scoped funnel breakdown. Sums across rows reconcile with the
 * Эндокринология + Терапия totals (Лабдиагностика is department-only).
 */
export const ADOPTION_BY_DOCTOR_SEED: AdoptionBreakdownRow[] = [
  {
    id: 'doc-d1',
    label: 'Соколов А.В.',
    sublabel: 'Эндокринология',
    invited: 60,
    installed: 46,
    consented: 40,
    granted: 36,
    prepared: 30,
  },
  {
    id: 'doc-d2',
    label: 'Лебедева М.С.',
    sublabel: 'Эндокринология',
    invited: 56,
    installed: 40,
    consented: 34,
    granted: 28,
    prepared: 22,
  },
  {
    id: 'doc-d3',
    label: 'Гордеев П.Н.',
    sublabel: 'Эндокринология',
    invited: 64,
    installed: 38,
    consented: 28,
    granted: 20,
    prepared: 12,
  },
  {
    id: 'doc-d4',
    label: 'Никитин В.А.',
    sublabel: 'Терапия',
    invited: 60,
    installed: 36,
    consented: 28,
    granted: 22,
    prepared: 14,
  },
  {
    id: 'doc-d5',
    label: 'Орлова Е.Д.',
    sublabel: 'Терапия',
    invited: 36,
    installed: 16,
    consented: 12,
    granted: 10,
    prepared: 5,
  },
]

/** 14 daily samples per KPI (~last two weeks of pilot). */
export const KPI_TREND_SEED: KpiTrendPoint[] = [
  // prepRate
  { kpi: 'prepRate', date: '2026-04-12', value: 64 },
  { kpi: 'prepRate', date: '2026-04-13', value: 66 },
  { kpi: 'prepRate', date: '2026-04-14', value: 65 },
  { kpi: 'prepRate', date: '2026-04-15', value: 68 },
  { kpi: 'prepRate', date: '2026-04-16', value: 70 },
  { kpi: 'prepRate', date: '2026-04-17', value: 71 },
  { kpi: 'prepRate', date: '2026-04-18', value: 70 },
  { kpi: 'prepRate', date: '2026-04-19', value: 72 },
  { kpi: 'prepRate', date: '2026-04-20', value: 73 },
  { kpi: 'prepRate', date: '2026-04-21', value: 71 },
  { kpi: 'prepRate', date: '2026-04-22', value: 74 },
  { kpi: 'prepRate', date: '2026-04-23', value: 73 },
  { kpi: 'prepRate', date: '2026-04-24', value: 72 },
  { kpi: 'prepRate', date: '2026-04-25', value: 72 },
  // onboarded (cumulative-like values, 0..100 normalized share)
  { kpi: 'onboarded', date: '2026-04-12', value: 48 },
  { kpi: 'onboarded', date: '2026-04-15', value: 58 },
  { kpi: 'onboarded', date: '2026-04-18', value: 70 },
  { kpi: 'onboarded', date: '2026-04-21', value: 82 },
  { kpi: 'onboarded', date: '2026-04-24', value: 96 },
  { kpi: 'onboarded', date: '2026-04-25', value: 100 },
  // ocrRate
  { kpi: 'ocrRate', date: '2026-04-12', value: 84 },
  { kpi: 'ocrRate', date: '2026-04-15', value: 86 },
  { kpi: 'ocrRate', date: '2026-04-18', value: 88 },
  { kpi: 'ocrRate', date: '2026-04-21', value: 87 },
  { kpi: 'ocrRate', date: '2026-04-24', value: 89 },
  { kpi: 'ocrRate', date: '2026-04-25', value: 89 },
]

export const ACCESS_BY_DEPARTMENT_SEED: DepartmentAccess[] = [
  { department: 'Эндокринология', activeCount: 84, expiringSoon: 6 },
  { department: 'Терапия', activeCount: 32, expiringSoon: 2 },
  { department: 'Лабдиагностика', activeCount: 12, expiringSoon: 0 },
]

export const ACCESS_INCIDENTS_SEED: AccessIncidentBucket[] = [
  { type: 'revoked', count: 3, lastEventAt: '2026-04-25T14:32:00+03:00' },
  { type: 'expired', count: 7, lastEventAt: '2026-04-25T11:05:00+03:00' },
]

export const AUDIT_EVENTS_SEED: AuditEvent[] = [
  {
    id: 'ae-1',
    type: 'access_granted',
    target: 'Эндокринология',
    timestamp: '2026-04-25T09:14:00+03:00',
    source: 'patient',
    note: 'доступ выдан отделению эндокринологии',
  },
  {
    id: 'ae-2',
    type: 'access_expired',
    target: 'Терапия',
    timestamp: '2026-04-25T11:05:00+03:00',
    source: 'system',
    note: 'срок доступа истёк автоматически',
  },
  {
    id: 'ae-3',
    type: 'access_revoked',
    target: 'Эндокринология',
    timestamp: '2026-04-25T14:32:00+03:00',
    source: 'patient',
    note: 'пациент отозвал доступ',
  },
  {
    id: 'ae-4',
    type: 'consent_recorded',
    target: 'Эндокор',
    timestamp: '2026-04-24T10:00:00+03:00',
    source: 'patient',
    note: 'согласие зафиксировано (версия 1.0)',
  },
]

/**
 * A02 access-audit grant set (brief §5.4, 20 grants). These are real
 * `AccessGrant` rows in the shared store so the partner cockpit, the patient
 * app, and the doctor queue read one truth.
 *
 * - Row 1 (`ag-p1`) is the demo patient Мария Иванова — `patientId: 'p1'`, the
 *   patient-app session persona. Revoking it from A02 propagates to the patient
 *   app and the doctor queue (the cross-surface revocation hero). It is
 *   lifetime (no expiry): the real clock is months past the demo frame, so a
 *   fixed expiry would read as already expired on the real-clock patient view.
 * - Rows 2–20 reference patients with no record (`px*`) so they never surface
 *   on the patient/doctor sides; they exist to fill the audit, fire the
 *   incident banner, and populate the expired/revoked states. Their dates are
 *   anchored to a late-March-2026 demo frame (see `ADMIN_DEMO_NOW`) so statuses
 *   resolve exactly as the brief scripts them.
 */
interface AdminGrantSpec {
  id: string
  patientId: string
  mask: string
  dept: string
  doctor: string
  scope: string
  granted: string
  expires?: string
  viewed?: string
  revoked?: string
}

const SOKOLOV = 'Др. Соколов А.В.'
const ROMANOVA = 'Др. Романова Е.Н.'
const KLIMOVA = 'Др. Климова О.А.'
const GUSEVA = 'Др. Гусева И.М.'
const ENDO_ADULT = 'Эндокринология взрослая'
const ENDO_CHILD = 'Эндокринология детская'
const DIAB = 'Диабетология'
const THYRO = 'Тиреоидология'

const ADMIN_GRANT_SPECS: AdminGrantSpec[] = [
  { id: 'ag-p1', patientId: 'p1', mask: 'М. Иванова', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы и подготовка', granted: '2026-03-18T14:22:00+03:00', viewed: '2026-03-24T19:50:00+03:00' },
  { id: 'ag-x02', patientId: 'px02', mask: 'С. Петров', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы и подготовка', granted: '2026-03-20T10:05:00+03:00', expires: '2026-04-27', viewed: '2026-03-23T11:12:00+03:00' },
  { id: 'ag-x03', patientId: 'px03', mask: 'Е. Сидорова', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы', granted: '2026-03-22T11:30:00+03:00', expires: '2026-04-28' },
  { id: 'ag-x04', patientId: 'px04', mask: 'А. Волков', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы и подготовка', granted: '2026-03-21T09:15:00+03:00', expires: '2026-03-25', viewed: '2026-03-23T18:02:00+03:00' },
  { id: 'ag-x05', patientId: 'px05', mask: 'О. Нечаева', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы', granted: '2026-03-19T16:40:00+03:00', expires: '2026-03-26' },
  { id: 'ag-x06', patientId: 'px06', mask: 'И. Лебедев', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы и подготовка', granted: '2026-03-17T08:50:00+03:00', expires: '2026-03-26' },
  { id: 'ag-x07', patientId: 'px07', mask: 'Н. Морозова', dept: DIAB, doctor: ROMANOVA, scope: 'Анализы и план', granted: '2026-03-15T13:10:00+03:00', expires: '2026-04-22' },
  { id: 'ag-x08', patientId: 'px08', mask: 'Д. Тихонов', dept: DIAB, doctor: ROMANOVA, scope: 'Анализы и подготовка', granted: '2026-03-12T12:00:00+03:00', expires: '2026-04-18' },
  { id: 'ag-x09', patientId: 'px09', mask: 'В. Орлова', dept: DIAB, doctor: ROMANOVA, scope: 'Анализы', granted: '2026-03-10T15:25:00+03:00', expires: '2026-04-16' },
  { id: 'ag-x10', patientId: 'px10', mask: 'Г. Беляев', dept: THYRO, doctor: KLIMOVA, scope: 'Анализы и подготовка', granted: '2026-03-14T10:30:00+03:00', expires: '2026-04-20' },
  { id: 'ag-x11', patientId: 'px11', mask: 'Т. Зайцева', dept: THYRO, doctor: KLIMOVA, scope: 'Анализы', granted: '2026-03-11T09:45:00+03:00', expires: '2026-04-18' },
  { id: 'ag-x12', patientId: 'px12', mask: 'Р. Соловьёв', dept: ENDO_CHILD, doctor: GUSEVA, scope: 'Анализы и подготовка', granted: '2026-03-16T14:00:00+03:00', expires: '2026-04-22' },
  { id: 'ag-x13', patientId: 'px13', mask: 'К. Фомин', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы', granted: '2026-03-02T11:00:00+03:00', expires: '2026-03-16' },
  { id: 'ag-x14', patientId: 'px14', mask: 'Л. Яковлева', dept: DIAB, doctor: ROMANOVA, scope: 'Анализы и план', granted: '2026-02-28T10:20:00+03:00', expires: '2026-03-14' },
  { id: 'ag-x15', patientId: 'px15', mask: 'Б. Карпов', dept: THYRO, doctor: KLIMOVA, scope: 'Анализы', granted: '2026-02-25T13:30:00+03:00', expires: '2026-03-11' },
  { id: 'ag-x16', patientId: 'px16', mask: 'Ю. Ефимова', dept: ENDO_CHILD, doctor: GUSEVA, scope: 'Анализы', granted: '2026-03-01T09:00:00+03:00', expires: '2026-03-15' },
  { id: 'ag-x17', patientId: 'px17', mask: 'П. Громов', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы и подготовка', granted: '2026-03-09T12:15:00+03:00', revoked: '2026-03-19T10:00:00+03:00' },
  { id: 'ag-x18', patientId: 'px18', mask: 'З. Новикова', dept: DIAB, doctor: ROMANOVA, scope: 'Анализы', granted: '2026-03-06T11:40:00+03:00', revoked: '2026-03-17T14:30:00+03:00' },
  { id: 'ag-x19', patientId: 'px19', mask: 'Х. Мельникова', dept: ENDO_ADULT, doctor: SOKOLOV, scope: 'Анализы', granted: '2026-03-04T15:00:00+03:00', revoked: '2026-03-15T09:20:00+03:00' },
  { id: 'ag-x20', patientId: 'px20', mask: 'Ф. Тарасов', dept: THYRO, doctor: KLIMOVA, scope: 'Анализы и подготовка', granted: '2026-03-30T10:10:00+03:00', expires: '2026-05-06' },
]

export const ACCESS_AUDIT_SEED: AccessGrant[] = ADMIN_GRANT_SPECS.map((g) => ({
  id: g.id,
  patientId: g.patientId,
  clinicId: 'endokor',
  scope: 'lifetime-clinic',
  grantedAt: g.granted,
  expiresAt: g.expires,
  revokedAt: g.revoked,
  revokedBy: g.revoked ? ('patient' as const) : undefined,
  department: g.dept,
  lastViewedAt: g.viewed,
  admin: {
    mask: g.mask,
    doctorName: g.doctor,
    scopeLabel: g.scope,
    departmentLabel: g.dept,
  },
}))

export const COMPLIANCE_CHECKS_SEED: ComplianceChecks = {
  n3ConsentRecorded: true,
  n4ScopeDefined: true,
  n5AuditLogEnabled: true,
  // N7 «не просрочены массово» = no MATERIAL share expired/overdue. The 20-grant
  // set has 4 expired of 20 (20%) — healthy. Matches the backend /admin/overview
  // compliance derivation, so the pill stays green across mock + BACKEND_MODE.
  n7ExpiryHealthy: true,
}

export const COMPLIANCE_STATE_SEED: ComplianceState = 'green'

/** Department list used by onboarding/admin pickers. */
export const PARTNER_DEPARTMENTS: string[] = [
  'Эндокринология',
  'Терапия',
  'Лабдиагностика',
]
