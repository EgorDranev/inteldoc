import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ShieldOff,
  X,
} from 'lucide-react'
import CockpitShell from '../../components/doctor/CockpitShell'
import StatusChip from '../../components/StatusChip'
import { useInteldoc } from '../../store/store'
import {
  ADMIN_DEMO_NOW,
  deriveAccessGrantStatus,
  selectAdminAccessAggregate,
  selectAdminAccessGrants,
} from '../../store/selectors'
import { adminExtendAccess, adminRevokeAccess, hydrateAdmin } from '../../store/actions'
import type { AccessGrant, AccessGrantStatus } from '../../store/types'
import type { ChipVariant } from '../../types'
import { formatDateDotted, pluralRu } from '../../lib/formatters'
import { toast } from '../../lib/toast'

// ─── Filter vocabulary ───────────────────────────────────────────────────────

type StatusFilter = 'all' | AccessGrantStatus
type PeriodFilter = '30' | '90' | 'all'

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'expiring', label: 'Истекают скоро' },
  { id: 'expired', label: 'Истёкшие' },
  { id: 'revoked', label: 'Отозванные' },
]

const DEPARTMENTS = [
  'Эндокринология взрослая',
  'Эндокринология детская',
  'Диабетология',
  'Тиреоидология',
]

const PERIODS: { id: PeriodFilter; label: string; days: number | null }[] = [
  { id: '30', label: 'За 30 дней', days: 30 },
  { id: '90', label: 'За 90 дней', days: 90 },
  { id: 'all', label: 'Всё время', days: null },
]

const STATUS_CHIP: Record<AccessGrantStatus, { label: string; variant: ChipVariant }> = {
  active: { label: 'Активен', variant: 'success' },
  expiring: { label: 'Истекает скоро', variant: 'warning' },
  expired: { label: 'Истёк', variant: 'neutral' },
  revoked: { label: 'Отозван', variant: 'error' },
}

const EXTEND_OPTIONS = [30, 60, 90]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** «18.03.2026 в 14:22» — date + authored time (reads the literal ISO, so the
 * displayed clock time is tz-stable and matches the seed exactly). */
function formatStamp(iso: string): string {
  const t = iso.match(/T(\d{2}):(\d{2})/)
  const time = t ? `${t[1]}:${t[2]}` : ''
  return time ? `${formatDateDotted(iso)} в ${time}` : formatDateDotted(iso)
}

/** Same, plus one minute (the clinic auto-confirms a beat after the grant). */
function formatStampPlusMinute(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (!m) return formatStamp(iso)
  let hh = Number(m[1])
  let mm = Number(m[2]) + 1
  if (mm >= 60) {
    mm = 0
    hh = (hh + 1) % 24
  }
  const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  return `${formatDateDotted(iso)} в ${time}`
}

/** New expiry = current expiry (or demo-now) + N days, as a yyyy-mm-dd string. */
function extendedExpiry(grant: AccessGrant, days: number): string {
  const base = grant.expiresAt ? new Date(grant.expiresAt) : new Date(ADMIN_DEMO_NOW)
  return new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

// ─── Screen ──────────────────────────────────────────────────────────────────

/**
 * ADM-E03 · A02 «Журнал доступов» — per-grant access audit for the partner
 * admin. Masked patient identifiers, derived status, real revoke / extend that
 * mutate the shared store (so a revoke propagates to the patient app + doctor
 * queue). See IntelDoc_Admin_Cockpit_Prototype_Brief.md §A02.
 */
export default function AdminAccessAudit() {
  const nav = useNavigate()
  const grants = useInteldoc(useShallow(selectAdminAccessGrants))
  const aggregate = useInteldoc(useShallow(selectAdminAccessAggregate))

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [extendId, setExtendId] = useState<string | null>(null)

  // BACKEND_MODE: hydrate the curated grant set from /admin/access once. No-op
  // on the mock path (the seeded ACCESS_AUDIT_SEED renders as before).
  useEffect(() => {
    void hydrateAdmin()
  }, [])

  const periodDays = PERIODS.find((p) => p.id === periodFilter)?.days ?? null

  const visible = useMemo(() => {
    const cutoff =
      periodDays != null
        ? new Date(ADMIN_DEMO_NOW).getTime() - periodDays * 86_400_000
        : null
    return grants.filter((g) => {
      const status = deriveAccessGrantStatus(g)
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (deptFilter !== 'all' && g.admin?.departmentLabel !== deptFilter)
        return false
      if (cutoff != null && new Date(g.grantedAt).getTime() < cutoff) return false
      return true
    })
  }, [grants, statusFilter, deptFilter, periodDays])

  const drawerGrant = grants.find((g) => g.id === drawerId) ?? null
  const revokeGrant = grants.find((g) => g.id === revokeId) ?? null
  const extendGrant = grants.find((g) => g.id === extendId) ?? null

  const showBanner = aggregate.expiringSoon > 0 && !bannerDismissed

  // Esc closes the top-most overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (revokeId) setRevokeId(null)
      else if (extendId) setExtendId(null)
      else if (drawerId) setDrawerId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revokeId, extendId, drawerId])

  function resetFilters() {
    setStatusFilter('all')
    setDeptFilter('all')
    setPeriodFilter('all')
  }

  function confirmRevoke() {
    if (!revokeGrant) return
    adminRevokeAccess(revokeGrant.id)
    toast('Доступ отозван')
    setRevokeId(null)
    setDrawerId(null)
  }

  function applyExtend(days: number) {
    if (!extendGrant) return
    adminExtendAccess(extendGrant.id, extendedExpiry(extendGrant, days))
    toast(`Доступ продлён на ${days} дней`, 'success')
    setExtendId(null)
  }

  return (
    <CockpitShell>
      {/* Header */}
      <header className="border-b border-slate-100 bg-white px-10 py-6">
        <button
          type="button"
          onClick={() => nav('/admin/dashboard')}
          className="inline-flex items-center gap-1 text-caption font-bold text-ink-muted hover:text-navy-900 transition-colors"
        >
          <ChevronLeft size={14} strokeWidth={2.5} />
          Внедрение
        </button>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <h1 className="text-h1-ui font-extrabold text-navy-900">
            Журнал доступов
          </h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-caption font-bold text-ink-muted">
            {grants.length}{' '}
            {pluralRu(grants.length, ['запись', 'записи', 'записей'])}
          </span>
        </div>
        <p className="mt-1 text-caption text-ink-muted">
          Эндокор · обновлено сегодня · идентификаторы пациентов маскированы
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-10 py-6">
        {/* Incident banner */}
        <AnimatePresence>
          {showBanner && (
            <motion.button
              type="button"
              onClick={() => setBannerDismissed(true)}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="mb-5 flex w-full items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-left ring-1 ring-amber-200"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Clock size={15} strokeWidth={2} />
              </span>
              <p className="flex-1 text-body font-bold text-amber-800">
                {aggregate.expiringSoon}{' '}
                {pluralRu(aggregate.expiringSoon, ['доступ', 'доступа', 'доступов'])}{' '}
                {pluralRu(aggregate.expiringSoon, ['истекает', 'истекают', 'истекают'])}{' '}
                в ближайшие 3 дня — проверьте журнал
              </p>
              <X size={16} strokeWidth={2} className="text-amber-700" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Filter bar */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-full px-3 py-1.5 text-caption font-bold transition-colors ${
                    active
                      ? 'bg-navy-900 text-white'
                      : 'bg-slate-100 text-ink-muted hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-caption font-bold text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">Все отделения</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-caption font-bold text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => toast('Отчёт сформирован', 'success')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-caption font-bold text-ink-muted hover:text-navy-900 hover:border-slate-300 transition-colors"
            >
              <Download size={14} strokeWidth={2} />
              .csv
            </button>
          </div>
        </div>

        {/* Table */}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <ShieldOff size={28} strokeWidth={1.5} className="text-slate-300" />
            <p className="text-body font-bold text-ink-muted">
              Нет записей по выбранным фильтрам
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg bg-slate-100 px-4 py-2 text-caption font-bold text-navy-900 hover:bg-slate-200 transition-colors"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-micro uppercase tracking-caps text-ink-subtle">
                  <th className="px-4 py-3 font-bold">Пациент</th>
                  <th className="px-4 py-3 font-bold">Отделение</th>
                  <th className="px-4 py-3 font-bold">Врач</th>
                  <th className="px-4 py-3 font-bold">Объём доступа</th>
                  <th className="px-4 py-3 font-bold">Выдан</th>
                  <th className="px-4 py-3 font-bold">Истекает</th>
                  <th className="px-4 py-3 font-bold">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => (
                  <AccessRow
                    key={g.id}
                    grant={g}
                    onOpen={() => setDrawerId(g.id)}
                    onRevoke={() => setRevokeId(g.id)}
                    onExtend={() => setExtendId(g.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drilldown drawer */}
      <AnimatePresence>
        {drawerGrant && (
          <AccessDrawer
            grant={drawerGrant}
            onClose={() => setDrawerId(null)}
            onRevoke={() => setRevokeId(drawerGrant.id)}
            onExtend={() => setExtendId(drawerGrant.id)}
          />
        )}
      </AnimatePresence>

      {/* Revoke confirmation */}
      <AnimatePresence>
        {revokeGrant && (
          <Overlay onClose={() => setRevokeId(null)}>
            <div className="w-[420px] max-w-[90vw] rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-h3-ui font-extrabold text-navy-900">
                Отозвать доступ для {revokeGrant.admin?.mask}?
              </h2>
              <p className="mt-2 text-body text-ink-muted">
                Доступ перестанет действовать сразу. Это останется в журнале.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRevokeId(null)}
                  className="rounded-lg px-4 py-2 text-body font-bold text-ink-muted hover:bg-slate-100 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={confirmRevoke}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-body font-bold text-white hover:bg-rose-700 transition-colors"
                >
                  Отозвать
                </button>
              </div>
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Extend popover (compact dialog) */}
      <AnimatePresence>
        {extendGrant && (
          <Overlay onClose={() => setExtendId(null)}>
            <div className="w-[320px] max-w-[90vw] rounded-2xl bg-white p-5 shadow-xl">
              <h2 className="text-body font-extrabold text-navy-900">
                Продлить доступ для {extendGrant.admin?.mask}
              </h2>
              <div className="mt-4 flex flex-col gap-2">
                {EXTEND_OPTIONS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    autoFocus={i === 0}
                    onClick={() => applyExtend(d)}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-body font-bold text-navy-900 hover:border-cyan-300 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
                  >
                    +{d} дней
                  </button>
                ))}
              </div>
            </div>
          </Overlay>
        )}
      </AnimatePresence>
    </CockpitShell>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AccessRow({
  grant,
  onOpen,
  onRevoke,
  onExtend,
}: {
  grant: AccessGrant
  onOpen: () => void
  onRevoke: () => void
  onExtend: () => void
}) {
  const status = deriveAccessGrantStatus(grant)
  const chip = STATUS_CHIP[status]
  const actionable = status === 'active' || status === 'expiring'
  const canExtend = actionable && !!grant.expiresAt

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-slate-50 text-body text-navy-900 last:border-0 hover:bg-slate-50/70"
    >
      <td className="px-4 py-3 font-bold">{grant.admin?.mask}</td>
      <td className="px-4 py-3 text-ink-muted">{grant.admin?.departmentLabel}</td>
      <td className="px-4 py-3 text-ink-muted">{grant.admin?.doctorName}</td>
      <td className="px-4 py-3 text-ink-muted">{grant.admin?.scopeLabel}</td>
      <td className="px-4 py-3 text-ink-muted">{formatDateDotted(grant.grantedAt)}</td>
      <td className="px-4 py-3 text-ink-muted">
        {grant.expiresAt ? (
          <span className={status === 'expired' ? 'line-through' : ''}>
            {formatDateDotted(grant.expiresAt)}
          </span>
        ) : (
          'бессрочно'
        )}
      </td>
      <td className="px-4 py-3">
        <StatusChip label={chip.label} variant={chip.variant} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {actionable ? (
            <>
              {canExtend && (
                <button
                  type="button"
                  title="Продлить"
                  onClick={(e) => {
                    e.stopPropagation()
                    onExtend()
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-navy-900 transition-colors"
                >
                  <Clock size={16} strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                title="Отозвать"
                onClick={(e) => {
                  e.stopPropagation()
                  onRevoke()
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <ShieldOff size={16} strokeWidth={2} />
              </button>
            </>
          ) : (
            <ChevronRight size={16} strokeWidth={2} className="text-slate-300" />
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Drawer ──────────────────────────────────────────────────────────────────

interface TimelineItem {
  label: string
  stamp: string
}

function buildTimeline(grant: AccessGrant): TimelineItem[] {
  const items: TimelineItem[] = [
    { label: 'Доступ выдан пациентом', stamp: formatStamp(grant.grantedAt) },
    { label: 'Подтверждён ЛПУ', stamp: formatStampPlusMinute(grant.grantedAt) },
  ]
  if (grant.lastViewedAt) {
    items.push({ label: 'Просмотрен врачом', stamp: formatStamp(grant.lastViewedAt) })
  }
  if (grant.revokedAt) {
    items.push({
      label:
        grant.revokedBy === 'admin'
          ? 'Отозван администратором Эндокор'
          : 'Отозван пациентом',
      stamp: formatStamp(grant.revokedAt),
    })
  } else if (grant.expiresAt) {
    items.push({ label: 'Истекает', stamp: formatDateDotted(grant.expiresAt) })
  }
  return items
}

function AccessDrawer({
  grant,
  onClose,
  onRevoke,
  onExtend,
}: {
  grant: AccessGrant
  onClose: () => void
  onRevoke: () => void
  onExtend: () => void
}) {
  const status = deriveAccessGrantStatus(grant)
  const chip = STATUS_CHIP[status]
  const actionable = status === 'active' || status === 'expiring'
  const canExtend = actionable && !!grant.expiresAt
  const timeline = buildTimeline(grant)

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-navy-900/30"
      />
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative flex h-full w-[420px] max-w-[90vw] flex-col bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-h3-ui font-extrabold text-navy-900">
                {grant.admin?.mask}
              </h2>
              <StatusChip label={chip.label} variant={chip.variant} />
            </div>
            <p className="mt-1 text-caption text-ink-muted">
              {grant.admin?.departmentLabel} · {grant.admin?.doctorName}
            </p>
            <p className="mt-0.5 text-caption text-ink-muted">
              {grant.admin?.scopeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 transition-colors"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-micro uppercase tracking-caps font-bold text-ink-subtle">
            История доступа
          </p>
          <ol className="mt-4 flex flex-col gap-0">
            {timeline.map((item, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-cyan-500" />
                  {i < timeline.length - 1 && (
                    <span className="w-px flex-1 bg-slate-200" />
                  )}
                </div>
                <div className="pb-5">
                  <p className="text-body font-bold text-navy-900">{item.label}</p>
                  <p className="text-caption text-ink-muted">{item.stamp}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {actionable && (
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
            {canExtend && (
              <button
                type="button"
                onClick={onExtend}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-body font-bold text-navy-900 hover:border-cyan-300 hover:bg-cyan-50 transition-colors"
              >
                Продлить
              </button>
            )}
            <button
              type="button"
              onClick={onRevoke}
              className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-body font-bold text-white hover:bg-rose-700 transition-colors"
            >
              Отозвать сейчас
            </button>
          </div>
        )}
      </motion.aside>
    </div>
  )
}

// ─── Overlay (modal scaffold) ────────────────────────────────────────────────

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-navy-900/30"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  )
}
