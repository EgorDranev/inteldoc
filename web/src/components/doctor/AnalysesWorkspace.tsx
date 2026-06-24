import { useMemo, useState } from 'react'
import { Send, Check, Clock, Eye, ChevronDown } from 'lucide-react'
import Button from '../primitives/Button'
import StatusBadge from '../primitives/StatusBadge'
import { formatDateShort } from '../../lib/formatters'
import { ANALYSIS_TYPE_LABEL, PLAN_STATUS_LABEL } from './doctorConstants'
import type {
  Analysis,
  DoctorRequest,
  PlanItem,
  PlanItemStatus,
} from '../../store/types'

/**
 * Doctor analyses workspace — JTBD-led IA.
 *
 * «Активные запросы» — outbound prep requests with progress.
 *
 * The «Ждут вашего решения» inbox previously lived here as the primary work
 * surface; it has been promoted to the «Анализы к этому визиту» block on
 * Подготовка к приёму so the doctor sees current-visit uploads alongside the
 * rest of the prep picture without switching tabs.
 */
export default function AnalysesWorkspace({
  analyses,
  planItems,
  requests,
  onOpenAnalysis,
  onCompose,
}: {
  analyses: Analysis[]
  planItems: PlanItem[]
  requests: DoctorRequest[]
  onOpenAnalysis: (a: Analysis) => void
  onCompose: () => void
}) {
  const activeRequests = useMemo(
    () => requests.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [requests],
  )

  return (
    <div className="flex flex-col gap-8">
      <WorkspaceHeader
        activeRequests={activeRequests}
        planItems={planItems}
        analyses={analyses}
        onCompose={onCompose}
      />

      <ActiveRequestsBand
        requests={activeRequests}
        planItems={planItems}
        analyses={analyses}
        onOpenAnalysis={onOpenAnalysis}
        onCompose={onCompose}
      />
    </div>
  )
}

// ─── Header strip ────────────────────────────────────────────────────────────

function WorkspaceHeader({
  activeRequests,
  planItems,
  analyses,
  onCompose,
}: {
  activeRequests: DoctorRequest[]
  planItems: PlanItem[]
  analyses: Analysis[]
  onCompose: () => void
}) {
  const primaryRequest = activeRequests[0]
  const itemsForPrimary = primaryRequest
    ? planItems.filter((p) => p.requestId === primaryRequest.id)
    : []
  const accepted = itemsForPrimary.filter(
    (p) => effectiveStatus(p, analyses) === 'acknowledged',
  ).length

  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1">
        <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
          Анализы
        </p>
        <h2 className="text-h2-ui font-bold text-ink-strong leading-tight">
          {primaryRequest
            ? primaryRequest.title
            : 'Анализы пациента'}
        </h2>
        <p className="text-caption text-ink-muted leading-relaxed">
          {buildHeaderSubtitle({
            primaryRequest,
            itemsTotal: itemsForPrimary.length,
            accepted,
          })}
        </p>
      </div>
      <Button
        icon={<Send size={16} strokeWidth={2.4} />}
        onClick={onCompose}
        variant="secondary"
      >
        Отправить запрос
      </Button>
    </header>
  )
}

function buildHeaderSubtitle({
  primaryRequest,
  itemsTotal,
  accepted,
}: {
  primaryRequest: DoctorRequest | undefined
  itemsTotal: number
  accepted: number
}): string {
  if (primaryRequest && itemsTotal > 0) {
    return `Принято ${accepted} из ${itemsTotal}`
  }
  return 'Активных запросов нет'
}

// ─── Band 1: Active requests ─────────────────────────────────────────────────

function ActiveRequestsBand({
  requests,
  planItems,
  analyses,
  onOpenAnalysis,
  onCompose,
}: {
  requests: DoctorRequest[]
  planItems: PlanItem[]
  analyses: Analysis[]
  onOpenAnalysis: (a: Analysis) => void
  onCompose: () => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <BandHeading
        title="Активные запросы"
        helper="Что вы попросили пациента подготовить и в каком оно статусе."
        count={requests.length}
      />
      {requests.length === 0 ? (
        <div className="rounded-2xl bg-surface-sunken p-6 flex flex-col items-start gap-2">
          <p className="text-body-lg font-bold text-ink-strong">
            Запросов пока нет
          </p>
          <p className="text-body text-ink-muted leading-relaxed">
            Сформируйте список анализов до приёма — пациент увидит запрос в
            приложении и сможет загрузить результаты.
          </p>
          <Button
            variant="secondary"
            icon={<Send size={16} strokeWidth={2.4} />}
            onClick={onCompose}
            className="mt-2"
          >
            Сформировать запрос
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => {
            const items = planItems.filter((p) => p.requestId === r.id)
            return (
              <RequestCard
                key={r.id}
                request={r}
                items={items}
                analyses={analyses}
                onOpenAnalysis={onOpenAnalysis}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

function RequestCard({
  request,
  items,
  analyses,
  onOpenAnalysis,
}: {
  request: DoctorRequest
  items: PlanItem[]
  analyses: Analysis[]
  onOpenAnalysis: (a: Analysis) => void
}) {
  const [expandAccepted, setExpandAccepted] = useState(false)

  const enriched = items.map((p) => ({
    item: p,
    status: effectiveStatus(p, analyses),
    analysis: p.linkedAnalysisId
      ? analyses.find((a) => a.id === p.linkedAnalysisId)
      : undefined,
  }))
  const open = enriched.filter((e) => e.status !== 'acknowledged')
  const accepted = enriched.filter((e) => e.status === 'acknowledged')
  const total = enriched.length

  return (
    <li className="rounded-2xl bg-surface p-5 shadow-[inset_0_0_0_1.5px_var(--slate-100)]">
      <header className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-body-lg font-bold text-ink-strong leading-tight">
              {request.title}
            </p>
            {!request.seenByPatient ? (
              <StatusBadge tone="warning">Уведомление не открыто</StatusBadge>
            ) : (
              <StatusBadge tone="success">Уведомление прочитано</StatusBadge>
            )}
          </div>
          <p className="text-caption text-ink-muted">
            Отправлено {formatDateShort(request.createdAt)}
            {' · '}
            Принято {accepted.length} из {total}
          </p>
          {request.body && (
            <p className="text-caption text-ink leading-relaxed mt-1">
              {request.body}
            </p>
          )}
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {open.map((e) => (
          <PlanItemRow
            key={e.item.id}
            item={e.item}
            status={e.status}
            analysis={e.analysis}
            onOpenAnalysis={onOpenAnalysis}
          />
        ))}
        {accepted.length > 0 && (
          <li>
            <button
              onClick={() => setExpandAccepted((v) => !v)}
              className="w-full text-left flex items-center gap-2 text-caption font-bold uppercase tracking-caps text-ink-muted hover:text-ink py-2"
            >
              <ChevronDown
                size={14}
                strokeWidth={2.4}
                className={`transition-transform ${
                  expandAccepted ? '' : '-rotate-90'
                }`}
              />
              Принято · {accepted.length}
            </button>
            {expandAccepted && (
              <ul className="flex flex-col gap-2 mt-1">
                {accepted.map((e) => (
                  <PlanItemRow
                    key={e.item.id}
                    item={e.item}
                    status={e.status}
                    analysis={e.analysis}
                    onOpenAnalysis={onOpenAnalysis}
                  />
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </li>
  )
}

function PlanItemRow({
  item,
  status,
  analysis,
  onOpenAnalysis,
}: {
  item: PlanItem
  status: PlanItemStatus
  analysis: Analysis | undefined
  onOpenAnalysis: (a: Analysis) => void
}) {
  const tone =
    status === 'acknowledged'
      ? 'success'
      : status === 'uploaded'
      ? 'info'
      : 'warning'
  return (
    <li className="rounded-xl bg-surface-sunken p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-[inset_0_0_0_1.5px_var(--slate-200)]">
        {status === 'acknowledged' ? (
          <Check size={16} strokeWidth={2.5} className="text-emerald-600" />
        ) : status === 'uploaded' ? (
          <Eye size={16} strokeWidth={2} className="text-cyan-500" />
        ) : (
          <Clock size={16} strokeWidth={2} className="text-amber-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body font-bold text-ink-strong truncate">
          {item.label}
        </p>
        {item.reason && (
          <p className="text-caption text-ink-muted leading-snug truncate">
            {item.reason}
          </p>
        )}
        <p className="text-micro font-bold uppercase tracking-caps text-ink-muted mt-1">
          {ANALYSIS_TYPE_LABEL[item.analysisType]}
          {item.dueDate ? ` · до ${formatDateShort(item.dueDate)}` : ''}
        </p>
      </div>
      <StatusBadge tone={tone}>{PLAN_STATUS_LABEL[status]}</StatusBadge>
      {analysis && (
        <Button
          variant="ghost"
          size="md"
          icon={<Eye size={13} strokeWidth={2.4} />}
          onClick={() => onOpenAnalysis(analysis)}
        >
          Открыть
        </Button>
      )}
    </li>
  )
}

// ─── Shared tiny helpers ─────────────────────────────────────────────────────

function BandHeading({
  title,
  helper,
  count,
  tone = 'neutral',
}: {
  title: string
  helper?: string
  count?: number
  tone?: 'neutral' | 'attention'
}) {
  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <h3 className="text-h3-ui font-bold text-ink-strong leading-tight">
        {title}
      </h3>
      {typeof count === 'number' && (
        <span
          className={`text-caption font-bold uppercase tracking-caps rounded-full px-2 py-0.5 ${
            tone === 'attention' && count > 0
              ? 'bg-amber-100 text-amber-800'
              : 'bg-surface-sunken text-ink-muted'
          }`}
        >
          {count}
        </span>
      )}
      {helper && (
        <p className="text-caption text-ink-muted basis-full leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  )
}

function effectiveStatus(p: PlanItem, analyses: Analysis[]): PlanItemStatus {
  if (!p.linkedAnalysisId) return p.status
  const a = analyses.find((x) => x.id === p.linkedAnalysisId)
  if (!a) return p.status
  // Analysis is the source of truth for accept state — handles seeded
  // demos where planItem.status hasn't been mirrored back from the analysis.
  if (a.status === 'acknowledged') return 'acknowledged'
  if (a.status === 'uploaded' && p.status === 'assigned') return 'uploaded'
  return p.status
}
