import { useMemo } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Keyboard,
  MessageSquareText,
  Mic,
  Minus,
  TestTube2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneFrame from '../../components/patient/PhoneFrame'
import TopHeader from '../../components/patient/TopHeader'
import PrepBanner from '../../components/patient/PrepBanner'
import VasilyMascot from '../../components/system/VasilyMascot'
import ServicesCarousel from '../../components/patient/ServicesCarousel'
import TabBar from '../../components/primitives/TabBar'
import {
  useActivePatient,
  useAnalyses,
  useAppointment,
  useComplaints,
  useDocumentReadiness,
  useOverduePlanItems,
  usePlanItems,
  usePrepProgress,
} from '../../store/hooks'
import type { Analysis, AnalysisType, PlanItem } from '../../store/types'
import {
  firstNameFromFull,
  formatAppointmentLead,
  formatDateCompact,
  formatDateShort,
} from '../../lib/formatters'

// Staggered reveal for Home. 60ms between siblings, with a quick fade-up.
// Tuned to feel like the screen "lays itself out" rather than appearing all
// at once — perceived-quality bump for the demo.
function buildRevealVariants(reduce: boolean): { container: Variants; item: Variants } {
  return {
    container: {
      hidden: { opacity: 1 },
      show: {
        opacity: 1,
        transition: {
          staggerChildren: reduce ? 0 : 0.06,
          delayChildren: reduce ? 0 : 0.04,
        },
      },
    },
    item: {
      hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 },
      show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.32, ease: 'easeOut' } },
    },
  }
}

const METRIC_PRIORITY: AnalysisType[] = ['HbA1c', 'glucose', 'creatinine']
const METRIC_LABEL: Record<AnalysisType, string> = {
  HbA1c: 'HbA1c',
  glucose: 'Глюкоза',
  creatinine: 'Креатинин',
  cholesterol: 'Холестерин',
  other: '—',
}

type LatestMetric = {
  type: AnalysisType
  label: string
  value: number
  unit: string
  date: string
  trend: 'up' | 'down' | 'flat' | null
}

function pickPrimary(a: Analysis): { value: number; unit: string } | null {
  if (!a.ocrFieldMeta) return null
  for (const k of Object.keys(a.ocrFieldMeta)) {
    const m = a.ocrFieldMeta[k]
    if (m?.numericValue != null)
      return { value: m.numericValue, unit: m.unit ?? '' }
  }
  return null
}

function formatMetricValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export default function Home() {
  const nav = useNavigate()
  const reduceMotion = useReducedMotion() ?? false
  const { container: REVEAL_CONTAINER, item: REVEAL_ITEM } = useMemo(
    () => buildRevealVariants(reduceMotion),
    [reduceMotion],
  )
  const patient = useActivePatient()
  const rawFirstName = patient ? firstNameFromFull(patient.name) : 'Мария'
  const firstName =
    rawFirstName.length > 0
      ? rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1)
      : rawFirstName
  const appointment = useAppointment()
  const analyses = useAnalyses()
  const complaints = useComplaints()
  const docsReady = useDocumentReadiness()
  const plan = usePlanItems()
  const overduePlanItems = useOverduePlanItems()
  const progress = usePrepProgress()

  const latestMetrics = useMemo<LatestMetric[]>(() => {
    const out: LatestMetric[] = []
    for (const t of METRIC_PRIORITY) {
      const sameType = analyses
        .filter((a) => a.type === t)
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
      if (sameType.length === 0) continue
      const current = pickPrimary(sameType[0])
      if (!current) continue
      const prior = sameType[1] ? pickPrimary(sameType[1]) : null
      let trend: LatestMetric['trend'] = null
      if (prior) {
        const delta = current.value - prior.value
        const noise = Math.abs(prior.value) * 0.02
        trend = delta > noise ? 'up' : delta < -noise ? 'down' : 'flat'
      }
      out.push({
        type: t,
        label: METRIC_LABEL[t],
        value: current.value,
        unit: current.unit,
        date: sameType[0].date,
        trend,
      })
      if (out.length >= 3) break
    }
    return out
  }, [analyses])

  const planTotal =
    plan.assigned.length + plan.uploaded.length + plan.acknowledged.length
  const planDone = plan.uploaded.length + plan.acknowledged.length
  const planHasItems = planTotal > 0
  const planAllUploaded = planHasItems && plan.assigned.length === 0
  const overdueIds = new Set(overduePlanItems.map((p) => p.id))
  const planPreview = plan.assigned.slice(0, 2)

  const agenda = [
    {
      key: 'docs',
      icon: <FileText size={17} strokeWidth={2.2} />,
      title: 'Документы для Эндокор',
      body: `${docsReady.uploaded} из ${docsReady.total} загружено`,
      done: docsReady.uploaded === docsReady.total,
    },
    {
      key: 'analyses',
      icon: <TestTube2 size={17} strokeWidth={2.2} />,
      title: 'Анализы',
      body:
        plan.assigned.length > 0
          ? `${plan.assigned.length} ожидает загрузки`
          : analyses.length > 0
          ? `${analyses.length} сохранено в истории`
          : 'добавьте первый результат',
      done: plan.assigned.length === 0 && analyses.length > 0,
    },
    {
      key: 'complaints',
      icon: <MessageSquareText size={17} strokeWidth={2.2} />,
      title: 'Вопросы и жалобы',
      body:
        complaints.length > 0
          ? `${complaints.length} заметка для врача`
          : 'запишите, что важно обсудить',
      done: complaints.length > 0,
    },
  ]
  const nextKey = agenda.find((row) => !row.done)?.key ?? null
  const allDone = agenda.every((r) => r.done)
  const previewHasContent =
    analyses.length > 0 || complaints.length > 0 || docsReady.uploaded > 0

  const contextLine = !appointment
    ? 'Запланируем приём — и я помогу подготовиться к нему.'
    : allDone
    ? 'Вы готовы к приёму в Эндокор. Можно выдохнуть.'
    : (() => {
        const lead = formatAppointmentLead(appointment.date)
        if (lead === 'Сегодня') return 'Сегодня приём в Эндокор. Я рядом.'
        if (lead === 'Завтра')
          return 'Завтра приём в Эндокор. Финишируем подготовку.'
        return `До приёма в Эндокор — ${lead.toLowerCase()}. Помогу подготовиться.`
      })()

  const prepHeading = appointment
    ? allDone
      ? 'Подготовка завершена'
      : `Подготовка к приёму ${formatDateShort(appointment.date)}`
    : progress.done === 0
    ? 'Подготовка к приёму'
    : 'Продолжите подготовку'

  return (
    <PhoneFrame>
      <TopHeader showPartner />

      <motion.div
        className="flex-1 overflow-y-auto px-5 pb-[108px] flex flex-col gap-4"
        variants={REVEAL_CONTAINER}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <VasilyMascot size={108} halo className="flex-shrink-0" />
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <p className="text-h1-ui font-bold text-ink-strong leading-tight">
                Здравствуйте, {firstName}
              </p>
              <p className="text-body text-ink-muted leading-snug">
                {contextLine}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => nav('/patient/vasily')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-cyan-100 px-3 py-2 text-body font-semibold text-ink-strong active:scale-[0.98] transition-transform"
            >
              <Keyboard size={16} strokeWidth={2.2} className="text-cyan-600" />
              Написать
            </button>
            <button
              onClick={() => nav('/patient/vasily', { state: { mode: 'voice' } })}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-cyan-100 px-3 py-2 text-body font-semibold text-ink-strong active:scale-[0.98] transition-transform"
            >
              <Mic size={16} strokeWidth={2.2} className="text-cyan-600" />
              Голосом
            </button>
          </div>
        </motion.div>

        <motion.div variants={REVEAL_ITEM}>
          <PrepBanner />
        </motion.div>

        {latestMetrics.length > 0 && (
          <motion.button
            variants={REVEAL_ITEM}
            onClick={() => nav('/patient/history')}
            className="-mx-5 flex items-stretch gap-2 overflow-x-auto px-5 pb-1 pt-0.5 text-left"
            aria-label="Последние показатели — открыть историю"
          >
            {latestMetrics.map((m) => (
              <MetricChip key={m.type} metric={m} />
            ))}
            <div className="flex flex-shrink-0 items-center justify-center self-stretch rounded-2xl bg-white px-3 text-cyan-600">
              <span className="flex items-center gap-1 text-caption font-bold">
                Все
                <ChevronRight size={14} strokeWidth={2.4} />
              </span>
            </div>
          </motion.button>
        )}

        <motion.section
          variants={REVEAL_ITEM}
          className={`rounded-2xl p-4 ${
            appointment
              ? 'bg-white'
              : 'bg-cyan-500 text-white shadow-[0_8px_24px_-12px_rgba(8,145,178,0.55)]'
          }`}
        >
          {appointment ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-success-bg text-emerald-700">
                  <Calendar size={22} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-micro font-bold uppercase tracking-caps text-emerald-700">
                    Приём запланирован
                  </p>
                  <p className="text-body-lg font-bold text-ink-strong leading-tight font-data">
                    {formatDateShort(appointment.date)}
                  </p>
                </div>
              </div>
              {previewHasContent && (
                <button
                  onClick={() => nav('/patient/history')}
                  className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-surface-sunken px-3 py-2.5 text-left hover:bg-cyan-50/60 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
                      Что увидит врач
                    </p>
                    <p className="truncate text-body text-ink-strong">
                      Анализы — {analyses.length} · Документы — {docsReady.uploaded}/
                      {docsReady.total} · Жалобы — {complaints.length}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="flex-shrink-0 text-ink-muted"
                    strokeWidth={2}
                  />
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => nav('/patient/book')}
              className="flex w-full items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 text-white ring-1 ring-white/30">
                <CalendarDays size={22} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-lg font-bold text-white leading-tight">
                  Запишитесь к основному врачу
                </p>
                <p className="text-caption text-white/80">
                  Дата задаст ритм подготовки.
                </p>
              </div>
              <ChevronRight
                size={18}
                className="flex-shrink-0 text-white"
                strokeWidth={2.3}
              />
            </button>
          )}
        </motion.section>

        {planHasItems && (
          <motion.section variants={REVEAL_ITEM} className="rounded-2xl bg-white p-4">
            <button
              onClick={() => nav('/patient/checklist')}
              className="mb-1 flex w-full items-center justify-between gap-3 text-left active:opacity-70 transition-opacity"
            >
              <p className="min-w-0 truncate text-body-lg font-bold text-ink-strong leading-tight">
                Ваш план обследования
              </p>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <span className="font-data text-body-lg font-bold leading-none text-ink-strong">
                  {planDone}/{planTotal}
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={2.3}
                  className="text-ink-muted/70"
                />
              </div>
            </button>
            <p className="mb-3 text-caption leading-snug text-ink-muted">
              {planAllUploaded
                ? 'Все пункты загружены — врач увидит результаты.'
                : 'Что попросил врач после прошлого приёма.'}
            </p>
            {planAllUploaded ? (
              <div className="flex items-center gap-3 rounded-xl bg-success-bg px-3 py-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={17} strokeWidth={2.4} />
                </div>
                <p className="text-body font-bold leading-snug text-ink-strong">
                  Все пункты выполнены
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {planPreview.map((item) => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    overdue={overdueIds.has(item.id)}
                    onClick={() => nav('/patient/checklist')}
                  />
                ))}
              </div>
            )}
          </motion.section>
        )}

        <motion.section variants={REVEAL_ITEM} className="rounded-2xl bg-white p-4">
          {(() => {
            const dim = !appointment && progress.done === 0
            const showCounter = !dim
            const showProgressBar = !dim
            return (
              <>
                <button
                  onClick={() => nav('/patient/checklist')}
                  className="mb-1 flex w-full items-center justify-between gap-3 text-left active:opacity-70 transition-opacity"
                >
                  <p className="min-w-0 truncate text-body-lg font-bold text-ink-strong leading-tight">
                    {prepHeading}
                  </p>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {showCounter && (
                      <span className="font-data text-body-lg font-bold leading-none text-ink-strong">
                        {progress.done}/{progress.total}
                      </span>
                    )}
                    <ChevronRight
                      size={16}
                      strokeWidth={2.3}
                      className="text-ink-muted/70"
                    />
                  </div>
                </button>
                {!appointment && !allDone && (
                  <p className="text-caption text-ink-muted mb-2 leading-snug">
                    Можно начать заранее — финал зависит от даты приёма.
                  </p>
                )}
                {showProgressBar && (
                  <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden mb-3 mt-2">
                    <motion.div
                      className="h-full bg-cyan-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`,
                      }}
                      transition={{
                        duration: reduceMotion ? 0 : 0.7,
                        ease: [0.4, 0, 0.2, 1],
                        delay: reduceMotion ? 0 : 0.3,
                      }}
                    />
                  </div>
                )}
                {dim && <div className="mt-3" />}
              </>
            )
          })()}
          <div className="flex flex-col gap-2">
            {agenda.map((row) => (
              <AgendaRow
                key={row.key}
                icon={row.icon}
                title={row.title}
                body={row.body}
                done={row.done}
                next={row.key === nextKey}
                onClick={() => nav('/patient/checklist')}
              />
            ))}
          </div>
        </motion.section>

        <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-2">
          <p className="text-body-lg font-bold text-ink-strong leading-tight">
            Полезные сервисы
          </p>
          <ServicesCarousel />
        </motion.div>
      </motion.div>

      <TabBar />
    </PhoneFrame>
  )
}

function MetricChip({ metric }: { metric: LatestMetric }) {
  const TrendIcon =
    metric.trend === 'up'
      ? ArrowUp
      : metric.trend === 'down'
      ? ArrowDown
      : metric.trend === 'flat'
      ? Minus
      : null
  return (
    <div className="flex w-[132px] flex-shrink-0 flex-col gap-1 rounded-2xl bg-white px-3 py-2.5">
      <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
        {metric.label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className="font-data text-h3-ui font-bold leading-none text-ink-strong">
          {formatMetricValue(metric.value)}
        </span>
        {metric.unit && (
          <span className="text-caption text-ink-muted leading-none">
            {metric.unit}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 text-caption text-ink-muted">
        {TrendIcon && (
          <TrendIcon
            size={12}
            strokeWidth={2.3}
            className="text-ink-muted/80"
          />
        )}
        <span>{formatDateCompact(metric.date)}</span>
      </div>
    </div>
  )
}

function PlanRow({
  item,
  overdue,
  onClick,
}: {
  item: PlanItem
  overdue: boolean
  onClick: () => void
}) {
  const dueLabel = item.dueDate ? formatAppointmentLead(item.dueDate) : null
  const kind = item.kind ?? 'lab'
  const uploadable = kind === 'lab' || kind === 'instrumental'
  const actionVerb = uploadable ? 'Загрузить' : 'Выполнить'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-transform active:scale-[0.99] ${
        overdue ? 'bg-amber-50 ring-1 ring-amber-100' : 'bg-surface-sunken'
      }`}
    >
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
          overdue
            ? 'bg-amber-500 text-white'
            : 'bg-cyan-500 text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)]'
        }`}
      >
        <ClipboardList size={17} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold leading-snug text-ink-strong">
          {item.label}
        </p>
        {(dueLabel || overdue) && (
          <p
            className={`mt-0.5 text-caption leading-snug ${
              overdue ? 'text-amber-700' : 'text-ink-muted'
            }`}
          >
            {overdue
              ? `Просрочено · ${dueLabel ?? ''}`.trim()
              : `${actionVerb} · ${dueLabel}`}
          </p>
        )}
      </div>
      <ChevronRight
        size={16}
        strokeWidth={2}
        className="flex-shrink-0 text-ink-muted/70"
      />
    </button>
  )
}

function AgendaRow({
  icon,
  title,
  body,
  done,
  next,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  body: string
  done: boolean
  next: boolean
  onClick: () => void
}) {
  const rowBg = done
    ? 'bg-success-bg'
    : next
    ? 'bg-cyan-50 ring-1 ring-cyan-100'
    : 'bg-surface-sunken'
  const iconBg = done
    ? 'bg-emerald-100 text-emerald-700'
    : next
    ? 'bg-cyan-100 text-cyan-700'
    : 'bg-white text-ink-muted'
  const titleClass =
    done || next
      ? 'text-body font-bold text-ink-strong leading-snug'
      : 'text-body font-semibold text-ink-strong leading-snug'
  const bodyClass = 'mt-0.5 text-caption leading-snug text-ink-muted'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99] transition-transform ${rowBg}`}
    >
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconBg}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={titleClass}>{title}</p>
        <p className={bodyClass}>{body}</p>
      </div>
      {done ? (
        <CheckCircle2
          size={17}
          className="flex-shrink-0 text-emerald-600"
          strokeWidth={2.4}
        />
      ) : (
        <ChevronRight
          size={16}
          className={`flex-shrink-0 ${next ? 'text-cyan-500' : 'text-ink-muted/70'}`}
          strokeWidth={2}
        />
      )}
    </button>
  )
}
