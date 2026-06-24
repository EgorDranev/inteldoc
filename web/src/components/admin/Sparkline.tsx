import { useMemo, useState } from 'react'
import { formatDateCompact } from '../../lib/formatters'

export interface SparklinePoint {
  date: string
  value: number
}

interface SparklineProps {
  points: SparklinePoint[]
  width?: number
  height?: number
  strokeColor?: string
  ariaLabel?: string
}

/**
 * Tiny inline-SVG sparkline. No chart library — keeps the bundle clean.
 * Hover/focus on a point reveals a tooltip («12 апр — 71%»).
 *
 * Renders nothing meaningful for fewer than two valid points; callers
 * should render an empty-state in that case.
 */
export default function Sparkline({
  points,
  width = 280,
  height = 64,
  strokeColor = '#2563EB',
  ariaLabel,
}: SparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const sanitized = useMemo(
    () =>
      points
        .filter(
          (p) =>
            typeof p.value === 'number' &&
            Number.isFinite(p.value) &&
            p.value >= 0 &&
            p.value <= 100,
        )
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [points],
  )

  const padX = 6
  const padY = 8
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const { min, max } = useMemo(() => {
    if (sanitized.length === 0) return { min: 0, max: 100 }
    const vs = sanitized.map((p) => p.value)
    const mn = Math.min(...vs)
    const mx = Math.max(...vs)
    // Add a small visual buffer so a flat line doesn't sit on the axis.
    return { min: Math.max(0, mn - 2), max: Math.min(100, mx + 2) }
  }, [sanitized])

  const span = max - min || 1

  const coords = useMemo(() => {
    if (sanitized.length < 2) return []
    return sanitized.map((p, i) => {
      const x =
        sanitized.length === 1
          ? padX + innerW / 2
          : padX + (i / (sanitized.length - 1)) * innerW
      const y = padY + (1 - (p.value - min) / span) * innerH
      return { x, y, p }
    })
  }, [sanitized, innerW, innerH, min, span])

  const pathD = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ')

  const last = coords[coords.length - 1]
  const hovered = hoverIdx != null ? coords[hoverIdx] : null

  return (
    <div
      className="relative"
      style={{ width, height }}
      role="img"
      aria-label={
        ariaLabel ??
        (sanitized.length >= 2
          ? `Тренд: от ${sanitized[0].value}% до ${sanitized[sanitized.length - 1].value}%`
          : 'Недостаточно данных для тренда')
      }
    >
      <svg width={width} height={height} className="block">
        {coords.length >= 2 && (
          <>
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Last-point dot */}
            {last && (
              <circle
                cx={last.x}
                cy={last.y}
                r={3}
                fill={strokeColor}
                stroke="#fff"
                strokeWidth={1.5}
              />
            )}
            {/* Invisible hit targets per point */}
            {coords.map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={Math.max(8, innerW / coords.length / 2)}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx(null)}
                tabIndex={0}
                role="button"
                aria-label={`${formatDateCompact(c.p.date)} — ${c.p.value}%`}
              />
            ))}
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-navy-900 px-2 py-1 text-caption font-bold text-white shadow-md"
          style={{ left: hovered.x, top: hovered.y - 4 }}
        >
          {formatDateCompact(hovered.p.date)} — {hovered.p.value}%
        </div>
      )}
    </div>
  )
}
