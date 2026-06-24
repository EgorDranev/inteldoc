import { useMemo, useState } from 'react'
import {
  Activity,
  ClipboardList,
  FileText,
  CalendarClock,
  Inbox,
} from 'lucide-react'
import { formatDateTime } from '../../lib/formatters'
import type {
  Analysis,
  Appointment,
  Document,
  DoctorRequest,
} from '../../store/types'

type PeriodId = 'all' | '30' | '90' | '365'
type TypeId = 'all' | 'analysis' | 'document' | 'appointment' | 'request'

interface TimelineEntry {
  id: string
  ts: string
  kind: TypeId
  title: string
  body?: string
}

const PERIODS: Array<{ id: PeriodId; label: string; days: number | null }> = [
  { id: 'all', label: 'Все', days: null },
  { id: '30', label: '1 мес', days: 30 },
  { id: '90', label: '3 мес', days: 90 },
  { id: '365', label: '12 мес', days: 365 },
]

const TYPES: Array<{
  id: TypeId
  label: string
  Icon: typeof Activity
  tone: string
}> = [
  { id: 'all', label: 'Все типы', Icon: Activity, tone: 'text-ink' },
  {
    id: 'analysis',
    label: 'Анализы',
    Icon: ClipboardList,
    tone: 'text-cyan-600',
  },
  {
    id: 'document',
    label: 'Документы',
    Icon: FileText,
    tone: 'text-blue-600',
  },
  {
    id: 'appointment',
    label: 'Визиты',
    Icon: CalendarClock,
    tone: 'text-emerald-600',
  },
  {
    id: 'request',
    label: 'Запросы',
    Icon: Inbox,
    tone: 'text-amber-600',
  },
]

const KIND_LABEL: Record<TypeId, string> = {
  all: 'Событие',
  analysis: 'Анализ',
  document: 'Документ',
  appointment: 'Визит',
  request: 'Запрос',
}

/**
 * Doctor-side timeline view with period + type filter chips.
 * Aggregates analyses, documents, appointments, and requests into one
 * reverse-chronological feed.
 */
export default function TimelineSection({
  analyses,
  documents,
  appointments,
  requests,
}: {
  analyses: Analysis[]
  documents: Document[]
  appointments: Appointment[]
  requests: DoctorRequest[]
}) {
  const [period, setPeriod] = useState<PeriodId>('all')
  const [type, setType] = useState<TypeId>('all')

  const entries = useMemo<TimelineEntry[]>(() => {
    const out: TimelineEntry[] = []
    for (const a of analyses) {
      out.push({
        id: `a-${a.id}`,
        ts: a.uploadedAt,
        kind: 'analysis',
        title: a.label,
        body: Object.entries(a.ocrFields)
          .filter(([k]) => !['дата', 'норма'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · '),
      })
    }
    for (const d of documents) {
      out.push({
        id: `d-${d.id}`,
        ts: d.uploadedAt,
        kind: 'document',
        title: d.label,
        body:
          d.structureStatus === 'structured'
            ? 'Структурировано'
            : d.structureStatus === 'original-only'
            ? 'Только оригинал'
            : undefined,
      })
    }
    for (const ap of appointments) {
      out.push({
        id: `ap-${ap.id}`,
        ts: ap.date,
        kind: 'appointment',
        title:
          ap.type === 'main' ? 'Основной приём' : 'Подготовительный приём',
        body: ap.status === 'completed' ? 'Состоялся' : 'Запланирован',
      })
    }
    for (const r of requests) {
      out.push({
        id: `r-${r.id}`,
        ts: r.createdAt,
        kind: 'request',
        title: r.title,
        body: r.body,
      })
    }
    return out.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  }, [analyses, documents, appointments, requests])

  const filtered = useMemo(() => {
    const cutoff = (() => {
      const p = PERIODS.find((x) => x.id === period)
      if (!p?.days) return null
      const d = new Date()
      d.setDate(d.getDate() - p.days)
      return d.toISOString()
    })()
    return entries
      .filter((e) => (cutoff ? e.ts >= cutoff : true))
      .filter((e) => (type === 'all' ? true : e.kind === type))
  }, [entries, period, type])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-h2-ui font-bold text-ink-strong leading-tight">
          Таймлайн
        </h2>
        <p className="text-caption text-ink-muted mt-1">
          Все события по пациенту в одной ленте.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <ChipGroup
          values={PERIODS}
          selected={period}
          onChange={setPeriod}
          variant="period"
        />
        <span className="w-px self-stretch bg-slate-200" aria-hidden />
        <ChipGroup
          values={TYPES}
          selected={type}
          onChange={setType}
          variant="type"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-body text-ink-muted">
          За выбранные фильтры событий нет.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((e) => {
            const meta = TYPES.find((t) => t.id === e.kind)
            const Icon = meta?.Icon ?? Activity
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-2xl bg-surface-sunken p-4"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-[inset_0_0_0_1px_var(--slate-200)] ${
                    meta?.tone ?? ''
                  }`}
                >
                  <Icon size={16} strokeWidth={2} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-white px-2 py-0.5 text-micro font-bold uppercase tracking-caps text-ink-muted shadow-[inset_0_0_0_1px_var(--slate-200)]">
                      {KIND_LABEL[e.kind]}
                    </span>
                    <p className="text-body font-bold text-ink-strong truncate">
                      {e.title}
                    </p>
                  </div>
                  {e.body && (
                    <p className="text-caption text-ink mt-1 leading-snug">
                      {e.body}
                    </p>
                  )}
                </div>
                <span className="text-caption text-ink-muted font-data whitespace-nowrap">
                  {formatDateTime(e.ts)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ChipGroup<T extends string>({
  values,
  selected,
  onChange,
  variant,
}: {
  values: ReadonlyArray<{ id: T; label: string }>
  selected: T
  onChange: (id: T) => void
  variant: 'period' | 'type'
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {values.map((v) => {
        const active = v.id === selected
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v.id)}
            className={`rounded-full px-3 py-1 text-caption font-bold uppercase tracking-caps transition-colors ${
              active
                ? variant === 'period'
                  ? 'bg-ink-strong text-white'
                  : 'bg-cyan-500 text-white'
                : 'bg-surface text-ink-muted shadow-[inset_0_0_0_1.5px_var(--slate-200)] hover:text-ink'
            }`}
          >
            {v.label}
          </button>
        )
      })}
    </div>
  )
}
