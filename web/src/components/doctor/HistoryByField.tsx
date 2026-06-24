import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Eye,
  Search,
  X,
} from 'lucide-react'
import { formatDateCompact } from '../../lib/formatters'
import { readingsFromAnalysis } from '../../store/doctorSelectors'
import type { Analysis, AnalysisType } from '../../store/types'

/**
 * Field-grouped history with contextual search.
 *
 * Two surfaces share this UI:
 *   • Анализы → «История по показателям» — full list, scoped to one tab.
 *   • Сводка → «Динамика» — top-N preview with «Показать всё» expander,
 *     framed as comparison with the previous appointment.
 *
 * Each group: a `field` (HbA1c, Глюкоза, …) with all readings the patient
 * has on file, newest-first. The headline reading carries a delta pill
 * against the prior one — that's where the «динамика» semantics live.
 */

export interface FieldReading {
  analysis: Analysis
  display: string
  numericValue: number | null
  measuredAt: string
  range: 'in' | 'above' | 'below' | 'unknown'
}

export interface FieldGroup {
  field: string
  unit: string | null
  ref: string | null
  /** Newest-first list of readings for this field. */
  readings: FieldReading[]
}

interface QueryTokenBase {
  id: string
  label: string
  aliases: string[]
}

export interface PeriodToken extends QueryTokenBase {
  kind: 'period'
  days: number
}

export interface TypeToken extends QueryTokenBase {
  kind: 'type'
  type: AnalysisType
}

export const PERIOD_TOKENS: PeriodToken[] = [
  { kind: 'period', id: '30', label: '30 дней', days: 30, aliases: ['30 дней', '30 дн', 'месяц', 'за месяц'] },
  { kind: 'period', id: '90', label: '3 месяца', days: 90, aliases: ['3 месяца', '3 мес', 'три месяца', 'квартал'] },
  { kind: 'period', id: '180', label: '6 месяцев', days: 180, aliases: ['6 месяцев', '6 мес', 'полгода', 'шесть месяцев'] },
  { kind: 'period', id: '365', label: 'Год', days: 365, aliases: ['год', 'за год', '12 месяцев'] },
]

export const TYPE_TOKENS: TypeToken[] = [
  { kind: 'type', id: 'HbA1c', label: 'HbA1c', type: 'HbA1c', aliases: ['hba1c', 'гликированный', 'гликир'] },
  { kind: 'type', id: 'glucose', label: 'Глюкоза', type: 'glucose', aliases: ['глюкоза', 'глюкоз', 'сахар'] },
  { kind: 'type', id: 'creatinine', label: 'Креатинин', type: 'creatinine', aliases: ['креатинин', 'креатин'] },
  { kind: 'type', id: 'cholesterol', label: 'Холестерин', type: 'cholesterol', aliases: ['холестерин', 'холестер', 'лпнп', 'лпвп'] },
]

const ALL_TOKENS: Array<PeriodToken | TypeToken> = [...PERIOD_TOKENS, ...TYPE_TOKENS]

export interface ParsedQuery {
  period: PeriodToken | null
  type: TypeToken | null
  recognized: Array<{ token: PeriodToken | TypeToken; matched: string }>
  remainder: string
}

export function parseQuery(raw: string): ParsedQuery {
  let remainder = ` ${raw} `
  let period: PeriodToken | null = null
  let type: TypeToken | null = null
  const recognized: Array<{ token: PeriodToken | TypeToken; matched: string }> = []

  // Longest alias first — "3 месяца" must win over a stray "мес" fragment.
  const candidates = ALL_TOKENS.flatMap((tok) =>
    tok.aliases.map((alias) => ({ tok, alias })),
  ).sort((a, b) => b.alias.length - a.alias.length)

  for (const { tok, alias } of candidates) {
    const re = new RegExp(`(^|\\s)${escapeRegex(alias)}(\\s|$)`, 'i')
    const m = remainder.match(re)
    if (!m) continue
    if (tok.kind === 'period' && period) continue
    if (tok.kind === 'type' && type) continue
    if (tok.kind === 'period') period = tok
    else type = tok
    recognized.push({ token: tok, matched: alias })
    remainder = remainder.replace(re, ' ')
  }

  return { period, type, recognized, remainder: remainder.trim().replace(/\s+/g, ' ') }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildFieldGroups(
  analyses: Analysis[],
  parsed: ParsedQuery,
): FieldGroup[] {
  const cutoff = (() => {
    if (!parsed.period) return null
    const d = new Date()
    d.setDate(d.getDate() - parsed.period.days)
    return d.toISOString()
  })()

  const map = new Map<string, FieldGroup>()
  for (const a of analyses) {
    if (parsed.type && a.type !== parsed.type.type) continue
    const dateRef = a.date || a.uploadedAt
    if (cutoff && dateRef < cutoff) continue
    for (const r of readingsFromAnalysis(a)) {
      const key = r.field
      const g = map.get(key) ?? {
        field: r.field,
        unit: r.unit,
        ref: r.ref,
        readings: [],
      }
      g.readings.push({
        analysis: a,
        display: r.display,
        numericValue: r.numericValue,
        measuredAt: r.measuredAt,
        range: r.range,
      })
      if (r.unit) g.unit = r.unit
      if (r.ref) g.ref = r.ref
      map.set(key, g)
    }
  }

  const q = parsed.remainder.toLowerCase()
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      readings: g.readings
        .slice()
        .sort((x, y) => (x.measuredAt < y.measuredAt ? 1 : -1)),
    }))
    .filter((g) =>
      q
        ? g.field.toLowerCase().includes(q) ||
          g.readings.some((r) => r.analysis.label.toLowerCase().includes(q))
        : true,
    )
    .sort((a, b) => {
      const am = a.readings[0]?.measuredAt ?? ''
      const bm = b.readings[0]?.measuredAt ?? ''
      if (am === bm) return a.field < b.field ? -1 : 1
      return am < bm ? 1 : -1
    })
}

/** Days of patient history we have on file — drives which period chips are useful. */
export function historySpanDays(analyses: Analysis[]): number {
  let oldest: string | null = null
  for (const a of analyses) {
    const d = a.date || a.uploadedAt
    if (!d) continue
    if (!oldest || d < oldest) oldest = d
  }
  if (!oldest) return 0
  const ms = Date.now() - new Date(oldest).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

// ─── Search controls ─────────────────────────────────────────────────────────

export function SearchControls({
  query,
  setQuery,
  parsed,
  availableTypes,
  spanDays,
  placeholder,
}: {
  query: string
  setQuery: (q: string) => void
  parsed: ParsedQuery
  availableTypes: Set<AnalysisType>
  spanDays: number
  placeholder?: string
}) {
  const addToken = (alias: string) => {
    const next = query.trim() ? `${query.trim()} ${alias}` : alias
    setQuery(next)
  }

  const removeMatched = (matched: string) => {
    const re = new RegExp(`(^|\\s)${escapeRegex(matched)}(\\s|$)`, 'i')
    setQuery(query.replace(re, ' ').trim().replace(/\s+/g, ' '))
  }

  const periodSuggestions = parsed.period
    ? []
    : PERIOD_TOKENS.filter((p) => spanDays > p.days)
  const typeSuggestions = parsed.type
    ? []
    : TYPE_TOKENS.filter((t) => availableTypes.has(t.type))

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? 'Поиск: тип анализа или период…'}
          aria-label="Контекстный поиск по истории анализов"
          className="w-full rounded-xl bg-surface pl-10 pr-10 py-2.5 text-body shadow-[inset_0_0_0_1.5px_var(--slate-200)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--blue-600)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Очистить поиск"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100 hover:text-ink"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {parsed.recognized.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Распознанные фильтры"
        >
          <span className="text-caption text-ink-muted">Распознано:</span>
          {parsed.recognized.map((r) => (
            <RecognizedPill
              key={`${r.token.kind}-${r.token.id}`}
              label={r.token.label}
              kind={r.token.kind}
              onRemove={() => removeMatched(r.matched)}
            />
          ))}
        </div>
      )}

      {periodSuggestions.length > 0 && (
        <SuggestionRow
          label="Период:"
          tokens={periodSuggestions}
          onAdd={(alias) => addToken(alias)}
        />
      )}

      {typeSuggestions.length > 0 && (
        <SuggestionRow
          label="Тип анализа:"
          tokens={typeSuggestions}
          onAdd={(alias) => addToken(alias)}
        />
      )}
    </div>
  )
}

function RecognizedPill({
  label,
  kind,
  onRemove,
}: {
  label: string
  kind: 'period' | 'type'
  onRemove: () => void
}) {
  const tone = kind === 'period' ? 'bg-ink-strong text-white' : 'bg-cyan-500 text-white'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-caption font-bold ${tone}`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Убрать фильтр: ${label}`}
        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20"
      >
        <X size={11} strokeWidth={2.6} />
      </button>
    </span>
  )
}

function SuggestionRow({
  label,
  tokens,
  onAdd,
}: {
  label: string
  tokens: Array<PeriodToken | TypeToken>
  onAdd: (alias: string) => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-label={`Подсказки: ${label.replace(':', '')}`}
    >
      <span className="text-caption text-ink-muted w-[88px] flex-shrink-0">
        {label}
      </span>
      {tokens.map((tok) => (
        <SuggestionPill
          key={`${tok.kind}-${tok.id}`}
          label={tok.label}
          kind={tok.kind}
          onClick={() => onAdd(tok.aliases[0])}
        />
      ))}
    </div>
  )
}

function SuggestionPill({
  label,
  kind,
  onClick,
}: {
  label: string
  kind: 'period' | 'type'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={kind === 'period' ? 'Период' : 'Тип анализа'}
      className="rounded-full bg-surface px-2.5 py-0.5 text-caption text-ink-muted shadow-[inset_0_0_0_1px_var(--slate-200)] transition-colors hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--slate-300)]"
    >
      + {label}
    </button>
  )
}

// ─── Field group card ────────────────────────────────────────────────────────

export function FieldGroupCard({
  group,
  onOpenAnalysis,
  initiallyExpanded = false,
}: {
  group: FieldGroup
  onOpenAnalysis: (a: Analysis) => void
  initiallyExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const latest = group.readings[0]
  const prev = group.readings[1]
  const trend = describeTrend(latest, prev, group.unit)

  return (
    <li className="rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1.5px_var(--slate-100)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left flex items-center gap-4"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-body font-bold text-ink-strong">{group.field}</p>
            <span className="text-caption text-ink-muted">
              {group.readings.length}{' '}
              {pluralize(group.readings.length, [
                'результат',
                'результата',
                'результатов',
              ])}
            </span>
            {group.ref && (
              <span className="text-caption text-ink-muted font-data">
                · реф. {group.ref}
              </span>
            )}
          </div>
          {latest && (
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span
                className={`text-h3-ui font-bold font-data leading-none ${
                  latest.range === 'above' || latest.range === 'below'
                    ? 'text-amber-700'
                    : 'text-ink-strong'
                }`}
              >
                {latest.display}
              </span>
              <span className="text-caption text-ink-muted font-data">
                {formatDateCompact(latest.measuredAt)}
              </span>
              {prev && (
                <span className="text-caption text-ink-muted font-data">
                  · прошлый: {prev.display} {formatDateCompact(prev.measuredAt)}
                </span>
              )}
              {trend && <TrendBadge trend={trend} />}
            </div>
          )}
        </div>
        <Sparkline readings={group.readings} />
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`text-ink-muted transition-transform ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      {expanded && (
        <ul className="flex flex-col gap-1.5 mt-3 pt-3 shadow-[inset_0_1.5px_0_0_var(--slate-100)]">
          {group.readings.map((r, i) => (
            <li key={`${r.analysis.id}-${i}`}>
              <button
                onClick={() => onOpenAnalysis(r.analysis)}
                className="w-full text-left rounded-xl bg-surface-sunken px-3 py-2 flex items-center gap-3 hover:bg-cyan-50/50 transition-colors"
              >
                <span className="text-caption text-ink-muted font-data w-20 flex-shrink-0">
                  {formatDateCompact(r.measuredAt)}
                </span>
                <span
                  className={`text-body font-bold font-data flex-shrink-0 ${
                    r.range === 'above' || r.range === 'below'
                      ? 'text-amber-700'
                      : 'text-ink-strong'
                  }`}
                >
                  {r.display}
                </span>
                <span className="text-caption text-ink-muted truncate">
                  {r.analysis.label}
                </span>
                <Eye
                  size={13}
                  strokeWidth={2.4}
                  className="text-cyan-500 ml-auto flex-shrink-0"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Sparkline({ readings }: { readings: FieldReading[] }) {
  const numeric = readings
    .filter((r) => r.numericValue != null)
    .slice()
    .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
  // <3 points: a 2-point sparkline is just a line segment — no real shape to
  // read, and it duplicates the textual prev→current + delta pill already
  // shown on the card. Render nothing and let the chevron sit flush.
  if (numeric.length < 3) return null
  const values = numeric.map((r) => r.numericValue as number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 80
  const h = 28
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 4) + 2
      const y = h - 2 - ((v - min) / span) * (h - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const last = numeric[numeric.length - 1]
  const lastX = w - 2
  const lastY = h - 2 - ((last.numericValue! - min) / span) * (h - 4)
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="flex-shrink-0"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-cyan-500"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2.5}
        className={
          last.range === 'above' || last.range === 'below'
            ? 'fill-amber-600'
            : 'fill-cyan-500'
        }
      />
    </svg>
  )
}

export interface Trend {
  direction: 'up' | 'down' | 'flat'
  delta: string
  tone: 'good' | 'bad' | 'neutral'
}

export function TrendBadge({ trend }: { trend: Trend }) {
  const { direction, delta, tone } = trend
  const Icon =
    direction === 'flat'
      ? ArrowRight
      : direction === 'down'
      ? ArrowDownRight
      : ArrowUpRight
  const colorClass =
    tone === 'good'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'bad'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-ink-muted'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-bold font-data ${colorClass}`}
    >
      <Icon size={12} strokeWidth={2.4} />
      {delta}
    </span>
  )
}

export function describeTrend(
  latest: FieldReading | undefined,
  prev: FieldReading | undefined,
  unit: string | null,
): Trend | null {
  if (!latest || !prev) return null
  if (latest.numericValue == null || prev.numericValue == null) return null
  const diff = +(latest.numericValue - prev.numericValue).toFixed(1)
  const unitPart = unit ? ` ${unit}` : ''
  if (diff === 0) {
    return { direction: 'flat', delta: `0${unitPart}`, tone: 'neutral' }
  }
  const direction: 'up' | 'down' = diff > 0 ? 'up' : 'down'
  let tone: 'good' | 'bad' | 'neutral' = 'neutral'
  if (latest.range === 'in' && prev.range !== 'in') tone = 'good'
  else if (latest.range !== 'in' && prev.range === 'in') tone = 'bad'
  else if (latest.range === 'above') tone = diff < 0 ? 'good' : 'bad'
  else if (latest.range === 'below') tone = diff > 0 ? 'good' : 'bad'
  const sign = diff > 0 ? '+' : ''
  return { direction, delta: `${sign}${diff.toFixed(1)}${unitPart}`, tone }
}

export function pluralize(
  n: number,
  [one, few, many]: [string, string, string],
): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
