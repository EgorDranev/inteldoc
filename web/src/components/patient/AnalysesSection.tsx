import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  FlaskConical,
  Info,
  NotebookPen,
  Plus,
  ScanLine,
  Stethoscope,
  TrendingUp,
  Upload,
} from 'lucide-react'
import StatusBadge from '../primitives/StatusBadge'
import NotificationBanner from '../NotificationBanner'
import ChecklistSection from './ChecklistSection'
import type {
  Analysis,
  Appointment,
  OrderKind,
  PlanItem,
  PlanItemStatus,
  SectionStatus,
} from '../../store/types'
import { formatDateShort, pluralRu } from '../../lib/formatters'
import {
  findMatchingAnalysis,
} from '../../lib/analyses-match'
import { reuseAnalysisForPlanItem } from '../../store/actions'
import {
  KEY_METRIC_ORDER,
  readingsFromAnalysis,
  type MetricReading,
} from '../../store/doctorSelectors'
import { copy as ru } from '../../copy/ru'

const PLAN_STATUS_TONE: Record<PlanItemStatus, 'warning' | 'info' | 'success'> = {
  assigned: 'warning',
  uploaded: 'info',
  acknowledged: 'success',
}
const PLAN_STATUS_LABEL: Record<PlanItemStatus, string> = {
  assigned: ru.newAnalyses.status.toUpload,
  uploaded: ru.newAnalyses.status.inReview,
  acknowledged: ru.newAnalyses.status.accepted,
}

const ORDER_KIND_PATIENT_LABEL: Record<OrderKind, string> = {
  lab: 'Анализ',
  instrumental: 'Обследование',
  referral: 'Направление',
  'self-monitor': 'Самоконтроль',
}

/** Kinds where the patient action is to upload a result file (lab + УЗИ-style report). */
function isUploadableKind(kind: OrderKind): boolean {
  return kind === 'lab' || kind === 'instrumental'
}

/**
 * Patient-side status label for an assigned plan item — phrased per kind so
 * referrals and self-monitoring don't read as «К загрузке».
 */
function statusLabelFor(item: PlanItem): string {
  const kind: OrderKind = item.kind ?? 'lab'
  if (item.status === 'assigned' && !isUploadableKind(kind)) {
    return 'К выполнению'
  }
  return PLAN_STATUS_LABEL[item.status]
}

function planItemIcon(item: PlanItem) {
  if (item.status === 'acknowledged') return Check
  if (item.status === 'uploaded') return FileText
  const kind: OrderKind = item.kind ?? 'lab'
  switch (kind) {
    case 'instrumental':
      return ScanLine
    case 'referral':
      return Stethoscope
    case 'self-monitor':
      return NotebookPen
    case 'lab':
    default:
      return Upload
  }
}

interface AnalysesSectionProps {
  analyses: Analysis[]
  planItems: { assigned: PlanItem[]; uploaded: PlanItem[]; acknowledged: PlanItem[] }
  planMeta?: { doctorName?: string; sentLabel?: string } | null
  /** Roll-up status chip for the merged section. */
  status?: SectionStatus
  /** Upcoming appointment (if any) — drives the pre-visit hint banner. */
  appointment?: Appointment | null
  /** Working diagnosis label — drives which metric becomes the hero card. */
  diagnosisLabel?: string
}

// Map a working-diagnosis substring to the «hero» metric that the patient
// should see at the top of their archive. Order matters — first match wins.
const HERO_BY_DIAGNOSIS: Array<{ match: RegExp; field: string }> = [
  { match: /диабет/i, field: 'HbA1c' },
  { match: /щитов|тиреои/i, field: 'ТТГ' },
  { match: /холестер|атероскл|ишеми/i, field: 'Холестерин' },
  { match: /почк|нефро/i, field: 'Креатинин' },
]

function pickHeroField(
  diagnosisLabel: string | undefined,
  readings: MetricReading[],
): string {
  if (diagnosisLabel) {
    const hit = HERO_BY_DIAGNOSIS.find((m) => m.match.test(diagnosisLabel))
    if (hit) return hit.field
  }
  const present = new Set(readings.map((r) => r.field))
  for (const k of KEY_METRIC_ORDER) {
    if (present.has(k)) return k
  }
  return 'HbA1c'
}

/**
 * Coarse-grain relative-date label — «месяц назад» / «3 недели назад» /
 * «5 дней назад». Used on the hero card so an older reading reads as old
 * at a glance.
 */
function relativeAge(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const ms = now.getTime() - d.getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} ${pluralRu(days, ['день', 'дня', 'дней'])} назад`
  if (days < 30) {
    const w = Math.floor(days / 7)
    return `${w} ${pluralRu(w, ['неделю', 'недели', 'недель'])} назад`
  }
  if (days < 365) {
    const m = Math.floor(days / 30)
    return `${m} ${pluralRu(m, ['месяц', 'месяца', 'месяцев'])} назад`
  }
  const y = Math.floor(days / 365)
  return `${y} ${pluralRu(y, ['год', 'года', 'лет'])} назад`
}

type DueUrgency = 'overdue' | 'soon' | 'neutral'

/**
 * Days between two calendar days (rounded). Positive when `due` is in the
 * future. Used for both pre-visit window detection and due-date urgency.
 */
function daysUntil(iso: string, now: Date = new Date()): number {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  return Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000)
}

function dueUrgencyFor(item: PlanItem): DueUrgency {
  if (!item.dueDate) return 'neutral'
  if (item.status === 'uploaded' || item.status === 'acknowledged') return 'neutral'
  const days = daysUntil(item.dueDate)
  if (days < 0) return 'overdue'
  if (days <= 3) return 'soon'
  return 'neutral'
}

function dueLabelFor(item: PlanItem): string | null {
  if (!item.dueDate) return null
  const days = daysUntil(item.dueDate)
  if (item.status === 'uploaded' || item.status === 'acknowledged') {
    return ru.analyses.due.onDate(formatDateShort(item.dueDate))
  }
  if (days < 0) return ru.analyses.due.overdue
  if (days === 0) return ru.analyses.due.today
  if (days === 1) return ru.analyses.due.tomorrow
  if (days <= 6) return ru.analyses.due.inDays(days)
  return ru.analyses.due.onDate(formatDateShort(item.dueDate))
}

const PRE_VISIT_WINDOW_DAYS = 7

export default function AnalysesSection({
  analyses,
  planItems,
  planMeta,
  status,
  appointment,
  diagnosisLabel,
}: AnalysesSectionProps) {
  const nav = useNavigate()

  const prescribed = [...planItems.assigned, ...planItems.uploaded, ...planItems.acknowledged]
  const hasPlan = prescribed.length > 0
  const doneCount = planItems.uploaded.length + planItems.acknowledged.length
  const totalCount = prescribed.length

  // Flatten OCR readings across the patient's archive, then pick the hero
  // field for the bottom block. Hero is value-centric («HbA1c 6.8% + тренд»),
  // not document-centric — answers «что у меня сейчас», not «что я загрузил».
  const allReadings = useMemo(
    () => analyses.flatMap(readingsFromAnalysis),
    [analyses],
  )
  const heroField = useMemo(
    () => pickHeroField(diagnosisLabel, allReadings),
    [diagnosisLabel, allReadings],
  )
  const heroReadings = useMemo(
    () =>
      allReadings
        .filter((r) => r.field === heroField)
        .slice()
        .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1)),
    [allReadings, heroField],
  )
  const heroLatest =
    heroReadings.length > 0 ? heroReadings[heroReadings.length - 1] : null

  // Other recent records: exclude the analysis that the hero card already
  // surfaces, so the section doesn't feel duplicated. Show at most 2 here —
  // anything beyond reuses «+ N в истории» as a single bridge to /history.
  const OTHER_VISIBLE = 2
  const otherAnalyses = useMemo(
    () =>
      analyses
        .filter((a) => !heroLatest || a.id !== heroLatest.analysisId)
        .slice(0, OTHER_VISIBLE),
    [analyses, heroLatest],
  )
  const restCount = Math.max(
    0,
    analyses.length - (heroLatest ? 1 : 0) - otherAnalyses.length,
  )

  // Pre-visit hint (JTBD #2). Fires only когда приём ≤7 дней. Two variants:
  // — есть невыполненные → перечисляем «что донести»;
  // — всё загружено → success-confirm, чтобы пациент выдохнул.
  const preVisit = useMemo(() => {
    if (!appointment || appointment.status === 'completed') return null
    const days = daysUntil(appointment.date)
    if (days < 0 || days > PRE_VISIT_WINDOW_DAYS) return null
    if (!hasPlan) return null
    const dateLabel = formatDateShort(appointment.date)
    const pending = planItems.assigned
    if (pending.length === 0) {
      return { kind: 'ready' as const, dateLabel }
    }
    return {
      kind: 'pending' as const,
      dateLabel,
      labs: pending.map((p) => p.label).join(', '),
    }
  }, [appointment, hasPlan, planItems.assigned])

  const readiness = useMemo(() => {
    if (!hasPlan) return ru.analyses.readiness.noPlan(analyses.length)
    if (doneCount === 0) return ru.analyses.readiness.nothingDone(totalCount)
    if (doneCount < totalCount)
      return ru.analyses.readiness.partial(doneCount, totalCount)
    return ru.analyses.readiness.allDone
  }, [hasPlan, doneCount, totalCount, analyses.length])

  return (
    <ChecklistSection title={ru.analyses.sectionTitle} status={status}>
      {/* Top-of-section hint.
          — With a plan: one calm summary line («К приёму готово 2 из 3»).
          — Without a plan: notification-style instruction with two CTAs so the
            empty state still has a clear next step. */}
      {hasPlan ? (
        <div className="rounded-2xl bg-surface-sunken px-4 py-3">
          <p className="text-body text-ink-strong leading-snug">{readiness}</p>
        </div>
      ) : (
        <NotificationBanner
          type="info"
          title={ru.analyses.noPlanHint.title}
          body={
            analyses.length > 0
              ? ru.analyses.noPlanHint.bodyWithArchive(analyses.length)
              : ru.analyses.noPlanHint.bodyEmpty
          }
          cta={ru.analyses.noPlanHint.primary}
          onCta={() => nav('/patient/history')}
          secondaryCta={ru.analyses.noPlanHint.secondary}
          onSecondaryCta={() => nav('/patient/notifications')}
        />
      )}

      {/* ─── Block A: Prescribed by doctor ──────────────────────────────── */}
      {hasPlan && (
        <>
          <p className="text-micro font-bold uppercase tracking-caps text-ink-muted px-1 mt-1">
            {ru.analyses.prescribedHeading}
          </p>

          {preVisit && preVisit.kind === 'pending' && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                <CalendarClock size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-body font-bold text-amber-900 leading-snug">
                  {ru.analyses.preVisit.titleWithLabs(preVisit.dateLabel)}
                </p>
                <p className="text-caption text-amber-800 leading-snug mt-0.5">
                  {preVisit.labs}
                </p>
              </div>
            </div>
          )}

          {preVisit && preVisit.kind === 'ready' && (
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-body font-bold text-emerald-900 leading-snug">
                  {ru.analyses.preVisit.allReadyTitle(preVisit.dateLabel)}
                </p>
                <p className="text-caption text-emerald-800/90 leading-snug mt-0.5">
                  {ru.analyses.preVisit.allReadyHelp}
                </p>
              </div>
            </div>
          )}

          {planMeta && (planMeta.doctorName || planMeta.sentLabel) && (
            <div className="rounded-2xl bg-cyan-50 px-4 py-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-cyan-500 text-white flex items-center justify-center flex-shrink-0">
                <FileText size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-body font-bold text-cyan-700 leading-snug">
                  {ru.newAnalyses.bannerTitle}
                </p>
                <p className="text-caption text-cyan-700/80 leading-snug truncate">
                  {[planMeta.doctorName, planMeta.sentLabel]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          )}

          {prescribed.map((item) => {
            const kind: OrderKind = item.kind ?? 'lab'
            const uploadable = isUploadableKind(kind)
            const tone = PLAN_STATUS_TONE[item.status]
            const label = statusLabelFor(item)
            const Icon = planItemIcon(item)
            const onItemClick =
              item.status === 'assigned' && uploadable
                ? () => nav(`/patient/upload/${item.analysisType}`)
                : undefined
            // Lab-only: suggest reusing a recent matching analysis. Doesn't
            // apply to referrals / instrumental reports / self-monitoring.
            const match =
              item.status === 'assigned' && kind === 'lab'
                ? findMatchingAnalysis(item, analyses)
                : null
            const due = dueLabelFor(item)
            const urgency = dueUrgencyFor(item)
            const dueClass =
              urgency === 'overdue'
                ? 'text-amber-700 font-bold'
                : urgency === 'soon'
                  ? 'text-amber-700'
                  : 'text-ink-muted'
            const showKindTag = kind !== 'lab'

            return (
              <div key={item.id} className="flex flex-col gap-1.5">
                <button
                  onClick={onItemClick}
                  disabled={!onItemClick}
                  className="rounded-2xl bg-white p-4 flex items-start gap-3 text-left disabled:cursor-default hover:bg-slate-50 transition-colors"
                >
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      item.status === 'acknowledged'
                        ? 'bg-success-bg text-emerald-600'
                        : 'bg-cyan-50 text-cyan-500'
                    }`}
                  >
                    <Icon size={20} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {showKindTag && (
                      <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-1">
                        {ORDER_KIND_PATIENT_LABEL[kind]}
                      </p>
                    )}
                    <p className="text-body-lg font-bold text-ink-strong leading-snug">
                      {item.label}
                    </p>
                    {item.reason && (
                      <p className="text-caption text-ink-muted leading-snug mt-0.5 line-clamp-2">
                        {item.reason}
                      </p>
                    )}
                    {item.prep && item.status !== 'acknowledged' && (
                      <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg bg-cyan-50/70 px-2 py-1 text-caption text-cyan-900/90">
                        <Info
                          size={12}
                          strokeWidth={2.4}
                          className="text-cyan-600 mt-0.5 flex-shrink-0"
                        />
                        <span className="leading-snug">{item.prep}</span>
                      </p>
                    )}
                    {due && (
                      <p className={`text-caption leading-snug mt-1 ${dueClass}`}>
                        {due}
                      </p>
                    )}
                  </div>
                  <StatusBadge tone={tone}>{label}</StatusBadge>
                </button>

                {match && (
                  <div className="ml-13 rounded-xl bg-emerald-50/70 px-3 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-caption text-emerald-700 leading-snug">
                        {ru.analyses.reuseSuggestion}
                      </p>
                      <p className="text-body font-bold text-emerald-900 leading-snug truncate">
                        {match.label} ·{' '}
                        {formatDateShort(match.date || match.uploadedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => reuseAnalysisForPlanItem(item.id, match.id)}
                      className="rounded-full bg-emerald-600 text-white text-caption font-bold uppercase tracking-caps px-3 py-1.5 flex-shrink-0"
                    >
                      {ru.analyses.reuseAction}
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {doneCount > 0 && (
            <p className="text-caption text-ink-muted px-1 leading-relaxed">
              {ru.newAnalyses.helper}
            </p>
          )}
        </>
      )}

      {/* ─── Block B: Мои анализы (hero + compact list + bridge) ────────── */}
      <div className="flex items-center justify-between mt-1 px-1">
        <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
          {ru.analyses.historyHeading}
        </p>
        {analyses.length > 0 && (
          <button
            onClick={() => nav('/patient/history')}
            className="flex items-center gap-1 text-caption font-bold tracking-caps uppercase text-cyan-500"
          >
            {ru.analyses.history.sectionLink}
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Hero card — one anchor metric. Latest value + sparkline when we have
          data; onboarding nudge when we don't. Always present so the section
          has a visual centre of gravity. */}
      <HeroMetricCard
        field={heroField}
        latest={heroLatest}
        readings={heroReadings}
        diagnosisLabel={diagnosisLabel}
        onOpen={() => nav('/patient/history')}
        onUpload={() => nav('/patient/upload')}
      />

      {/* Other recent records — short ledger of documents that aren't the
          hero. Hidden when the archive only contains the hero (or nothing). */}
      {otherAnalyses.length > 0 && (
        <>
          <p className="text-caption text-ink-muted px-1 mt-1">
            {ru.analyses.history.otherRecordsHeading}
          </p>
          {otherAnalyses.map((a) => (
            <button
              key={a.id}
              onClick={() => nav(`/patient/history/${a.id}`)}
              className="rounded-2xl bg-white p-3.5 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
                <FileText size={18} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-bold text-ink-strong truncate">
                  {a.label}
                </p>
                <p className="text-caption text-ink-muted">
                  {a.date ? formatDateShort(a.date) : '—'}
                </p>
              </div>
              {a.status === 'acknowledged' ? (
                <StatusBadge tone="success">
                  {ru.newAnalyses.status.accepted}
                </StatusBadge>
              ) : (
                <ChevronRight size={16} className="text-slate-400" />
              )}
            </button>
          ))}
        </>
      )}

      {/* Bridge to full archive — only when there's truly more behind it. */}
      {restCount > 0 && (
        <button
          onClick={() => nav('/patient/history')}
          className="self-start text-caption font-bold tracking-caps uppercase text-cyan-500 px-1"
        >
          {ru.analyses.history.moreInHistory(restCount)}
        </button>
      )}

      {/* Upload CTA — present even when archive is empty (the hero card has
          its own CTA, but the section-level button keeps the affordance in
          a predictable spot). */}
      {analyses.length > 0 && (
        <button
          onClick={() => nav('/patient/upload')}
          className="rounded-2xl bg-cyan-50 px-4 py-3 flex items-center justify-center gap-2 text-cyan-600 font-bold text-body hover:bg-cyan-100 transition-colors mt-1"
        >
          <Plus size={16} strokeWidth={2.5} />
          {ru.analyses.uploadCta}
        </button>
      )}
    </ChecklistSection>
  )
}

// ─── Hero card ───────────────────────────────────────────────────────────────

interface HeroMetricCardProps {
  field: string
  latest: MetricReading | null
  readings: MetricReading[]
  diagnosisLabel?: string
  onOpen: () => void
  onUpload: () => void
}

function HeroMetricCard({
  field,
  latest,
  readings,
  diagnosisLabel,
  onOpen,
  onUpload,
}: HeroMetricCardProps) {
  // Onboarding nudge: hero field has no reading yet. Sub-copy adapts to the
  // diagnosis so it doesn't feel generic when we know what matters.
  if (!latest) {
    const nudge =
      diagnosisLabel && /диабет/i.test(diagnosisLabel)
        ? ru.analyses.history.heroNudgeForDiabetes
        : ru.analyses.history.heroNudgeGeneric
    return (
      <div className="rounded-2xl bg-white p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-body-lg font-bold text-ink-strong leading-snug truncate">
              {field}
            </p>
            <p className="text-caption text-ink-muted leading-snug">
              {ru.analyses.history.heroNoValueTitle}
            </p>
          </div>
        </div>
        <p className="text-caption text-ink-muted leading-relaxed">{nudge}</p>
        <button
          onClick={onUpload}
          className="rounded-xl bg-cyan-500 text-white px-4 py-2.5 text-body font-bold tracking-caps uppercase flex items-center justify-center gap-1.5 hover:bg-cyan-600 transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          {ru.analyses.uploadCta}
        </button>
      </div>
    )
  }

  const valueTone =
    latest.range === 'above' || latest.range === 'below'
      ? 'text-amber-700'
      : 'text-ink-strong'

  return (
    <button
      onClick={onOpen}
      className="rounded-2xl bg-white p-4 flex flex-col gap-2 text-left hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
          {field} · {ru.analyses.history.heroSuffix}
        </p>
        <ChevronRight size={16} className="text-slate-400" />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-[28px] font-bold font-data leading-none ${valueTone}`}>
          {latest.display}
          {latest.unit && (
            <span className="text-body-lg font-bold text-ink-muted ml-1.5">
              {latest.unit}
            </span>
          )}
        </p>
        {latest.ref && (
          <p className="text-caption text-ink-muted text-right">
            {ru.analyses.history.heroRefPrefix} {latest.ref}
          </p>
        )}
      </div>
      {readings.length >= 2 && <HeroSparkline readings={readings} />}
      <p className="text-caption text-ink-muted">
        {formatDateShort(latest.measuredAt)} · {relativeAge(latest.measuredAt)}
      </p>
    </button>
  )
}

function HeroSparkline({ readings }: { readings: MetricReading[] }) {
  const numeric = readings.filter((r) => r.numericValue != null)
  if (numeric.length < 2) return null
  const w = 320
  const h = 36
  const values = numeric.map((r) => r.numericValue as number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 6) + 3
      const y = h - 3 - ((v - min) / span) * (h - 6)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const last = numeric[numeric.length - 1]
  const lastX = w - 3
  const lastY = h - 3 - (((last.numericValue as number) - min) / span) * (h - 6)
  const lastAttention = last.range === 'above' || last.range === 'below'
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-9 text-cyan-500"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={3.5}
        className={lastAttention ? 'fill-amber-600' : 'fill-cyan-500'}
      />
    </svg>
  )
}
