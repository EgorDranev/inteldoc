import { ArrowDown, ArrowUp, AlertCircle, Minus } from 'lucide-react'
import type { MetricReading, RangeFlag } from '../../store/doctorSelectors'
import { formatDateCompact } from '../../lib/formatters'

/** Trend snapshot vs the prior reading for the same field. */
export interface MetricCardTrend {
  previousDisplay: string
  previousMeasuredAt: string
  /** Movement vs the reference range — colors the arrow. */
  trend: 'improved' | 'worsened' | 'flat'
  /** Direction of the numeric change — picks the arrow icon. */
  direction: 'up' | 'down' | 'flat'
}

const RANGE_TONE: Record<RangeFlag, { dot: string; text: string; label: string }> = {
  above: {
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    label: 'Выше нормы',
  },
  below: {
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    label: 'Ниже нормы',
  },
  in: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    label: 'В норме',
  },
  unknown: {
    dot: 'bg-slate-300',
    text: 'text-ink-muted',
    label: 'Без оценки',
  },
}

export type MetricCardTone = 'default' | 'unconfirmed' | 'flagged'

/**
 * Single metric tile — value + unit + reference + range flag.
 *
 * Tone:
 * - `default` — neutral surface with inset border. Used in the analysis drawer.
 * - `unconfirmed` — amber-ringed, value muted; the range chip is replaced with
 *   a "нужно подтвердить" caption because the reading itself isn't trusted yet.
 *   Used in the «Требуют подтверждения» block on the doctor Сводка.
 * - `flagged` — soft amber surface, range chip kept loud. Used in the
 *   «Вне референса» block on the doctor Сводка.
 */
export default function MetricCard({
  reading,
  compact = false,
  tone: cardTone = 'default',
  trend,
}: {
  reading: MetricReading
  compact?: boolean
  tone?: MetricCardTone
  /** Mini-trend row («было 7.2 · 12 фев»). Only rendered when `tone="flagged"`. */
  trend?: MetricCardTrend
}) {
  const rangeTone = RANGE_TONE[reading.range]
  const Arrow =
    reading.range === 'above'
      ? ArrowUp
      : reading.range === 'below'
      ? ArrowDown
      : null
  const isUnconfirmed = cardTone === 'unconfirmed'
  const isFlagged = cardTone === 'flagged'
  const containerClass =
    isUnconfirmed
      ? 'shadow-[inset_0_0_0_1px_var(--amber-200,#fcd34d)] bg-amber-50/40'
      : isFlagged
      ? 'shadow-[inset_0_0_0_1px_var(--amber-200,#fcd34d)] bg-amber-50/20'
      : 'shadow-[inset_0_0_0_1px_var(--slate-100)] bg-surface'
  const valueClass = isUnconfirmed ? 'text-ink-muted' : 'text-ink-strong'
  const isOutOfRange = reading.range === 'above' || reading.range === 'below'
  return (
    <div
      className={`h-full rounded-2xl ${
        compact ? 'p-3' : 'p-4'
      } ${containerClass} flex flex-col gap-1.5`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-bold uppercase tracking-caps text-ink-muted truncate">
          {reading.field}
        </p>
        <div className="flex items-center gap-1.5">
          {reading.lowConfidence && <LowConfidenceDot />}
          {!isUnconfirmed && !isFlagged && (
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${rangeTone.dot}`}
              title={rangeTone.label}
            />
          )}
          {isFlagged && reading.measuredAt && (
            <span className="text-micro text-ink-subtle font-data whitespace-nowrap">
              {formatDateCompact(reading.measuredAt)}
            </span>
          )}
        </div>
      </div>
      <p
        className={`font-data text-h2-ui font-bold leading-tight ${valueClass}`}
      >
        {reading.numericValue != null
          ? reading.numericValue
          : reading.display.split(' ')[0]}
        {reading.unit && (
          <span className="text-body text-ink-muted font-bold ml-1">
            {reading.unit}
          </span>
        )}
      </p>
      {isUnconfirmed ? (
        <p className="text-caption font-bold inline-flex items-center gap-1 text-amber-700">
          <AlertCircle size={12} strokeWidth={2.5} />
          {isOutOfRange ? 'Возможно вне нормы' : 'Нужно подтвердить'}
        </p>
      ) : (
        <p
          className={`text-caption font-bold inline-flex items-center gap-1 ${rangeTone.text}`}
        >
          {Arrow && <Arrow size={12} strokeWidth={2.5} />}
          {rangeTone.label}
          {isFlagged && (() => {
            const distance = distanceFromRef(reading)
            if (distance == null) return null
            const sign = distance > 0 ? '+' : ''
            return (
              <span className="font-data font-bold text-amber-700/90">
                · {sign}
                {distance.toFixed(1)}
              </span>
            )
          })()}
        </p>
      )}
      {isFlagged && trend && (
        <TrendRow trend={trend} />
      )}
      {reading.ref && (
        <p className="text-caption text-ink-muted font-data leading-snug mt-auto">
          реф · {reading.ref}
        </p>
      )}
    </div>
  )
}

/**
 * Signed distance from the reading to the nearest reference edge it crossed.
 * Positive when above `refMax`, negative when below `refMin`. Returns `null`
 * for in-range or when bounds are missing.
 */
function distanceFromRef(r: MetricReading): number | null {
  if (r.numericValue == null) return null
  if (r.range === 'above' && r.refMax != null) {
    return +(r.numericValue - r.refMax).toFixed(1)
  }
  if (r.range === 'below' && r.refMin != null) {
    return +(r.numericValue - r.refMin).toFixed(1)
  }
  return null
}

function TrendRow({ trend }: { trend: MetricCardTrend }) {
  const Icon =
    trend.direction === 'flat'
      ? Minus
      : trend.direction === 'up'
      ? ArrowUp
      : ArrowDown
  const iconClass =
    trend.trend === 'improved'
      ? 'text-emerald-600'
      : trend.trend === 'worsened'
      ? 'text-rose-600'
      : 'text-ink-muted'
  return (
    <p className="text-caption text-ink-muted font-data leading-snug inline-flex items-center gap-1">
      <Icon size={12} strokeWidth={2.5} className={iconClass} />
      было {trend.previousDisplay} · {formatDateCompact(trend.previousMeasuredAt)}
    </p>
  )
}

/**
 * Shared low-confidence indicator. Amber dot with hover tooltip via
 * `title` attribute — sufficient for the prototype.
 */
export function LowConfidenceDot({ inline = false }: { inline?: boolean }) {
  return (
    <span
      title="Распознано с низкой уверенностью — проверьте оригинал"
      aria-label="Низкая уверенность распознавания"
      className={`inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 ${
        inline ? 'h-4 w-4' : 'h-5 w-5'
      }`}
    >
      <AlertCircle size={inline ? 11 : 13} strokeWidth={2.4} />
    </span>
  )
}
