import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Clock3, Search, ShieldOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion'
import CockpitShell from '../../components/doctor/CockpitShell'
import { useInteldoc } from '../../store/store'
import {
  readingsFromAnalysis,
  type RangeFlag,
} from '../../store/doctorSelectors'
import { formatDateFull } from '../../lib/formatters'
import { BACKEND_MODE } from '../../api/config'
import {
  ensureWebSession,
  loadDoctorQueueBackend,
  type QueueRowBackend,
} from '../../lib/doctor-backend'
import type { ID, InteldocState, Patient } from '../../store/types'

type RowStatus = 'ready' | 'needs-review' | 'waiting' | 'in-progress' | 'not-started'
type FilterId = 'today' | 'ready' | 'needs-action'

interface IndicatorChip {
  field: string
  display: string
  range: RangeFlag
}
type QueueState = Pick<
  InteldocState,
  | 'patients'
  | 'analyses'
  | 'documents'
  | 'complaints'
  | 'planItems'
  | 'doctorRequests'
  | 'accessGrants'
>

interface QueueRow {
  id: ID
  time: string
  name: string
  appointmentType: 'Повторный' | 'Первичный'
  status: RowStatus
  prepLabel: string
  actionHint: string
  sortRank: number
  indicators: IndicatorChip[]
  /** Access was revoked (patient or admin) — record is locked, row is flagged. */
  revoked: boolean
}

const STATUS_LABEL: Record<RowStatus, string> = {
  ready: 'Готов',
  'needs-review': 'Проверить',
  waiting: 'Ждём пациента',
  'in-progress': 'В процессе',
  'not-started': 'Не начал',
}

const STATUS_PILL: Record<RowStatus, string> = {
  ready: 'bg-emerald-50 text-emerald-700',
  'needs-review': 'bg-cyan-50 text-cyan-700',
  waiting: 'bg-amber-50 text-amber-700',
  'in-progress': 'bg-blue-50 text-blue-700',
  'not-started': 'bg-slate-100 text-slate-600',
}

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'today', label: 'Сегодня' },
  { id: 'ready', label: 'Готовые' },
  { id: 'needs-action', label: 'Требуют действия' },
]

// Indicator chips sit one rung below the status pill in the row hierarchy:
// out-of-range readings carry the only visible tone; everything else is
// suppressed in buildRow so the scan target stays the status column.
const INDICATOR_TONE: Record<RangeFlag, string> = {
  above: 'border border-amber-200 bg-amber-50/60 text-amber-800',
  below: 'border border-amber-200 bg-amber-50/60 text-amber-800',
  in: 'border border-slate-200 text-ink-muted',
  unknown: 'border border-slate-200 text-ink-muted',
}

const TIME_BY_INDEX = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30']

// Doctor surface motion rhythm — mirrors ComplaintsSection / DocumentsSection.
// Stagger only fires on first mount; AnimatePresence handles filter-change swaps.
const QUEUE_REVEAL: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}
const ROW_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
}
const FILTER_PILL_SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.6 }

export default function PatientList() {
  const nav = useNavigate()
  const reduceMotion = useReducedMotion()
  const [activeFilter, setActiveFilter] = useState<FilterId>('today')
  const [query, setQuery] = useState('')

  const queueState = useInteldoc(
    useShallow((s) => ({
      patients: s.patients,
      analyses: s.analyses,
      documents: s.documents,
      complaints: s.complaints,
      planItems: s.planItems,
      doctorRequests: s.doctorRequests,
      accessGrants: s.accessGrants,
    })),
  )
  const mockRows = useMemo(() => buildRows(queueState), [queueState])
  // BACKEND_MODE: D01 reads the live queue (real prep status, grant-gating, and
  // ordering come from the API). The mock store path is untouched when off.
  const [backendRows, setBackendRows] = useState<QueueRow[] | null>(null)
  useEffect(() => {
    if (!BACKEND_MODE) return
    let cancelled = false
    void (async () => {
      try {
        await ensureWebSession('doctor')
        const raw = await loadDoctorQueueBackend()
        if (cancelled) return
        setBackendRows(
          raw
            .map(buildRowFromBackend)
            .sort((a, b) =>
              a.sortRank !== b.sortRank ? a.sortRank - b.sortRank : a.time.localeCompare(b.time),
            ),
        )
      } catch (e) {
        console.error('[backend] loadDoctorQueue failed', e)
        if (!cancelled) setBackendRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const rows = BACKEND_MODE ? backendRows ?? [] : mockRows
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let next = rows
    if (activeFilter === 'ready')
      next = next.filter((r) => r.status === 'ready')
    else if (activeFilter === 'needs-action')
      next = next.filter(
        (r) => r.status === 'needs-review' || r.status === 'waiting',
      )
    if (q) {
      next = next.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      )
    }
    return next
  }, [activeFilter, rows, query])

  const readyCount = rows.filter((r) => r.status === 'ready').length
  const actionCount = rows.filter(
    (r) => r.status === 'needs-review' || r.status === 'waiting',
  ).length

  return (
    <CockpitShell>
      <header className="flex items-start justify-between gap-4 px-8 pt-7 pb-5 border-b border-divider">
        <div>
          <p className="text-caption font-bold uppercase tracking-caps text-ink-muted">
            {formatRuWeekday(new Date())} · {rows.length}{' '}
            {pluralPriyom(rows.length)}
          </p>
          <h1 className="text-h1-ui font-bold text-ink-strong mt-1">
            Очередь приёмов
          </h1>
          <p className="text-caption text-ink-muted mt-1">
            Эндокор · отделение диабетологии · подготовка из приложения пациента
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SummaryTile label="Готовы" value={readyCount} tone="success" />
          <SummaryTile label="Действие врача" value={actionCount} tone="info" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-[360px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по ФИО или ID"
              aria-label="Поиск по очереди"
              className="w-full rounded-xl bg-surface pl-9 pr-4 py-2 text-caption shadow-[inset_0_0_0_1.5px_var(--slate-200)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--blue-600)]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 sm:ml-auto" role="tablist" aria-label="Фильтр очереди">
            {FILTERS.map((filter) => {
              const active = filter.id === activeFilter
              // Active state is painted by a shared `layoutId` pill so the dark
              // fill morphs between filters instead of teleporting. Reduced
              // motion falls back to a static background — same idiom as the
              // record-page tab strip.
              return (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  role="tab"
                  aria-selected={active}
                  className={`relative rounded-full px-3.5 py-1.5 text-caption font-bold uppercase tracking-caps transition-colors ${
                    active
                      ? reduceMotion
                        ? 'bg-ink-strong text-white'
                        : 'text-white'
                      : 'bg-surface text-ink-muted shadow-[inset_0_0_0_1px_var(--slate-200)] hover:text-ink'
                  }`}
                >
                  {active && !reduceMotion && (
                    <motion.span
                      layoutId="doctor-queue-filter-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-ink-strong"
                      transition={FILTER_PILL_SPRING}
                    />
                  )}
                  <span className="relative">{filter.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-surface overflow-hidden border border-slate-100">
          <table className="w-full text-left">
            <thead className="text-caption font-bold uppercase tracking-caps text-ink-muted">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 font-bold w-[110px]">Время</th>
                <th className="px-5 py-3 font-bold">Пациент</th>
                <th className="px-5 py-3 font-bold w-[160px]">Приём</th>
                <th className="px-5 py-3 font-bold w-[180px]">Готовность</th>
                <th className="px-5 py-3 font-bold">Что важно</th>
                <th className="px-5 py-3 font-bold w-[40px]" aria-label="Открыть" />
              </tr>
            </thead>
            <motion.tbody
              variants={reduceMotion ? undefined : QUEUE_REVEAL}
              initial={reduceMotion ? false : 'hidden'}
              animate={reduceMotion ? undefined : 'show'}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {visibleRows.map((row) => (
                  <motion.tr
                    key={row.id}
                    layout={!reduceMotion}
                    variants={reduceMotion ? undefined : ROW_VARIANTS}
                    initial={reduceMotion ? false : 'hidden'}
                    animate={reduceMotion ? undefined : 'show'}
                    exit={reduceMotion ? undefined : 'exit'}
                    onClick={() => nav(`/doctor/patients/${row.id}`)}
                    className="group h-14 cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-cyan-50/40"
                  >
                    <td className="px-5 align-middle text-body text-ink font-data">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={14} className="text-ink-muted" strokeWidth={2} />
                        {row.time}
                      </span>
                    </td>
                    <td className="px-5 align-middle">
                      <p className="text-body font-bold text-ink-strong">{row.name}</p>
                      <p className="text-caption text-ink-muted">{row.prepLabel}</p>
                    </td>
                    <td className="px-5 align-middle text-body text-ink-muted">
                      {row.appointmentType}
                    </td>
                    <td className="px-5 align-middle">
                      {row.revoked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-caption font-bold tracking-caps text-rose-700">
                          <ShieldOff size={12} strokeWidth={2.4} />
                          Доступ отозван
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-caption font-bold tracking-caps ${STATUS_PILL[row.status]}`}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 align-middle">
                      <p className="text-body text-ink">{row.actionHint}</p>
                      {row.indicators.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.indicators.map((i) => (
                            <span
                              key={`${row.id}-${i.field}`}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption ${INDICATOR_TONE[i.range]}`}
                            >
                              <span className="opacity-70">{i.field}</span>
                              <span className="font-bold tabular-nums">{i.display}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 align-middle">
                      <ChevronRight
                        size={16}
                        className="text-ink-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                        strokeWidth={2}
                      />
                    </td>
                  </motion.tr>
                ))}
                {visibleRows.length === 0 && (
                  <motion.tr
                    key="queue-empty"
                    variants={reduceMotion ? undefined : ROW_VARIANTS}
                    initial={reduceMotion ? false : 'hidden'}
                    animate={reduceMotion ? undefined : 'show'}
                    exit={reduceMotion ? undefined : 'exit'}
                  >
                    <td colSpan={6} className="px-5 py-10 text-center text-body text-ink-muted">
                      В этом фильтре пациентов нет.
                    </td>
                  </motion.tr>
                )}
              </AnimatePresence>
            </motion.tbody>
          </table>
        </div>
      </div>
    </CockpitShell>
  )
}

function buildRows(s: QueueState): QueueRow[] {
  return s.patients
    .map((patient, index) => buildRow(s, patient, index))
    .sort((a, b) => {
      if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank
      return a.time.localeCompare(b.time)
    })
}

function buildRow(s: QueueState, patient: Patient, index: number): QueueRow {
  const analyses = s.analyses.filter((a) => a.patientId === patient.id)
  const documents = s.documents.filter((d) => d.patientId === patient.id)
  const complaints = s.complaints.filter((c) => c.patientId === patient.id)
  const planItems = s.planItems.filter((p) => p.patientId === patient.id)
  const requests = s.doctorRequests.filter((r) => r.patientId === patient.id)
  const grant = s.accessGrants.find((g) => g.patientId === patient.id)
  const hasAccess = !!grant && !grant.revokedAt
  const revoked = !!grant?.revokedAt

  const uploadedPlan = planItems.filter((p) => p.status === 'uploaded').length
  const assignedPlan = planItems.filter((p) => p.status === 'assigned').length
  const acknowledgedPlan = planItems.filter((p) => p.status === 'acknowledged').length
  const requiredDocs = ['passport', 'oms'].filter((t) =>
    documents.some((d) => d.type === t),
  ).length
  const hasPatientContent = analyses.length > 0 || complaints.length > 0
  const hasUnreadByPatient = requests.some((r) => !r.seenByPatient)

  const status: RowStatus =
    uploadedPlan > 0
      ? 'needs-review'
      : assignedPlan > 0 || hasUnreadByPatient
      ? 'waiting'
      : hasAccess && requiredDocs === 2 && hasPatientContent
      ? 'ready'
      : hasAccess && hasPatientContent
      ? 'in-progress'
      : 'not-started'

  const actionHint =
    status === 'needs-review'
      ? 'Пациент загрузил результат'
      : status === 'waiting'
      ? 'Ожидаем ответ пациента'
      : status === 'ready'
      ? 'Подготовка завершена'
      : status === 'in-progress'
      ? 'Есть данные, но подготовка неполная'
      : 'Нет подготовки в приложении'

  const prepLabel =
    planItems.length > 0
      ? `План ${acknowledgedPlan + uploadedPlan}/${planItems.length}`
      : requiredDocs === 2
      ? 'Документы готовы'
      : `Документы ${requiredDocs}/2`

  const sortRank =
    status === 'needs-review'
      ? 0
      : status === 'ready'
      ? 1
      : status === 'waiting'
      ? 2
      : status === 'in-progress'
      ? 3
      : 4

  // Inline key indicators — newest analysis first, out-of-range only,
  // max 3 distinct fields. In-range readings are intentionally suppressed:
  // a "Готов" row needs no chips, and showing green values competes with
  // the status pill for attention.
  const seen = new Set<string>()
  const indicators: IndicatorChip[] = []
  const sortedAnalyses = analyses
    .slice()
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
  for (const a of sortedAnalyses) {
    for (const r of readingsFromAnalysis(a)) {
      if (seen.has(r.field)) continue
      if (r.range !== 'above' && r.range !== 'below') continue
      seen.add(r.field)
      indicators.push({
        field: r.field,
        display: r.numericValue != null
          ? `${r.numericValue}${r.unit ? ' ' + r.unit : ''}`
          : r.display,
        range: r.range,
      })
      if (indicators.length >= 3) break
    }
    if (indicators.length >= 3) break
  }

  return {
    id: patient.id,
    time: TIME_BY_INDEX[index % TIME_BY_INDEX.length],
    name: patient.name,
    appointmentType: index % 3 === 0 ? 'Первичный' : 'Повторный',
    status,
    prepLabel: revoked ? 'Доступ к данным отозван' : prepLabel,
    actionHint: revoked ? '' : actionHint,
    sortRank,
    indicators: revoked ? [] : indicators,
    revoked,
  }
}

// BACKEND_MODE row builder — maps a live QueueRowOut into the same QueueRow the
// table renders. Status blends the doctor-action signals (uploaded plan → review,
// assigned/unseen → waiting) with the real prep_status, so the patient's explicit
// «Подготовка завершена» flips them to «Готов» on the doctor's queue. Revoked
// patients never reach here — the API gates them out of the queue entirely.
function timeFromIso(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function buildRowFromBackend(r: QueueRowBackend): QueueRow {
  const status: RowStatus =
    r.plan_uploaded > 0
      ? 'needs-review'
      : r.prep_status === 'ready'
      ? 'ready'
      : r.plan_assigned > 0 || r.unseen_doctor_requests
      ? 'waiting'
      : r.prep_status === 'in_progress' || r.has_analyses || r.has_complaints
      ? 'in-progress'
      : 'not-started'

  const actionHint =
    status === 'needs-review'
      ? 'Пациент загрузил результат'
      : status === 'waiting'
      ? 'Ожидаем ответ пациента'
      : status === 'ready'
      ? 'Подготовка завершена'
      : status === 'in-progress'
      ? 'Есть данные, но подготовка неполная'
      : 'Нет подготовки в приложении'

  const prepLabel =
    r.plan_total > 0
      ? `План ${r.plan_acknowledged + r.plan_uploaded}/${r.plan_total}`
      : r.required_docs_present === 2
      ? 'Документы готовы'
      : `Документы ${r.required_docs_present}/2`

  const sortRank =
    status === 'needs-review'
      ? 0
      : status === 'ready'
      ? 1
      : status === 'waiting'
      ? 2
      : status === 'in-progress'
      ? 3
      : 4

  const indicators: IndicatorChip[] = r.out_of_range_indicators.slice(0, 3).map((i) => ({
    field: i.field,
    display: i.display,
    range: (i.range === 'above' || i.range === 'below' ? i.range : 'unknown') as RangeFlag,
  }))

  return {
    id: r.patient_public_id,
    time: timeFromIso(r.scheduled_at),
    name: r.name,
    appointmentType: r.appointment_type === 'preparatory' ? 'Первичный' : 'Повторный',
    status,
    prepLabel,
    actionHint,
    sortRank,
    indicators,
    revoked: false,
  }
}

const RU_WEEKDAYS = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
]

function formatRuWeekday(d: Date): string {
  return `${RU_WEEKDAYS[d.getDay()]}, ${formatDateFull(d.toISOString().slice(0, 10))}`
}

function pluralPriyom(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'приём'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'приёма'
  return 'приёмов'
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'info'
}) {
  const tint = tone === 'success' ? 'text-emerald-700' : 'text-cyan-700'
  return (
    <div className="min-w-[132px] rounded-2xl bg-surface border border-slate-200 px-4 py-3">
      <p className={`text-h2-ui font-bold font-data ${tint}`}>{value}</p>
      <p className="text-caption text-ink-muted">{label}</p>
    </div>
  )
}
