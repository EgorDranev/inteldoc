// Live-backend counterpart for the ADMIN surface (Slice D). Used ONLY in
// BACKEND_MODE; the demo's default path stays on the seeded admin mock +
// admin selectors (adminMockData.ts).
//
// One job: fetch the two PII-blind admin reads (/admin/overview + /admin/access)
// and map them into the existing store admin slices so the A01 Dashboard + A02
// AccessAudit render live data through their UNCHANGED selectors. Mirrors the
// doctor-backend.ts cutover idiom — all shape-conversion lives here.
//
// The generated types.ts predates these paths, so the backend contracts are
// hand-written here (mirroring app/api/v1/schemas/admin.py).
//
// Status frame: the backend anchors grant windows to real-now, but the admin UI
// derives status against a FIXED demo clock (ADMIN_DEMO_NOW). So we DON'T carry
// backend dates; we synthesize grant dates relative to ADMIN_DEMO_NOW from the
// backend's already-derived status, so deriveAccessGrantStatus reproduces it
// exactly (same trick doctor-backend uses for appointment display time).

import { admin as adminApi } from '../api/client'
import { ADMIN_DEMO_NOW } from '../store/selectors'
import type {
  AccessGrant,
  AccessIncidentBucket,
  AdoptionBreakdownRow,
  ComplianceChecks,
  ComplianceState,
  DepartmentAccess,
  FunnelStage,
  FunnelStageId,
  KpiId,
  KpiTrendPoint,
  PilotGoal,
  PilotKpis,
} from '../store/types'

// ─── Backend contracts (mirror app/api/v1/schemas/admin.py) ──────────────────

interface KpisBackend {
  onboarded: number
  prep_rate: number // 0..1
  ocr_rate: number // 0..1
  request_response_rate: number // 0..1
  period_label: string
  as_of: string
}
interface GoalBackend {
  target_onboarded: number
  target_date: string
  target_label: string
}
interface FunnelStageBackend {
  stage: string // invited | installed | consented | granted | prepared
  label: string
  count: number
}
interface AdoptionRowBackend {
  item_key: string
  label: string
  sublabel: string | null
  invited: number
  installed: number
  consented: number
  granted: number
  prepared: number
}
interface KpiTrendPointBackend {
  kpi_id: string // prepRate | ocrRate | onboarded
  day: string
  value: number // 0..1 for rate KPIs
}
interface DepartmentRowBackend {
  department_label: string
  connected: number
  prep_rate: number // 0..1
  overdue: number
}
interface AccessPanelBackend {
  active_total: number
  expiring_soon: number
  revoked: number
  expired: number
}
interface AccessIncidentBackend {
  type: string // revoked | expired
  count: number
  last_event_at: string | null
}
interface ComplianceBackend {
  state: string // green | amber | red
  n3_consent_recorded: boolean
  n4_scope_defined: boolean
  n5_audit_log_enabled: boolean
  n7_expiry_healthy: boolean
}
interface OverviewBackend {
  kpis: KpisBackend
  goal: GoalBackend
  funnel: FunnelStageBackend[]
  adoption_by_department: AdoptionRowBackend[]
  adoption_by_doctor: AdoptionRowBackend[]
  kpi_trend: KpiTrendPointBackend[]
  departments: DepartmentRowBackend[]
  access_panel: AccessPanelBackend
  access_incidents: AccessIncidentBackend[]
  compliance: ComplianceBackend
}

interface AccessRowBackend {
  grant_public_id: string
  patient_mask: string
  department_label: string
  doctor_name: string
  scope_label: string
  valid_from: string
  expires_at: string | null
  revoked_at: string | null
  last_viewed_at: string | null
  status: string // active | expiring_soon | expired | revoked | suspended
}
interface AccessAuditBackend {
  as_of: string
  counts: Record<string, number>
  rows: AccessRowBackend[]
}

// ─── Mapped store-slice patch ────────────────────────────────────────────────

export interface AdminBackendSlices {
  pilotKpis: PilotKpis
  pilotGoal: PilotGoal
  funnel: FunnelStage[]
  adoptionByDepartment: AdoptionBreakdownRow[]
  adoptionByDoctor: AdoptionBreakdownRow[]
  kpiTrend: KpiTrendPoint[]
  accessByDepartment: DepartmentAccess[]
  accessIncidents: AccessIncidentBucket[]
  complianceChecks: ComplianceChecks
  complianceState: ComplianceState
  /** The 20 curated grants, mapped to AccessGrant rows with .admin display. */
  adminGrants: AccessGrant[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pct = (fraction: number): number => Math.round(fraction * 100)

const DAY = 86_400_000

function toAdoptionRow(a: AdoptionRowBackend): AdoptionBreakdownRow {
  return {
    id: a.item_key,
    label: a.label,
    sublabel: a.sublabel ?? undefined,
    invited: a.invited,
    installed: a.installed,
    consented: a.consented,
    granted: a.granted,
    prepared: a.prepared,
  }
}

/** Last `n` points of one KPI series, oldest-first (matches the «14 дней» label). */
function lastTrend(points: KpiTrendPointBackend[], kpi: string, n: number): KpiTrendPoint[] {
  return points
    .filter((p) => p.kpi_id === kpi)
    .slice()
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-n)
    .map((p) => ({ kpi: kpi as KpiId, date: p.day, value: pct(p.value) }))
}

/**
 * Synthesize (grantedAt, expiresAt, revokedAt, revokedBy) so that
 * deriveAccessGrantStatus(grant, ADMIN_DEMO_NOW) === the backend's derived
 * status. grantedAt is varied (within the 30-day window so the default period
 * filter shows the row) for an authentic «Выдан» column.
 */
function synthDates(
  status: string,
  index: number,
): Pick<AccessGrant, 'grantedAt' | 'expiresAt' | 'revokedAt' | 'revokedBy'> {
  const base = new Date(ADMIN_DEMO_NOW).getTime()
  const grantedAt = new Date(base - (10 + (index % 14)) * DAY).toISOString()
  const iso = (offsetDays: number) => new Date(base + offsetDays * DAY).toISOString()
  switch (status) {
    case 'expiring_soon':
      return { grantedAt, expiresAt: iso(2) }
    case 'expired':
      return { grantedAt, expiresAt: iso(-6) }
    case 'revoked':
      return { grantedAt, expiresAt: iso(30), revokedAt: iso(-4), revokedBy: 'patient' }
    default: // active (+ suspended folds to a far expiry → active)
      return { grantedAt, expiresAt: iso(32) }
  }
}

function toAccessGrant(row: AccessRowBackend, index: number): AccessGrant {
  const dates = synthDates(row.status, index)
  return {
    id: row.grant_public_id,
    // A non-matching patientId so these never surface on the patient/doctor sides
    // (those filter by the real currentPatientId / patient ids).
    patientId: `be-admin-${row.grant_public_id}`,
    clinicId: 'enc',
    scope: 'lifetime-clinic',
    grantedAt: dates.grantedAt,
    expiresAt: dates.expiresAt,
    revokedAt: dates.revokedAt,
    revokedBy: dates.revokedBy,
    department: row.department_label,
    lastViewedAt: row.last_viewed_at ?? undefined,
    admin: {
      mask: row.patient_mask,
      doctorName: row.doctor_name,
      scopeLabel: row.scope_label,
      departmentLabel: row.department_label,
    },
  }
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loadAdminBackend(): Promise<AdminBackendSlices> {
  const [overview, access] = (await Promise.all([adminApi.overview(), adminApi.access()])) as [
    unknown,
    unknown,
  ]
  const o = overview as OverviewBackend
  const a = access as AccessAuditBackend

  // A01 panel baseline: clinic-wide active = Σ department connected (coherent
  // with funnel granted), expiring-soon = the curated-set count. The panel
  // selector layers the live 20-grant delta on top, so a revoke ticks it.
  const clinicWideActive = o.departments.reduce((sum, d) => sum + d.connected, 0)
  const accessByDepartment: DepartmentAccess[] = [
    {
      department: 'Эндокор — все отделения',
      activeCount: clinicWideActive,
      expiringSoon: o.access_panel.expiring_soon,
    },
  ]

  const accessIncidents: AccessIncidentBucket[] = o.access_incidents.map((i) => ({
    type: i.type === 'revoked' ? 'revoked' : 'expired',
    count: i.count,
    lastEventAt: i.last_event_at ?? ADMIN_DEMO_NOW,
  }))

  const funnel: FunnelStage[] = o.funnel.map((f) => ({
    id: f.stage as FunnelStageId,
    label: f.label,
    count: f.count,
  }))

  const kpiTrend: KpiTrendPoint[] = [
    ...lastTrend(o.kpi_trend, 'prepRate', 14),
    ...lastTrend(o.kpi_trend, 'ocrRate', 14),
  ]

  return {
    pilotKpis: {
      onboarded: o.kpis.onboarded,
      prepRate: pct(o.kpis.prep_rate),
      ocrRate: pct(o.kpis.ocr_rate),
      periodLabel: `Пилот Эндокор · ${o.kpis.period_label}`,
      asOf: o.kpis.as_of,
    },
    pilotGoal: {
      targetOnboarded: o.goal.target_onboarded,
      targetDate: o.goal.target_date,
      targetLabel: o.goal.target_label,
    },
    funnel,
    adoptionByDepartment: o.adoption_by_department.map(toAdoptionRow),
    adoptionByDoctor: o.adoption_by_doctor.map(toAdoptionRow),
    kpiTrend,
    accessByDepartment,
    accessIncidents,
    complianceChecks: {
      n3ConsentRecorded: o.compliance.n3_consent_recorded,
      n4ScopeDefined: o.compliance.n4_scope_defined,
      n5AuditLogEnabled: o.compliance.n5_audit_log_enabled,
      n7ExpiryHealthy: o.compliance.n7_expiry_healthy,
    },
    complianceState: (o.compliance.state as ComplianceState) ?? 'green',
    adminGrants: a.rows.map(toAccessGrant),
  }
}
