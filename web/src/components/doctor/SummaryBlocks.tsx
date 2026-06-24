import { useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  FlaskConical,
  Info,
  ListOrdered,
  Activity,
  NotebookPen,
  Plus,
  RotateCcw,
  ScanLine,
  Send,
  Siren,
  Stethoscope,
  TrendingUp,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

// Shared motion tokens for the prep-brief blocks. Matches the doctor surface
// vocabulary used in DocumentsSection / ComplaintsSection: expo-out curve,
// ~280ms duration, opacity-only fallback under reduced motion.
const PREP_EASE = [0.16, 1, 0.3, 1] as const
const PREP_DURATION = 0.28
import Button from '../primitives/Button'
import MetricCard from './MetricCard'
import VasilyMascot from '../system/VasilyMascot'
import { acknowledgeAnalysis } from '../../store/actions'
import { readingsFromAnalysis } from '../../store/doctorSelectors'
import { COMPLAINT_TAG_LABEL } from './doctorConstants'
import {
  formatAppointmentLead,
  formatDateShort,
  formatDateTime,
} from '../../lib/formatters'
import { FieldGroupCard, buildFieldGroups } from './HistoryByField'
import type {
  Analysis,
  AnalysisType,
  Appointment,
  Complaint,
  OrderIntent,
  OrderKind,
  PlanItemStatus,
} from '../../store/types'
import type {
  AgendaItem,
  AgendaSource,
  CriticalLab,
  MetricDelta,
  MetricReading,
} from '../../store/doctorSelectors'
import type { MetricCardTrend } from './MetricCard'

/**
 * Sectioned blocks that live on the doctor's Сводка tab. Each block is
 * self-contained with its own empty state — `PatientRecord` composes them.
 */

// ─── «Что важно пациенту» ────────────────────────────────────────────────────

export function RankedQuestionsBlock({
  questions,
  total,
  onSeeAll,
}: {
  questions: Complaint[]
  total: number
  onSeeAll: () => void
}) {
  if (questions.length === 0) {
    return (
      <BlockShell
        tone="blue"
        eyebrow="Что важно пациенту"
        eyebrowIcon={<ListOrdered size={14} strokeWidth={2.4} />}
      >
        <p className="text-body text-ink-muted leading-relaxed">
          Пациент не отметил тем — спросите при приёме.
        </p>
      </BlockShell>
    )
  }
  return (
    <BlockShell
      tone="blue"
      eyebrow="Что важно пациенту"
      eyebrowIcon={<ListOrdered size={14} strokeWidth={2.4} />}
      hint="Пациент сам отметил эти темы перед визитом."
      action={
        total > questions.length
          ? {
              label: `Все темы · ${total}`,
              onClick: onSeeAll,
            }
          : undefined
      }
    >
      <ol className="flex flex-col gap-2.5">
        {questions.map((q, i) => (
          <li
            key={q.id}
            className="flex items-start gap-3 rounded-2xl bg-surface-sunken p-3.5"
          >
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white text-caption font-bold">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink-strong leading-snug">
                {q.text}
              </p>
              {q.tags && q.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {q.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-white px-2 py-0.5 text-caption font-bold uppercase tracking-caps text-ink-muted shadow-[inset_0_0_0_1px_var(--slate-200)]"
                    >
                      {COMPLAINT_TAG_LABEL[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </BlockShell>
  )
}

// ─── «Анализы к этому визиту» ────────────────────────────────────────────────

type UploadRowState = 'pending' | 'accepted' | 'declined'

function uploadRowState(a: Analysis): UploadRowState {
  if (a.status === 'rejected' || a.status === 'resend_requested') return 'declined'
  if (a.status === 'acknowledged') return 'accepted'
  return 'pending'
}

/**
 * Anchor block on Подготовка к приёму: every analysis the patient uploaded
 * since their last completed visit, with per-row state that mirrors the
 * verdict lifecycle (`uploaded` → `acknowledged` / `rejected | resend_requested`).
 *
 * Three visual states per row:
 *  1. «Ждёт решения» — amber card; «Открыть оригинал» + «Принять» buttons.
 *  2. «Принято» — neutral card with green check; «Открыть» button.
 *  3. «Не учитывается» — muted card with reason badge (wrong upload /
 *     resend requested); «Открыть» button.
 *
 * Unlike a transient inbox, the block does not disappear when the queue is
 * empty — it stays as a stable anchor for the doctor («что пациент прислал к
 * этому визиту»). The counter pill reports outstanding-pending only.
 */
export function PrepUploadsBlock({
  analyses,
  onOpenAnalysis,
}: {
  /** Already scoped to the current prep window (since last completed visit). */
  analyses: Analysis[]
  onOpenAnalysis: (a: Analysis) => void
}) {
  const [expandAccepted, setExpandAccepted] = useState(false)
  const reduceMotion = useReducedMotion()

  const pending = analyses.filter((a) => uploadRowState(a) === 'pending')
  const declined = analyses.filter((a) => uploadRowState(a) === 'declined')
  const accepted = analyses.filter((a) => uploadRowState(a) === 'accepted')

  return (
    <BlockShell
      tone={pending.length > 0 ? 'amber' : 'default'}
      eyebrow="Анализы к этому визиту"
      eyebrowIcon={<ScanLine size={14} strokeWidth={2.4} />}
      counter={pending.length}
      hint={
        pending.length > 0
          ? 'Новые загрузки пациента — примите или откройте оригинал.'
          : 'Что пациент загрузил к этому визиту.'
      }
    >
      {analyses.length === 0 ? (
        <div className="rounded-2xl bg-surface-sunken px-4 py-4">
          <p className="text-body text-ink-muted leading-relaxed">
            Пациент пока ничего не прислал к этому визиту.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {/* Pending rows: AnimatePresence so an accepted row collapses out
              rather than popping. The «Принято · N» accordion below absorbs
              it on the next render — calmer than two adjacent jumps. */}
          <AnimatePresence initial={false}>
            {pending.map((a) => (
              <motion.li
                key={a.id}
                layout={reduceMotion ? false : 'position'}
                initial={false}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, height: 0, marginTop: 0 }
                }
                transition={{
                  duration: reduceMotion ? 0.12 : 0.24,
                  ease: PREP_EASE,
                }}
                style={{ overflow: 'hidden' }}
              >
                <PrepUploadRow
                  analysis={a}
                  onOpen={() => onOpenAnalysis(a)}
                  onAccept={() => acknowledgeAnalysis(a.id)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
          {declined.map((a) => (
            <li key={a.id}>
              <PrepUploadRow
                analysis={a}
                onOpen={() => onOpenAnalysis(a)}
                onAccept={() => acknowledgeAnalysis(a.id)}
              />
            </li>
          ))}
          {accepted.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setExpandAccepted((v) => !v)}
                aria-expanded={expandAccepted}
                className="w-full text-left flex items-center gap-2 text-caption font-bold uppercase tracking-caps text-ink-muted hover:text-ink py-2"
              >
                <ChevronDown
                  size={14}
                  strokeWidth={2.4}
                  className={`transition-transform duration-200 ${
                    expandAccepted ? '' : '-rotate-90'
                  }`}
                />
                Принято · {accepted.length}
              </button>
              {/* Accordion expand: animate height + opacity so the accepted
                  list reveals without a jarring layout jump. Reduced motion
                  collapses to opacity only. */}
              <AnimatePresence initial={false}>
                {expandAccepted && (
                  <motion.ul
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, height: 0, marginTop: 0 }
                    }
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : { opacity: 1, height: 'auto', marginTop: 8 }
                    }
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, height: 0, marginTop: 0 }
                    }
                    transition={{
                      duration: reduceMotion ? 0.12 : PREP_DURATION,
                      ease: PREP_EASE,
                    }}
                    style={{ overflow: 'hidden' }}
                    className="flex flex-col gap-3"
                  >
                    {accepted.map((a) => (
                      <li key={a.id}>
                        <PrepUploadRow
                          analysis={a}
                          onOpen={() => onOpenAnalysis(a)}
                          onAccept={() => acknowledgeAnalysis(a.id)}
                        />
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          )}
        </ul>
      )}
    </BlockShell>
  )
}

const REJECTION_REASON_LABEL: Record<string, string> = {
  not_my_clinic: 'не из этой клиники',
  wrong_patient: 'не этот пациент',
  wrong_panel: 'не та панель',
  duplicate: 'дубликат',
  other: 'отклонено',
}

const RESEND_REASON_LABEL: Record<string, string> = {
  poor_quality: 'плохое качество',
  missing_pages: 'не все страницы',
  date_unreadable: 'дата не читается',
  lab_stamp_missing: 'нет печати лаборатории',
  other: 'запрошена замена',
}

function PrepUploadRow({
  analysis,
  onOpen,
  onAccept,
}: {
  analysis: Analysis
  onOpen: () => void
  onAccept: () => void
}) {
  const state = uploadRowState(analysis)
  const reading = readingsFromAnalysis(analysis)[0]
  const lowConf = !!reading?.lowConfidence
  const isByRequest = !!analysis.linkedPlanItemId

  const stateClass =
    state === 'pending'
      ? 'bg-amber-50 shadow-[inset_3px_0_0_0_var(--amber-400,#fbbf24),inset_0_0_0_1.5px_var(--amber-200,#fde68a)]'
      : state === 'accepted'
      ? 'bg-surface shadow-[inset_0_0_0_1.5px_var(--slate-100)]'
      : 'bg-surface-sunken shadow-[inset_0_0_0_1.5px_var(--slate-100)]'

  return (
    <div className={`rounded-2xl p-4 ${stateClass}`}>
      <div className="flex items-start gap-4 flex-wrap md:flex-nowrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p
              className={`text-body font-bold leading-tight ${
                state === 'declined' ? 'text-ink-muted line-through' : 'text-ink-strong'
              }`}
            >
              {analysis.label}
            </p>
            <SourcePill byRequest={isByRequest} muted={state !== 'pending'} />
            {state === 'pending' && lowConf && (
              <span
                className="inline-flex items-center gap-1 text-micro font-bold uppercase tracking-caps text-amber-700 bg-amber-100 rounded-full px-2 py-0.5"
                title="Низкая уверенность OCR — стоит свериться с оригиналом"
              >
                <AlertTriangle size={11} strokeWidth={2.4} /> OCR
              </span>
            )}
            {state === 'accepted' && (
              <span className="inline-flex items-center gap-1 text-micro font-bold uppercase tracking-caps text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                <CheckCircle2 size={11} strokeWidth={2.6} /> Принято
              </span>
            )}
            {state === 'declined' && (
              <span className="inline-flex items-center gap-1 text-micro font-bold uppercase tracking-caps text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                {analysis.status === 'resend_requested'
                  ? 'Запрошена замена'
                  : 'Не учитывается'}
              </span>
            )}
          </div>
          <PrepUploadValueLine analysis={analysis} muted={state === 'declined'} />
          {state === 'declined' && (
            <p className="text-caption text-ink-muted mt-1">
              {prepUploadFootnote(analysis, state)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {state !== 'declined' && (
            <p className="text-micro text-ink-subtle whitespace-nowrap">
              {state === 'pending'
                ? `Загружено ${formatDateShort(analysis.uploadedAt)}`
                : `Принято ${formatDateShort(analysis.uploadedAt)}`}
            </p>
          )}
          <div className="flex items-center gap-2">
            {state === 'pending' ? (
              <>
                <Button
                  variant="ghost"
                  size="md"
                  icon={<Eye size={14} strokeWidth={2.4} />}
                  onClick={onOpen}
                >
                  Открыть оригинал
                </Button>
                <Button
                  size="md"
                  icon={<Check size={14} strokeWidth={2.5} />}
                  onClick={onAccept}
                >
                  Принять
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="md"
                icon={<Eye size={14} strokeWidth={2.4} />}
                onClick={onOpen}
              >
                Открыть
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SourcePill({
  byRequest,
  muted,
}: {
  byRequest: boolean
  muted: boolean
}) {
  const base =
    'text-micro font-bold uppercase tracking-caps rounded-full px-2 py-0.5'
  if (byRequest) {
    return (
      <span
        className={`${base} ${
          muted ? 'text-cyan-700/70 bg-cyan-50' : 'text-cyan-600 bg-cyan-50'
        }`}
      >
        По запросу
      </span>
    )
  }
  return (
    <span className={`${base} text-ink-muted bg-surface-sunken`}>
      От пациента
    </span>
  )
}

function PrepUploadValueLine({
  analysis,
  muted,
}: {
  analysis: Analysis
  muted: boolean
}) {
  const readings = readingsFromAnalysis(analysis)
  if (readings.length === 0) {
    return (
      <p className="text-caption text-ink-muted">
        Не удалось распознать значения — откройте оригинал.
      </p>
    )
  }
  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      {readings.map((r) => (
        <div key={r.field} className="flex items-baseline gap-1.5">
          <span className="text-caption text-ink-muted font-bold uppercase tracking-caps">
            {r.field}
          </span>
          <span
            className={`text-body-lg font-bold font-data ${
              muted
                ? 'text-ink-muted line-through'
                : r.range === 'above' || r.range === 'below'
                ? 'text-amber-700'
                : 'text-ink-strong'
            }`}
          >
            {r.display}
          </span>
          {r.ref && (
            <span className="text-caption text-ink-muted font-data">
              {r.ref}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function prepUploadFootnote(a: Analysis, state: UploadRowState): string {
  if (state === 'pending') {
    return `Загружено ${formatDateShort(a.uploadedAt)}`
  }
  if (state === 'accepted') {
    return `Принято ${formatDateShort(a.uploadedAt)}`
  }
  // declined
  if (a.status === 'resend_requested' && a.resendRequest) {
    const reason = RESEND_REASON_LABEL[a.resendRequest.reason] ?? 'замена'
    return `Запрошена замена · ${reason} · ${formatDateShort(
      a.resendRequest.requestedAt,
    )}`
  }
  if (a.status === 'rejected' && a.rejection) {
    const reason = REJECTION_REASON_LABEL[a.rejection.reason] ?? 'отклонено'
    return `Отклонено · ${reason} · ${formatDateShort(a.rejection.rejectedAt)}`
  }
  return `Загружено ${formatDateShort(a.uploadedAt)}`
}

// ─── «Вне референса» ─────────────────────────────────────────────────────────

/**
 * Confident readings outside the reference range — the clinical-findings
 * block. Source data is restricted to accepted analyses upstream, so
 * unaccepted patient uploads do not surface here; they sit in
 * `PrepUploadsBlock` until the doctor presses «Принять».
 */
export function OutOfRangeMetricsBlock({
  metrics,
  deltas = [],
  hasAnyMetrics,
  outOfRangeId,
  onOpenAnalysis,
}: {
  metrics: MetricReading[]
  /** Per-field delta vs previous visit — used to render mini-trend on each card. */
  deltas?: MetricDelta[]
  /** Whether the patient has any structured readings at all. Drives the empty copy. */
  hasAnyMetrics: boolean
  /** When set, the corresponding metric card scrolls into view on mount. */
  outOfRangeId?: string
  onOpenAnalysis: (analysisId: string) => void
}) {
  const anchorId = useId()
  if (!hasAnyMetrics) {
    return (
      <BlockShell
        tone="amber"
        eyebrow="Вне референса"
        eyebrowIcon={<Activity size={14} strokeWidth={2.4} />}
      >
        <p className="text-body text-ink-muted leading-relaxed">
          Пациент пока не загрузил структурированные результаты.
        </p>
      </BlockShell>
    )
  }
  if (metrics.length === 0) {
    return (
      <BlockShell
        tone="amber"
        eyebrow="Вне референса"
        eyebrowIcon={<Activity size={14} strokeWidth={2.4} />}
      >
        <div className="rounded-2xl bg-emerald-50/70 px-4 py-3 inline-flex items-center gap-2 text-emerald-800">
          <CheckCircle2 size={14} strokeWidth={2.4} />
          <span className="text-body font-medium">
            Все ключевые показатели в референсе
          </span>
        </div>
      </BlockShell>
    )
  }
  return (
    <BlockShell
      id={anchorId}
      tone="amber"
      eyebrow="Вне референса"
      eyebrowIcon={<Activity size={14} strokeWidth={2.4} />}
      counter={metrics.length}
      hint="Что обсудить и с чем сравнить динамику."
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map((m) => {
          const trend = trendForField(deltas, m.field)
          return (
            <button
              key={`${m.analysisId}-${m.field}`}
              data-out-of-range="1"
              onClick={() => onOpenAnalysis(m.analysisId)}
              className={`text-left rounded-2xl transition-shadow hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] ${
                outOfRangeId ? 'ring-2 ring-amber-300' : ''
              }`}
            >
              <MetricCard reading={m} tone="flagged" trend={trend} />
            </button>
          )
        })}
      </div>
    </BlockShell>
  )
}

/**
 * Map a `MetricDelta` for the given field into the trend shape the card
 * renders. Returns undefined when there is no prior reading to compare with.
 */
function trendForField(
  deltas: MetricDelta[],
  field: string,
): MetricCardTrend | undefined {
  const d = deltas.find((x) => x.field === field)
  if (!d) return undefined
  const direction: MetricCardTrend['direction'] =
    d.delta === 0 ? 'flat' : d.delta > 0 ? 'up' : 'down'
  return {
    previousDisplay: d.previous.display,
    previousMeasuredAt: d.previous.measuredAt,
    trend: d.trend,
    direction,
  }
}

// ─── «Динамика» ──────────────────────────────────────────────────────────────

/**
 * Trajectory-led dynamics block on the doctor's Сводка.
 *
 * Per-indicator card (HbA1c, glucose, …) with a sparkline + latest-vs-previous
 * delta + reference range, ranked by recency of last reading. Out-of-reference
 * latest point is highlighted on the sparkline — the prototype-level proxy
 * for the «поймать аномалию» JTBD.
 *
 * Tap a card → expand to the reading-by-reading list with provenance
 * (source analysis + date + tap-to-open-original), so a suspicious point can
 * be verified without leaving the section.
 *
 * Trajectory subsumes the older «vs прошлый приём» two-point comparison —
 * the latest delta is still shown on the card, and the sparkline carries the
 * broader trend that pure last-vs-prev hides. Indicators with a single
 * reading drop out: there is no trajectory to read yet.
 */
const DYNAMICS_DEFAULT_LIMIT = 3
const EMPTY_QUERY = {
  period: null,
  type: null,
  recognized: [] as never[],
  remainder: '',
}

export function DynamicsBlock({
  analyses,
  onOpenAnalysis,
}: {
  analyses: Analysis[]
  onOpenAnalysis: (a: Analysis) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const allGroups = useMemo(
    () => buildFieldGroups(analyses, EMPTY_QUERY),
    [analyses],
  )
  const trajectoryGroups = useMemo(
    () => allGroups.filter((g) => g.readings.length >= 2),
    [allGroups],
  )

  if (analyses.length === 0) {
    return (
      <BlockShell
        tone="slate"
        eyebrow="Динамика"
        eyebrowIcon={<TrendingUp size={14} strokeWidth={2.4} />}
        hint="Траектория ключевых показателей пациента."
      >
        <p className="text-body text-ink-muted leading-relaxed">
          Пациент пока не загрузил историю анализов — траектория появится после первого результата.
        </p>
      </BlockShell>
    )
  }

  if (trajectoryGroups.length === 0) {
    return (
      <BlockShell
        tone="slate"
        eyebrow="Динамика"
        eyebrowIcon={<TrendingUp size={14} strokeWidth={2.4} />}
        hint="Траектория ключевых показателей пациента."
      >
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl bg-blue-50/60 px-4 py-3 shadow-[inset_0_0_0_1px_var(--blue-100,#dbeafe)]"
        >
          <Info
            size={18}
            strokeWidth={2.2}
            className="text-blue-600 mt-0.5 flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-body font-bold text-ink-strong leading-snug">
              По каждому показателю пока одно измерение.
            </p>
            <p className="text-caption text-ink-muted leading-snug mt-1">
              Траектория появится со следующим результатом — текущие значения видны в блоке «Вне референса» и в карточке анализа.
            </p>
          </div>
        </div>
      </BlockShell>
    )
  }

  const visible = expanded
    ? trajectoryGroups
    : trajectoryGroups.slice(0, DYNAMICS_DEFAULT_LIMIT)
  const hiddenCount = Math.max(0, trajectoryGroups.length - visible.length)

  return (
    <BlockShell
      eyebrow="Динамика"
      eyebrowIcon={<TrendingUp size={12} strokeWidth={2.4} />}
      counter={trajectoryGroups.length}
      hint="Траектория ключевых показателей. Тап по карточке — провенанс по точкам."
      action={
        hiddenCount > 0 && !expanded
          ? {
              label: `Показать всё · ${trajectoryGroups.length}`,
              onClick: () => setExpanded(true),
            }
          : expanded && trajectoryGroups.length > DYNAMICS_DEFAULT_LIMIT
          ? { label: 'Свернуть', onClick: () => setExpanded(false) }
          : undefined
      }
    >
      <ul className="flex flex-col gap-2">
        {visible.map((g) => (
          <FieldGroupCard
            key={g.field}
            group={g}
            onOpenAnalysis={onOpenAnalysis}
          />
        ))}
      </ul>
    </BlockShell>
  )
}

// ─── Critical-lab banner (M2) ────────────────────────────────────────────────

/**
 * Top-of-record signal for values that crossed conservative critical
 * thresholds. Non-alarmist by design — frames the readings as «обратите
 * внимание» rather than «опасно». Renders nothing when there are no
 * critical readings, so it is invisible on the canonical demo flow (p2)
 * and fires only on patients like Андрей Волков (p4).
 */
export function CriticalLabBanner({ labs }: { labs: CriticalLab[] }) {
  if (labs.length === 0) return null
  return (
    <section
      role="status"
      aria-label="Критические показатели"
      className="rounded-2xl border border-rose-200 bg-rose-50/70 px-5 py-4"
    >
      <div className="flex items-start gap-3">
        <Siren
          size={18}
          strokeWidth={2.2}
          className="text-rose-600 mt-0.5 flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-micro font-bold uppercase tracking-caps text-rose-700">
            Критические значения
          </p>
          <p className="text-body text-ink-strong leading-snug mt-1">
            У пациента {labs.length === 1 ? 'показатель' : 'показатели'} за
            пределами безопасного диапазона. Стоит обсудить в первую очередь.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {labs.map((l) => (
              <li
                key={`${l.analysisId}-${l.field}`}
                className="flex items-baseline justify-between gap-3 rounded-xl bg-white/70 px-3 py-2"
              >
                <span className="text-body font-bold text-ink-strong">
                  {l.field}{' '}
                  <span className="font-data text-rose-700">{l.display}</span>
                </span>
                <span className="text-caption text-ink-muted">
                  {l.reason}
                  {l.ref ? ` · норма ${l.ref}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-muted mt-2.5 leading-snug">
            Это подсказка системы — итоговая оценка за врачом.
          </p>
        </div>
      </div>
    </section>
  )
}

// ─── «Назначения к следующему приёму» ──────────────────────────────────────

/**
 * Doctor's own pre-prepared order list for the upcoming visit — distinct
 * from Vasily's «Повестка визита» which carries observations, not decisions.
 *
 * Two axes:
 *   • `kind` — what category of order (lab / instrumental / referral /
 *     self-monitor). Drives the row icon, the right-side chip for non-lab
 *     items, and patient-side rendering downstream.
 *   • `intent` — for lab orders only, why this lab now (close-gap /
 *     schedule-recheck / probe-signal). Surfaced as the right-side chip on
 *     lab rows so the reason for re-issuing labs stays legible.
 *
 * The doctor selects rows and bulk-dispatches via the parent `onSendOrders`.
 * Already-dispatched rows flip to a `committed` state with a «✓ Запрошено»
 * pill so re-renders don't lose track of what's been sent.
 */
export type TestOrderIntent = 'close-gap' | 'schedule-recheck' | 'probe-signal'

export interface TestOrderItem {
  id: string
  /** Test name, e.g. «Микроальбумин в моче». */
  label: string
  /** When the order is targeted, e.g. «к этому приёму», «через 3 месяца». */
  timing: string
  /** Why this order — grounded in plan / labs / complaints, not new judgement. */
  rationale: string
  intent: TestOrderIntent
  /**
   * Patient-facing intent (closed list) — drives the chip the patient sees as
   * the request's category header and the chip on the doctor's pending row.
   * Distinct from `intent` above, which is the doctor-internal reasoning.
   */
  orderIntent?: OrderIntent
  /**
   * Order category. Drives the row icon, the right-side chip for non-lab
   * rows, and patient-side rendering. Defaults to `'lab'` when absent.
   */
  kind?: OrderKind
  /**
   * Patient-facing prep hint shown directly under the rationale on the
   * doctor's row — and forwarded to the patient surface so the dispatched
   * order arrives actionable. Examples: «натощак, утром», «возьмите
   * направление в регистратуре», «записывайте до завтрака, 2 недели».
   */
  prep?: string
  /**
   * True when this order has already been issued to the patient (via the
   * agenda's «Запросить анализ» chip). Drives the «✓ Запрошено»
   * confirmation pill in place of the intent tag.
   */
  committed?: boolean
  /**
   * Plan-item backing this order. Present for close-gap / probe-signal
   * orders that re-issue an existing plan item; absent for fresh recheck
   * orders that need a brand-new request created.
   */
  planItemId?: string
  /** Analysis type for fresh request creation (recheck path). */
  analysisType?: AnalysisType
}

const TEST_ORDER_INTENT_LABEL: Record<TestOrderIntent, string> = {
  'close-gap': 'Закрыть пробел',
  'schedule-recheck': 'Контроль динамики',
  'probe-signal': 'По сигналу',
}

const TEST_ORDER_INTENT_TONE: Record<TestOrderIntent, string> = {
  'close-gap':
    'bg-white text-amber-800 shadow-[inset_0_0_0_1px_var(--amber-300,#fcd34d)]',
  'schedule-recheck':
    'bg-white text-slate-700 shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)]',
  'probe-signal':
    'bg-white text-cyan-700 shadow-[inset_0_0_0_1px_var(--cyan-200,#a5f3fc)]',
}

const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  lab: 'Анализ',
  instrumental: 'Обследование',
  referral: 'Направление',
  'self-monitor': 'Самоконтроль',
}

const ORDER_INTENT_LABEL: Record<OrderIntent, string> = {
  'before-visit': 'Перед визитом',
  'dynamics-control': 'Контроль динамики',
  'additional-check': 'Доп. проверка',
  'ocr-clarification': 'Уточнить OCR',
}

const ORDER_INTENT_TONE: Record<OrderIntent, string> = {
  'before-visit':
    'bg-cyan-50 text-cyan-800 shadow-[inset_0_0_0_1px_var(--cyan-200,#a5f3fc)]',
  'dynamics-control':
    'bg-violet-50 text-violet-800 shadow-[inset_0_0_0_1px_var(--violet-200,#ddd6fe)]',
  'additional-check':
    'bg-amber-50 text-amber-800 shadow-[inset_0_0_0_1px_var(--amber-200,#fcd34d)]',
  'ocr-clarification':
    'bg-slate-100 text-slate-700 shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)]',
}

const ORDER_INTENT_VALUES: OrderIntent[] = [
  'before-visit',
  'dynamics-control',
  'additional-check',
  'ocr-clarification',
]

function OrderIntentChip({ intent }: { intent: OrderIntent }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-caps whitespace-nowrap ${ORDER_INTENT_TONE[intent]}`}
    >
      {ORDER_INTENT_LABEL[intent]}
    </span>
  )
}

const PLAN_STATUS_LABEL: Record<PlanItemStatus, string> = {
  assigned: 'Ждём пациента',
  uploaded: 'Загружено',
  acknowledged: 'Принято',
}

const PLAN_STATUS_TONE: Record<PlanItemStatus, string> = {
  assigned:
    'bg-amber-50 text-amber-800 shadow-[inset_0_0_0_1px_var(--amber-200,#fcd34d)]',
  uploaded:
    'bg-cyan-50 text-cyan-800 shadow-[inset_0_0_0_1px_var(--cyan-200,#a5f3fc)]',
  acknowledged:
    'bg-emerald-50 text-emerald-800 shadow-[inset_0_0_0_1px_var(--emerald-200,#a7f3d0)]',
}

function PlanStatusChip({ status }: { status: PlanItemStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-caps whitespace-nowrap ${PLAN_STATUS_TONE[status]}`}
    >
      {PLAN_STATUS_LABEL[status]}
    </span>
  )
}

const ORDER_KIND_TONE =
  'bg-white text-slate-700 shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)]'

function orderKindIcon(kind: OrderKind) {
  switch (kind) {
    case 'instrumental':
      return ScanLine
    case 'referral':
      return Stethoscope
    case 'self-monitor':
      return NotebookPen
    case 'lab':
    default:
      return FlaskConical
  }
}

function TestOrderIntentTag({ intent }: { intent: TestOrderIntent }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-caps whitespace-nowrap ${TEST_ORDER_INTENT_TONE[intent]}`}
    >
      {TEST_ORDER_INTENT_LABEL[intent]}
    </span>
  )
}

function OrderKindTag({ kind }: { kind: OrderKind }) {
  const Icon = orderKindIcon(kind)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-caps whitespace-nowrap ${ORDER_KIND_TONE}`}
    >
      <Icon size={10} strokeWidth={2.5} />
      {ORDER_KIND_LABEL[kind]}
    </span>
  )
}

/**
 * Payload of the inline «Добавить назначение» composer. The block emits
 * this to its parent, which is responsible for generating the order id and
 * appending it to its custom-orders state — the block does not mutate its
 * own `items` prop.
 */
export interface NewOrderDraft {
  kind: OrderKind
  label: string
  prep?: string
  /** Patient-facing intent picked by the doctor in the composer (JTBD-1). */
  intent: OrderIntent
}

/**
 * Status of a dispatched item shown in the ledger sub-section («Что мы уже
 * попросили»). Maps `PlanItemStatus` to user-facing chips and keeps the
 * source-of-truth typing centralised here so the block stays self-contained.
 */
export interface DispatchedOrderRow {
  /** PlanItem id, used as the React key. */
  id: string
  label: string
  kind: OrderKind
  status: PlanItemStatus
  /** ISO timestamp of the most recent dispatch (lastRequestedAt or createdAt). */
  requestedAt: string
  /** Patient-facing intent — derived from the parent DoctorRequest. */
  intent?: OrderIntent
}

export function TestOrdersBlock({
  items,
  dispatched = [],
  unseenUploads = 0,
  onSendOrders,
  onAddOrder,
}: {
  items: TestOrderItem[]
  /**
   * Past dispatched items (JTBD-2). Rendered in the «Что мы уже попросили»
   * sub-section below the pending list with a per-item status chip. Empty
   * array hides the sub-section.
   */
  dispatched?: DispatchedOrderRow[]
  /**
   * Attention indicator (JTBD-3) — count of dispatched items the patient has
   * uploaded that the doctor hasn't yet reviewed. Drives the badge on the
   * ledger sub-section header. Zero suppresses the badge.
   */
  unseenUploads?: number
  /**
   * Issues the selected orders to the patient's checklist. Called with the
   * subset of `items` the doctor selected via row checkboxes. Caller is
   * expected to route each item to `requestPlanItem` (when `planItemId` is
   * set) or `sendRequest` (for fresh recheck orders) so the items flip to
   * `committed: true` on the next render.
   */
  onSendOrders?: (orders: TestOrderItem[]) => void
  /**
   * Appends a custom order built by the doctor in the inline composer.
   * When omitted, the «+ Добавить назначение» affordance is hidden.
   */
  onAddOrder?: (draft: NewOrderDraft) => void
}) {
  const pending = useMemo(() => items.filter((i) => !i.committed), [items])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [composerOpen, setComposerOpen] = useState(false)
  const [draftKind, setDraftKind] = useState<OrderKind>('lab')
  const [draftIntent, setDraftIntent] = useState<OrderIntent>('before-visit')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftPrep, setDraftPrep] = useState('')
  const reduceMotion = useReducedMotion()

  // Selection is internal to this block. Prune ids that no longer match a
  // pending item (e.g. after a successful send flips committed → true).
  const liveSelected = useMemo(() => {
    const pendingIds = new Set(pending.map((p) => p.id))
    const next = new Set<string>()
    for (const id of selectedIds) if (pendingIds.has(id)) next.add(id)
    return next
  }, [selectedIds, pending])

  if (items.length === 0) {
    return (
      <BlockShell
        tone="slate"
        eyebrow="Назначения к следующему приёму"
        eyebrowIcon={<ClipboardList size={14} strokeWidth={2.4} />}
      >
        <p className="text-body text-ink-muted leading-relaxed">
          К обсуждению на этом приёме — нет предложенных назначений.
        </p>
      </BlockShell>
    )
  }

  const allSent = pending.length === 0
  const hasCanSend = !!onSendOrders && pending.length > 0
  const allPendingSelected =
    pending.length > 0 && liveSelected.size === pending.length

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allPendingSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(pending.map((p) => p.id)))
  }

  const send = () => {
    if (!onSendOrders) return
    const chosen = pending.filter((p) => liveSelected.has(p.id))
    if (chosen.length === 0) return
    onSendOrders(chosen)
    setSelectedIds(new Set())
  }

  const showBulkToggle = hasCanSend && pending.length > 1
  const canAdd = !!onAddOrder

  const resetComposer = () => {
    setDraftKind('lab')
    setDraftIntent('before-visit')
    setDraftLabel('')
    setDraftPrep('')
  }

  const closeComposer = () => {
    setComposerOpen(false)
    resetComposer()
  }

  const submitComposer = () => {
    if (!onAddOrder) return
    const label = draftLabel.trim()
    if (label.length === 0) return
    const prep = draftPrep.trim()
    onAddOrder({
      kind: draftKind,
      intent: draftIntent,
      label,
      prep: prep.length > 0 ? prep : undefined,
    })
    closeComposer()
  }

  return (
    <BlockShell
      tone="slate"
      eyebrow="Назначения к следующему приёму"
      eyebrowIcon={<ClipboardList size={14} strokeWidth={2.4} />}
      counter={items.length}
      hint="Выберите всё нужное и отправьте пациенту."
    >
      {/* «Все назначения отправлены» banner: enters with a gentle settle when
          the last pending row flips to committed. State change → soft fade-up
          so it's noticed without flashing. */}
      <AnimatePresence initial={false}>
        {allSent && (
          <motion.div
            key="all-sent"
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, height: 0 }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, height: 'auto' }
            }
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }
            }
            transition={{
              duration: reduceMotion ? 0.12 : PREP_DURATION,
              ease: PREP_EASE,
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-emerald-800 shadow-[inset_0_0_0_1px_var(--emerald-200,#a7f3d0)]">
              <CheckCircle2 size={14} strokeWidth={2.4} />
              <span className="text-caption font-bold">
                Все назначения отправлены пациенту
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const selectable = hasCanSend && !it.committed
          const isSelected = liveSelected.has(it.id)
          const kind: OrderKind = it.kind ?? 'lab'
          const KindIcon = orderKindIcon(kind)
          const orderIntentLabel = it.orderIntent
            ? ORDER_INTENT_LABEL[it.orderIntent]
            : null
          const secondaryLabel =
            kind === 'lab'
              ? TEST_ORDER_INTENT_LABEL[it.intent]
              : ORDER_KIND_LABEL[kind]
          const showSecondaryChip =
            !it.committed && orderIntentLabel !== secondaryLabel
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={selectable ? () => toggleOne(it.id) : undefined}
                disabled={!selectable}
                aria-pressed={selectable ? isSelected : undefined}
                className={`w-full text-left flex items-start gap-3 rounded-2xl px-4 py-3 transition-colors ${
                  it.committed
                    ? 'bg-emerald-50/40 cursor-default'
                    : selectable
                    ? isSelected
                      ? 'bg-cyan-50 shadow-[inset_0_0_0_1.5px_var(--cyan-300,#67e8f9)]'
                      : 'bg-surface-sunken hover:bg-slate-100'
                    : 'bg-surface-sunken cursor-default'
                }`}
              >
                {selectable ? (
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-md transition-colors ${
                      isSelected
                        ? 'bg-cyan-500 text-white'
                        : 'bg-white shadow-[inset_0_0_0_1.5px_var(--slate-300,#cbd5e1)]'
                    }`}
                  >
                    {/* Tick scales in on select — tactile feedback, fast (~140ms)
                        so the checkbox feels instant. */}
                    <AnimatePresence initial={false}>
                      {isSelected && (
                        <motion.span
                          key="tick"
                          initial={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.6 }
                          }
                          animate={
                            reduceMotion
                              ? { opacity: 1 }
                              : { opacity: 1, scale: 1 }
                          }
                          exit={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.6 }
                          }
                          transition={{
                            duration: reduceMotion ? 0.08 : 0.14,
                            ease: PREP_EASE,
                          }}
                          style={{ display: 'inline-flex' }}
                        >
                          <CheckCircle2 size={12} strokeWidth={3} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                ) : it.committed ? (
                  <CheckCircle2
                    size={14}
                    strokeWidth={2.4}
                    className="text-emerald-600 mt-1 flex-shrink-0"
                  />
                ) : (
                  <KindIcon
                    size={14}
                    strokeWidth={2.2}
                    className="text-slate-500 mt-1 flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-body text-ink-strong leading-snug flex-1 min-w-[200px]">
                      <span className="font-bold">{it.label}</span>
                      <span className="text-ink-muted"> · {it.timing}</span>
                    </p>
                    <div className="flex flex-row flex-wrap items-center justify-end gap-1.5 flex-shrink-0">
                      {it.orderIntent && (
                        <OrderIntentChip intent={it.orderIntent} />
                      )}
                      {it.committed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-micro font-bold uppercase tracking-caps text-emerald-700 shadow-[inset_0_0_0_1px_var(--emerald-200,#a7f3d0)] whitespace-nowrap">
                          <CheckCircle2 size={10} strokeWidth={2.8} />
                          Запрошено
                        </span>
                      ) : showSecondaryChip ? (
                        kind === 'lab' ? (
                          <TestOrderIntentTag intent={it.intent} />
                        ) : (
                          <OrderKindTag kind={kind} />
                        )
                      ) : null}
                    </div>
                  </div>
                  <p className="text-caption text-ink-muted mt-1.5 leading-snug">
                    {it.rationale}
                  </p>
                  {it.prep && (
                    <p className="text-caption text-slate-600 leading-snug mt-1.5">
                      <span className="font-bold text-ink-strong">
                        Подготовка:
                      </span>{' '}
                      {it.prep}
                    </p>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {/* Composer expand: height + opacity so the form reveals from the
          «+ Добавить назначение» button position. Spatial continuity — the
          composer rises from the affordance that opened it. */}
      <AnimatePresence initial={false}>
        {composerOpen && (
          <motion.div
            key="composer"
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }
            }
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }
            }
            transition={{
              duration: reduceMotion ? 0.12 : PREP_DURATION,
              ease: PREP_EASE,
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1.5px_var(--cyan-200,#a5f3fc)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption font-bold uppercase tracking-caps text-ink-strong">
              Новое назначение
            </p>
            <button
              type="button"
              onClick={closeComposer}
              aria-label="Отмена"
              className="rounded-md p-1 text-ink-muted hover:bg-slate-100"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
              Клиническое намерение
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ORDER_INTENT_VALUES.map((v) => {
                const active = draftIntent === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDraftIntent(v)}
                    aria-pressed={active}
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-micro font-bold uppercase tracking-caps transition-colors ${
                      active
                        ? 'bg-cyan-500 text-white'
                        : 'bg-surface-sunken text-ink-muted hover:bg-slate-100'
                    }`}
                  >
                    {ORDER_INTENT_LABEL[v]}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
              Тип заказа
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(['lab', 'instrumental', 'referral', 'self-monitor'] as OrderKind[]).map(
                (k) => {
                  const active = draftKind === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDraftKind(k)}
                      aria-pressed={active}
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-micro font-bold uppercase tracking-caps transition-colors ${
                        active
                          ? 'bg-cyan-500 text-white'
                          : 'bg-surface-sunken text-ink-muted hover:bg-slate-100'
                      }`}
                    >
                      {ORDER_KIND_LABEL[k]}
                    </button>
                  )
                },
              )}
            </div>
          </div>
          <input
            type="text"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="Название — например, «УЗИ органов брюшной полости»"
            className="rounded-lg bg-surface-sunken px-3 py-2 text-body text-ink-strong placeholder:text-ink-muted/70 outline-none focus:bg-white focus:shadow-[inset_0_0_0_1.5px_var(--cyan-300,#67e8f9)] transition-colors"
            autoFocus
          />
          <input
            type="text"
            value={draftPrep}
            onChange={(e) => setDraftPrep(e.target.value)}
            placeholder="Подготовка для пациента — необязательно"
            className="rounded-lg bg-surface-sunken px-3 py-2 text-caption text-ink-strong placeholder:text-ink-muted/70 outline-none focus:bg-white focus:shadow-[inset_0_0_0_1.5px_var(--cyan-300,#67e8f9)] transition-colors"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeComposer}
              className="inline-flex items-center rounded-lg px-3 py-1.5 text-caption font-bold text-ink-muted hover:bg-slate-100 transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submitComposer}
              disabled={draftLabel.trim().length === 0}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-caption font-bold transition-colors ${
                draftLabel.trim().length === 0
                  ? 'bg-slate-100 text-ink-muted cursor-not-allowed'
                  : 'bg-cyan-500 text-white hover:bg-cyan-600'
              }`}
            >
              <Plus size={13} strokeWidth={2.6} />
              Добавить
            </button>
          </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {(hasCanSend || canAdd) && (
        <div className="flex items-center justify-between gap-3 pt-1">
          {canAdd && !composerOpen ? (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-caption font-bold text-cyan-700 shadow-[inset_0_0_0_1px_var(--cyan-200,#a5f3fc)] hover:bg-cyan-50 transition-colors"
            >
              <Plus size={13} strokeWidth={2.6} />
              Добавить назначение
            </button>
          ) : (
            <span />
          )}
          {hasCanSend && (
            <div className="flex items-center gap-2">
              {showBulkToggle && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="inline-flex items-center rounded-lg px-2 py-1 text-caption font-bold text-cyan-600 hover:bg-cyan-50 transition-colors"
                >
                  {allPendingSelected ? 'Снять выбор' : 'Выбрать все'}
                </button>
              )}
              <button
                type="button"
                onClick={send}
                disabled={liveSelected.size === 0}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-caption font-bold transition-colors ${
                  liveSelected.size === 0
                    ? 'bg-slate-100 text-ink-muted cursor-not-allowed'
                    : 'bg-cyan-500 text-white hover:bg-cyan-600'
                }`}
              >
                <Send size={13} strokeWidth={2.4} />
                Отправить пациенту
                {liveSelected.size > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white/20 px-1.5 text-micro font-bold tabular-nums">
                    {liveSelected.size}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
      {dispatched.length > 0 && (
        <div className="flex flex-col gap-2 pt-3 mt-1 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-micro font-bold uppercase tracking-caps text-ink-muted">
              Что уже запрошено
              {unseenUploads > 0 && (
                <span
                  className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cyan-500 px-1.5 text-micro font-bold text-white tabular-nums"
                  aria-label={`${unseenUploads} новых ответов от пациента`}
                >
                  {unseenUploads}
                </span>
              )}
            </p>
            <span className="text-caption text-ink-muted font-data">
              {dispatched.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {dispatched.map((d) => {
              const KindIcon = orderKindIcon(d.kind)
              return (
                <li
                  key={d.id}
                  className="rounded-xl bg-surface-sunken px-3 py-2.5 flex items-start gap-3"
                >
                  <KindIcon
                    size={13}
                    strokeWidth={2.2}
                    className="text-slate-500 mt-1 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-caption text-ink-strong leading-snug flex-1 min-w-[160px]">
                        <span className="font-bold">{d.label}</span>
                      </p>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {d.intent && <OrderIntentChip intent={d.intent} />}
                        <PlanStatusChip status={d.status} />
                      </div>
                    </div>
                    <p className="text-micro text-ink-muted font-data mt-1">
                      {formatDateTime(d.requestedAt)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </BlockShell>
  )
}

// ─── «Повестка визита · подготовил Василий» ─────────────────────────────────

/**
 * Consolidated pre-visit agenda. Replaces the older `VisitGapsBlock` +
 * `VasilyObservationsBlock` pair: gaps and Vasily's signal connections live
 * in a single ranked list where matched observations attach as per-item
 * `rationale` and standalone observations appear as their own items.
 *
 * Voice: observation, not imperative — labels read «X — не сдан», not
 * «Сдать X». Authorship is named in the sub-eyebrow («подготовил Василий»),
 * so the doctor can calibrate trust without the list being framed as an
 * order. Per-item source badges (`ПО ПЛАНУ`, `OCR ↓ УВЕРЕННОСТЬ`, `ИЗ ЖАЛОБ
 * ПАЦИЕНТА`, etc.) make the fact-vs-interpretation line legible inline.
 *
 * Closes JTBD #1–#7 of the «Повестка визита» block in one render: short
 * ranked list, per-item reasoning, trust calibration, cross-source links,
 * plan-adherence memory, grounded conversation openers, non-prescriptive tone.
 */
export interface RequestAnalysisPayload {
  /** Plan-backed re-request when present; absent for fresh requests built from a `data-gap` synthesis item. */
  planItemId?: string
  analysisType: AnalysisType
  label: string
  reason: string
  /** Source agenda item id — surfaced for analytics / scroll cues. */
  agendaItemId: string
}

export function VisitAgendaBlock({
  items,
  onRequestAnalysis,
}: {
  items: AgendaItem[]
  /**
   * When provided, items with `requestable` render a «Запросить анализ» chip
   * that fires this callback. Caller is expected to issue the request to
   * the patient immediately (no composer round-trip). After the request
   * lands in state, the agenda item flips to a «✓ Запрос отправлен» pill
   * because `requestable.lastRequestedAt` is now set.
   */
  onRequestAnalysis?: (req: RequestAnalysisPayload) => void
}) {
  const reduceMotion = useReducedMotion()
  if (items.length === 0) {
    return (
      <BlockShell
        tone="vasily"
        eyebrow="Дополнительные рекомендации Василия"
        hint="подготовил Василий"
        leading={<VasilyMascot size={56} />}
      >
        <div className="rounded-2xl bg-emerald-50/70 px-4 py-3 inline-flex items-center gap-2 text-emerald-800">
          <CheckCircle2 size={14} strokeWidth={2.4} />
          <span className="text-body font-medium">
            Пробелов не выявлено · подготовка полная
          </span>
        </div>
      </BlockShell>
    )
  }
  return (
    <BlockShell
      tone="vasily"
      eyebrow="Дополнительные рекомендации Василия"
      hint={`подготовил Василий · ${items.length} ${pluralPunktAgenda(items.length)}`}
      leading={<VasilyMascot size={56} />}
    >
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const canRequest = !!(it.requestable && onRequestAnalysis)
          return (
            <li
              key={it.id}
              className="flex items-start rounded-2xl bg-cyan-50/40 px-4 py-3 min-h-[64px]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="text-body text-ink-strong leading-snug flex-1 min-w-[200px]">
                    {it.label}
                  </p>
                  <div className="flex flex-wrap gap-1 flex-shrink-0">
                    {it.sources.map((s) => (
                      <AgendaSourceTag key={s} source={s} />
                    ))}
                  </div>
                </div>
                {it.rationale && (
                  <p className="text-caption text-cyan-900/70 mt-1.5 leading-snug">
                    {it.rationale}
                  </p>
                )}
                {it.requestable && (
                  <div className="mt-2">
                    {/* Action ↔ confirmation swap: when the doctor sends the
                        request, the cyan button gives way to an emerald
                        «Запрос отправлен» pill. Cross-fade so the verdict
                        change registers without a hard pop. */}
                    <AnimatePresence mode="wait" initial={false}>
                      {it.requestable.lastRequestedAt ? (
                        <motion.span
                          key="sent"
                          initial={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.96 }
                          }
                          animate={
                            reduceMotion
                              ? { opacity: 1 }
                              : { opacity: 1, scale: 1 }
                          }
                          exit={
                            reduceMotion ? { opacity: 0 } : { opacity: 0 }
                          }
                          transition={{
                            duration: reduceMotion ? 0.12 : PREP_DURATION,
                            ease: PREP_EASE,
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-caption font-bold text-emerald-700 shadow-[inset_0_0_0_1px_var(--emerald-200,#a7f3d0)]"
                        >
                          <CheckCircle2 size={12} strokeWidth={2.6} />
                          Запрос отправлен пациенту
                        </motion.span>
                      ) : canRequest ? (
                        <motion.button
                          key="send"
                          type="button"
                          initial={
                            reduceMotion ? { opacity: 0 } : { opacity: 0 }
                          }
                          animate={
                            reduceMotion ? { opacity: 1 } : { opacity: 1 }
                          }
                          exit={
                            reduceMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.98 }
                          }
                          transition={{
                            duration: reduceMotion ? 0.12 : 0.18,
                            ease: PREP_EASE,
                          }}
                          onClick={() =>
                            onRequestAnalysis!({
                              planItemId: it.requestable!.planItemId,
                              analysisType: it.requestable!.analysisType,
                              label: it.requestable!.label,
                              reason: it.requestable!.reason,
                              agendaItemId: it.id,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-3 py-1 text-caption font-bold text-white hover:bg-cyan-600 transition-colors"
                        >
                          <Send size={12} strokeWidth={2.6} />
                          {it.requestable!.planItemId
                            ? 'Запросить анализ'
                            : 'Запросить у пациента'}
                        </motion.button>
                      ) : null}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-caption text-ink-muted leading-snug mt-1">
        Это не заменяет консультацию врача — Василий помогает связать сигналы,
        но не предлагает диагноз или лечение.
      </p>
    </BlockShell>
  )
}

const AGENDA_SOURCE_LABEL: Record<AgendaSource, string> = {
  'plan-overdue': 'По плану · просрочено',
  'plan-pending': 'По плану',
  'ocr-low-conf': 'OCR ↓ уверенность',
  'doc-unstructured': 'Документ без структуры',
  'patient-question': 'Из жалоб пациента',
  'lab-out-of-range': 'Вне нормы',
  'lab-target-gap': 'Разрыв с целевым',
  'data-gap': 'Пробел в данных',
  'emotional-signal': 'Эмоциональный сигнал',
}

const AGENDA_SOURCE_TONE: Record<AgendaSource, string> = {
  'plan-overdue':
    'bg-white text-amber-800 shadow-[inset_0_0_0_1px_var(--amber-300,#fcd34d)]',
  'plan-pending':
    'bg-white text-amber-700 shadow-[inset_0_0_0_1px_var(--amber-200,#fde68a)]',
  'ocr-low-conf':
    'bg-white text-amber-700 shadow-[inset_0_0_0_1px_var(--amber-200,#fde68a)]',
  'doc-unstructured':
    'bg-white text-ink-muted shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)]',
  'patient-question':
    'bg-white text-cyan-700 shadow-[inset_0_0_0_1px_var(--cyan-200,#a5f3fc)]',
  'lab-out-of-range':
    'bg-white text-rose-700 shadow-[inset_0_0_0_1px_var(--rose-200,#fecdd3)]',
  'lab-target-gap':
    'bg-white text-rose-700 shadow-[inset_0_0_0_1px_var(--rose-200,#fecdd3)]',
  'data-gap':
    'bg-white text-cyan-800 shadow-[inset_0_0_0_1px_var(--cyan-300,#67e8f9)]',
  'emotional-signal':
    'bg-white text-violet-700 shadow-[inset_0_0_0_1px_var(--violet-200,#ddd6fe)]',
}

function AgendaSourceTag({ source }: { source: AgendaSource }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-caps whitespace-nowrap ${AGENDA_SOURCE_TONE[source]}`}
    >
      {AGENDA_SOURCE_LABEL[source]}
    </span>
  )
}

function pluralPunktAgenda(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'пунктов'
  if (mod10 === 1) return 'пункт'
  if (mod10 >= 2 && mod10 <= 4) return 'пункта'
  return 'пунктов'
}

// ─── «Запись на приём» — closing handoff at the bottom of the prep brief ────

/**
 * The Overview brief ends with a forced decision: when do we see this patient
 * again, and what carries over into prep? The block is a *proposal* surface,
 * not a scheduler — the doctor picks an interval and a destination (patient
 * or регистратура), but never a slot. The slot is the patient's job.
 *
 * Inputs are derived in `PatientRecord` from the same prep signals the rest
 * of the brief reads (out-of-range labs, worsening trends, open recheck
 * orders, unresolved plan items), so the suggestion is grounded, not novel.
 */

export type NextVisitInterval = '1m' | '3m' | '6m' | '12m'

export type NextVisitPriority = 'must' | 'nice'

export interface NextVisitCarryover {
  id: string
  label: string
  reason: string
  /**
   * Adherence priority for the patient app. AI proposes; doctor can flip
   * inline. «обязательно» items drive nag-level reminders, «желательно»
   * items show up but won't escalate.
   */
  priority?: NextVisitPriority
}

export interface NextVisitSuggestion {
  /** Recommended interval, default-selected on the chip row. */
  interval: NextVisitInterval
  /** One-line rationale shown under the chips. Plain doctor-speak. */
  rationale: string
  /** Items that should land in the next visit's prep checklist. */
  carryover: NextVisitCarryover[]
}

const NEXT_VISIT_INTERVAL_LABEL: Record<NextVisitInterval, string> = {
  '1m': 'через 1 месяц',
  '3m': 'через 3 месяца',
  '6m': 'через 6 месяцев',
  '12m': 'через 1 год',
}

const NEXT_VISIT_INTERVALS: NextVisitInterval[] = ['1m', '3m', '6m', '12m']

/**
 * Picker catalog used by the «+ Добавить пункт» affordance.
 * The doctor doesn't author free text — they pick a clinical action; system
 * fills the patient-facing reason and default priority. Timing wording is
 * generated downstream from the chosen interval (see N8 — not doctor work).
 */
interface NextVisitCatalogItem {
  /** Stable suffix used to build a unique row id when added. */
  key: string
  label: string
  defaultReason: string
}

interface NextVisitCatalogGroup {
  category: string
  items: NextVisitCatalogItem[]
}

const NEXT_VISIT_CATALOG: NextVisitCatalogGroup[] = [
  {
    category: 'Анализы',
    items: [
      { key: 'hba1c', label: 'HbA1c (гликированный гемоглобин)', defaultReason: 'Средний уровень сахара за 3 месяца.' },
      { key: 'glucose-fasting', label: 'Глюкоза крови натощак', defaultReason: 'Текущий уровень перед визитом.' },
      { key: 'creatinine', label: 'Креатинин', defaultReason: 'Лабораторная оценка работы почек.' },
      { key: 'cholesterol', label: 'Холестерин общий', defaultReason: 'Контроль липидного профиля.' },
      { key: 'tsh', label: 'ТТГ (щитовидная железа)', defaultReason: 'Проверка работы щитовидной железы.' },
      { key: 'ferritin', label: 'Ферритин', defaultReason: 'Запасы железа в организме.' },
      { key: 'vit-d', label: 'Витамин D (25-OH)', defaultReason: 'Уровень витамина D в крови.' },
      { key: 'microalbumin', label: 'Микроальбумин в моче (белок)', defaultReason: 'Проверка работы почек при диабете.' },
    ],
  },
  {
    category: 'Консультации',
    items: [
      { key: 'ophth', label: 'Офтальмолог', defaultReason: 'Проверка зрения и сетчатки при диабете.' },
      { key: 'nephro', label: 'Нефролог', defaultReason: 'Консультация по работе почек.' },
      { key: 'cardio', label: 'Кардиолог', defaultReason: 'Оценка сердечно-сосудистого риска.' },
      { key: 'neuro', label: 'Невролог', defaultReason: 'Проверка чувствительности нервов при диабете.' },
      { key: 'podiatr', label: 'Кабинет диабетической стопы', defaultReason: 'Осмотр стоп и профилактика осложнений.' },
    ],
  },
  {
    category: 'Самонаблюдение',
    items: [
      { key: 'bp-diary', label: 'Дневник давления', defaultReason: 'Как меняется давление между визитами.' },
      { key: 'glucose-diary', label: 'Дневник глюкозы', defaultReason: 'Уровень сахара между визитами.' },
      { key: 'weight-diary', label: 'Дневник веса', defaultReason: 'Динамика массы тела.' },
    ],
  },
  {
    category: 'Документы',
    items: [
      { key: 'doc-extract', label: 'Выписка от другого врача', defaultReason: 'Контекст наблюдения вне Эндокор.' },
      { key: 'doc-imaging', label: 'Копия снимка или УЗИ', defaultReason: 'Сравнение с предыдущим исследованием.' },
    ],
  },
]

export function NextVisitBlock({
  suggestion,
  onProposeToPatient,
  onSendToRegistry,
}: {
  suggestion: NextVisitSuggestion
  onProposeToPatient?: (interval: NextVisitInterval) => void
  onSendToRegistry?: (interval: NextVisitInterval) => void
}) {
  const reduceMotion = useReducedMotion()
  const [interval, setIntervalKey] = useState<NextVisitInterval>(
    suggestion.interval,
  )
  // Per-item priority overrides — doctor flips AI's suggestion inline.
  // Map id → priority. Items not in the map fall back to suggestion default.
  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, NextVisitPriority>
  >({})
  // Items the doctor removed. Reversible via «вернуть» on the same row.
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set())
  // Items the doctor added via the «+ Добавить пункт» picker. Same shape as
  // suggestion.carryover, rendered in the same list so the row UX is uniform
  // (priority toggle, remove, restore) without branching.
  const [addedItems, setAddedItems] = useState<NextVisitCarryover[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  // Monotonic counter for unique ids on added rows.
  const addCounterRef = useRef(0)
  // Per-destination send state. Both can fire independently — patient surface
  // and регистратура are parallel channels, not alternatives.
  const [sentAtPatient, setSentAtPatient] = useState<Date | null>(null)
  const [sentAtRegistry, setSentAtRegistry] = useState<Date | null>(null)

  const priorityOf = (c: NextVisitCarryover): NextVisitPriority =>
    priorityOverrides[c.id] ?? c.priority ?? 'must'

  const allItems = useMemo(
    () => [...suggestion.carryover, ...addedItems],
    [suggestion.carryover, addedItems],
  )

  function addCatalogItem(item: NextVisitCatalogItem) {
    addCounterRef.current += 1
    const id = `added-${item.key}-${addCounterRef.current}`
    setAddedItems((prev) => [
      ...prev,
      {
        id,
        label: item.label,
        reason: item.defaultReason,
        priority: 'nice',
      },
    ])
    setPickerOpen(false)
  }

  const togglePriority = (id: string, current: NextVisitPriority) => {
    setPriorityOverrides((prev) => ({
      ...prev,
      [id]: current === 'must' ? 'nice' : 'must',
    }))
  }

  const toggleRemoved = (id: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <BlockShell
      tone="blue"
      eyebrow="Следующий визит"
      eyebrowIcon={<CalendarCheck size={14} strokeWidth={2.4} />}
      hint="Задайте интервал до следующего визита и отметьте, что включить в подготовку."
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-caption font-bold uppercase tracking-caps text-ink-muted mb-2">
            Рекомендованный интервал
          </p>
          <div className="flex flex-wrap gap-2">
            {NEXT_VISIT_INTERVALS.map((k) => {
              const active = interval === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setIntervalKey(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-bold transition-colors ${
                    active
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white text-ink shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)] hover:bg-slate-50'
                  }`}
                >
                  {NEXT_VISIT_INTERVAL_LABEL[k]}
                </button>
              )
            })}
          </div>
          <p className="text-caption text-cyan-900/70 mt-2 leading-snug">
            <span className="font-bold uppercase tracking-caps text-cyan-700 mr-1.5">
              По данным визита
            </span>
            {suggestion.rationale}
          </p>
        </div>

        <div>
          <p className="text-caption font-bold uppercase tracking-caps text-ink-muted mb-2">
            В подготовку к следующему визиту
          </p>
          {allItems.length > 0 && (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
              {allItems.map((c) => {
                const removed = removedIds.has(c.id)
                const priority = priorityOf(c)
                return (
                  <motion.li
                    key={c.id}
                    layout={reduceMotion ? false : 'position'}
                    initial={
                      reduceMotion ? false : { opacity: 0, y: -4, height: 0 }
                    }
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : { opacity: 1, y: 0, height: 'auto' }
                    }
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, height: 0 }
                    }
                    transition={{
                      duration: reduceMotion ? 0.12 : PREP_DURATION,
                      ease: PREP_EASE,
                    }}
                    style={{ overflow: 'hidden' }}
                    className={`flex items-start gap-3 rounded-2xl px-4 py-3 transition-opacity ${
                      removed
                        ? 'bg-slate-50/60 opacity-60'
                        : 'bg-cyan-50/40'
                    }`}
                  >
                    <ArrowRight
                      size={14}
                      strokeWidth={2.2}
                      className={`mt-1 flex-shrink-0 ${
                        removed ? 'text-slate-400' : 'text-cyan-600'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-body leading-snug ${
                            removed
                              ? 'text-ink-muted line-through decoration-slate-300'
                              : 'text-ink-strong'
                          }`}
                        >
                          {c.label}
                        </p>
                        {!removed && (
                          <button
                            type="button"
                            onClick={() => togglePriority(c.id, priority)}
                            title={
                              priority === 'must'
                                ? 'Перевести в «желательно»'
                                : 'Перевести в «обязательно»'
                            }
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-caps transition-colors ${
                              priority === 'must'
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'bg-white text-ink-muted shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)] hover:bg-slate-50'
                            }`}
                          >
                            {priority === 'must' ? 'обязательно' : 'желательно'}
                          </button>
                        )}
                      </div>
                      <p
                        className={`text-caption mt-1 leading-snug ${
                          removed ? 'text-ink-muted' : 'text-cyan-900/70'
                        }`}
                      >
                        {removed ? 'Убрано из подготовки.' : c.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRemoved(c.id)}
                      title={removed ? 'Вернуть в подготовку' : 'Убрать из подготовки'}
                      className={`mt-0.5 flex-shrink-0 inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${
                        removed
                          ? 'text-cyan-700 hover:bg-cyan-100'
                          : 'text-ink-muted hover:bg-slate-100 hover:text-ink'
                      }`}
                    >
                      {removed ? (
                        <RotateCcw size={14} strokeWidth={2.2} />
                      ) : (
                        <X size={14} strokeWidth={2.2} />
                      )}
                    </button>
                  </motion.li>
                )
              })}
              </AnimatePresence>
            </ul>
          )}

          <div className="mt-2">
            {/* Picker swap: «+ Добавить пункт» ↔ picker panel. AnimatePresence
                wait mode so the button fully fades out before the panel rises,
                preventing a layout fight. */}
            {!pickerOpen ? (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-caption font-bold text-cyan-700 shadow-[inset_0_0_0_1px_var(--cyan-200,#a5f3fc)] hover:bg-cyan-50 transition-colors"
              >
                <Plus size={12} strokeWidth={2.6} />
                Добавить пункт
              </button>
            ) : (
              <motion.div
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, height: 0 }
                }
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, height: 'auto' }
                }
                transition={{
                  duration: reduceMotion ? 0.12 : PREP_DURATION,
                  ease: PREP_EASE,
                }}
                style={{ overflow: 'hidden' }}
              >
              <div className="rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)] flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-caption font-bold uppercase tracking-caps text-ink-muted">
                    Что добавить
                  </p>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    aria-label="Закрыть"
                    className="inline-flex items-center justify-center rounded-full p-1 text-ink-muted hover:bg-slate-100 hover:text-ink transition-colors"
                  >
                    <X size={14} strokeWidth={2.2} />
                  </button>
                </div>
                {NEXT_VISIT_CATALOG.map((group) => (
                  <div key={group.category} className="flex flex-col gap-1.5">
                    <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
                      {group.category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => addCatalogItem(item)}
                          className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-caption text-cyan-900 hover:bg-cyan-100 transition-colors"
                        >
                          <Plus size={11} strokeWidth={2.4} className="text-cyan-600" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {sentAtPatient ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-caption font-bold text-emerald-700 shadow-[inset_0_0_0_1px_var(--emerald-200,#a7f3d0)]">
              <CheckCircle2 size={12} strokeWidth={2.6} />
              Отправлено пациенту · сегодня, {formatHM(sentAtPatient)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onProposeToPatient?.(interval)
                setSentAtPatient(new Date())
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-3 py-1.5 text-caption font-bold text-white hover:bg-cyan-600 transition-colors"
            >
              <Send size={12} strokeWidth={2.6} />
              Предложить пациенту
            </button>
          )}
          {sentAtRegistry ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-caption font-bold text-emerald-700 shadow-[inset_0_0_0_1px_var(--emerald-200,#a7f3d0)]">
              <CheckCircle2 size={12} strokeWidth={2.6} />
              Передано в регистратуру · сегодня, {formatHM(sentAtRegistry)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSendToRegistry?.(interval)
                setSentAtRegistry(new Date())
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-caption font-bold text-ink hover:bg-slate-50 shadow-[inset_0_0_0_1px_var(--slate-200,#e2e8f0)] transition-colors"
            >
              Передать в регистратуру Эндокор
            </button>
          )}
        </div>

        <p className="text-caption text-ink-muted leading-snug">
          Точную дату выберет пациент или регистратура Эндокор. Врач задаёт только интервал и состав подготовки.
        </p>
      </div>
    </BlockShell>
  )
}

// ─── «Запись на приём» — мониторинг ближайшего основного приёма ─────────────
//
// Always-on monitoring block at the tail of Overview. Pure read surface for
// the doctor: «когда встреча» + «готов ли пациент к ней». The only verb is
// «Уточнить запросом» when the patient isn't ready — and only then, because
// otherwise it competes with the calmer next-visit planning above.

export function AppointmentMonitorBlock({
  mainAppointment,
  prepReady,
  prepBuckets,
}: {
  mainAppointment: Appointment | null
  prepReady: boolean
  prepBuckets: { done: number; total: number }
}) {
  const completed = mainAppointment?.status === 'completed'
  const isPast =
    !!mainAppointment &&
    new Date(mainAppointment.date).getTime() < Date.now()
  const booked = !!mainAppointment && !completed && !isPast
  const overdue = !!mainAppointment && !completed && isPast

  return (
    <BlockShell
      tone="default"
      eyebrow="Запись на приём"
      eyebrowIcon={<CalendarClock size={14} strokeWidth={2.4} />}
      hint="Ближайший приём и готовность пациента."
    >
      <div className="flex flex-col gap-4">
        {booked && mainAppointment ? (
          <div className="rounded-2xl bg-surface-sunken p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-h2-ui font-bold text-ink-strong leading-tight font-data">
                {formatDateTime(mainAppointment.date)}
              </p>
              <p className="text-caption text-ink-muted mt-1">
                {formatAppointmentLead(mainAppointment.date)} · Эндокор
              </p>
            </div>
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-caption font-bold text-cyan-700">
              <CheckCircle2 size={13} strokeWidth={2.4} />
              Запись активна
            </span>
          </div>
        ) : overdue && mainAppointment ? (
          <div className="rounded-2xl bg-surface-sunken p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-h2-ui font-bold text-ink-strong leading-tight font-data">
                {formatDateTime(mainAppointment.date)}
              </p>
              <p className="text-caption text-ink-muted mt-1">
                {formatAppointmentLead(mainAppointment.date)} · Эндокор
              </p>
            </div>
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-caption font-bold text-amber-700 shadow-[inset_0_0_0_1px_var(--amber-200,#fde68a)]">
              <AlertCircle size={13} strokeWidth={2.4} />
              Прошла без отметки
            </span>
          </div>
        ) : completed && mainAppointment ? (
          <div className="rounded-2xl bg-surface-sunken p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-h2-ui font-bold text-ink-strong leading-tight font-data">
                {formatDateTime(mainAppointment.date)}
              </p>
              <p className="text-caption text-ink-muted mt-1">
                Приём завершён
              </p>
            </div>
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-caption font-bold text-slate-600">
              <CheckCircle2 size={13} strokeWidth={2.4} />
              Завершён
            </span>
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-50 p-4 flex items-start gap-3">
            <div className="h-7 w-7 flex-shrink-0 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertCircle size={16} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-body font-bold text-ink-strong leading-tight">
                Запись пока не выбрана
              </p>
              <p className="text-caption text-ink-muted mt-1 leading-snug">
                Слот выбирает пациент. Если запись затягивается, можно отправить
                ему запрос.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--slate-100)] flex items-center gap-3">
          <div
            className={`h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center ${
              prepReady
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {prepReady ? (
              <CheckCircle2 size={16} strokeWidth={2.4} />
            ) : (
              <AlertCircle size={16} strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body font-bold text-ink-strong leading-tight">
              {prepReady
                ? 'Пациент готов к приёму'
                : 'Подготовка не завершена'}
            </p>
            <p className="text-caption text-ink-muted mt-0.5 font-data">
              {prepBuckets.done} из {prepBuckets.total} пунктов подготовки
            </p>
          </div>
        </div>
      </div>
    </BlockShell>
  )
}

function formatHM(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

// ─── Shared shell ────────────────────────────────────────────────────────────

type BlockTone = 'default' | 'amber' | 'rose' | 'blue' | 'slate' | 'vasily'

const TONE_STYLES: Record<
  BlockTone,
  {
    /** Icon chip background + foreground. */
    chip: string
    /** Eyebrow label color. */
    eyebrow: string
    /** Counter pill background + foreground. */
    counter: string
    /** Left accent rail color. */
    rail: string
  }
> = {
  default: {
    chip: 'bg-slate-100 text-ink-muted',
    eyebrow: 'text-ink-muted',
    counter: 'bg-slate-100 text-ink-muted',
    rail: 'bg-slate-200',
  },
  amber: {
    chip: 'bg-amber-100 text-amber-700',
    eyebrow: 'text-amber-800',
    counter: 'bg-amber-100 text-amber-700',
    rail: 'bg-amber-300',
  },
  rose: {
    chip: 'bg-rose-100 text-rose-700',
    eyebrow: 'text-rose-800',
    counter: 'bg-rose-100 text-rose-700',
    rail: 'bg-rose-300',
  },
  blue: {
    chip: 'bg-cyan-100 text-cyan-700',
    eyebrow: 'text-cyan-800',
    counter: 'bg-cyan-100 text-cyan-700',
    rail: 'bg-cyan-300',
  },
  slate: {
    chip: 'bg-slate-100 text-slate-600',
    eyebrow: 'text-slate-700',
    counter: 'bg-slate-100 text-slate-600',
    rail: 'bg-slate-200',
  },
  vasily: {
    chip: 'bg-cyan-50 text-cyan-700',
    eyebrow: 'text-cyan-800',
    counter: 'bg-cyan-100 text-cyan-700',
    rail: 'bg-cyan-300',
  },
}

function BlockShell({
  id,
  eyebrow,
  eyebrowIcon,
  hint,
  action,
  counter,
  tone = 'default',
  leading,
  children,
}: {
  id?: string
  eyebrow: string
  eyebrowIcon?: React.ReactNode
  hint?: string
  action?: { label: string; onClick: () => void }
  /** Numeric counter rendered next to the eyebrow (e.g. number of gaps). */
  counter?: number
  /** Visual tone — drives chip, eyebrow, counter, and accent rail colors. */
  tone?: BlockTone
  /** Custom leading visual that replaces the icon chip (e.g. Vasily mascot). */
  leading?: React.ReactNode
  children: React.ReactNode
}) {
  const t = TONE_STYLES[tone]
  return (
    <section
      id={id}
      className="relative flex gap-4 rounded-2xl bg-surface p-5 shadow-[inset_0_0_0_1.5px_var(--slate-100)]"
    >
      <div
        aria-hidden
        className={`absolute left-0 top-5 bottom-5 w-1 rounded-r-full ${t.rail}`}
      />
      <div className="flex-shrink-0">
        {leading ?? (
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.chip}`}
          >
            {eyebrowIcon}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={`inline-flex items-center gap-1.5 text-caption font-bold uppercase tracking-caps ${t.eyebrow}`}
            >
              {eyebrow}
              {counter != null && counter > 0 && (
                <span
                  className={`ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-caption font-bold tabular-nums ${t.counter}`}
                >
                  {counter}
                </span>
              )}
            </p>
            {hint && (
              <p className="text-caption text-ink-muted leading-snug mt-1">
                {hint}
              </p>
            )}
          </div>
          {action && (
            <button
              onClick={action.onClick}
              className="flex-shrink-0 text-caption font-bold text-cyan-600 hover:text-cyan-700"
            >
              {action.label}
            </button>
          )}
        </div>
        {children}
      </div>
    </section>
  )
}
