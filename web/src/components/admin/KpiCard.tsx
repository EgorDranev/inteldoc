import type { ReactNode } from 'react'
import type { KpiId } from '../../store/types'

interface KpiCardProps {
  kpiId: KpiId
  title: string
  value: number | null | undefined
  unit?: string
  helper?: string
  onClick?: () => void
  children?: ReactNode
}

/**
 * One KPI tile. Read-only; tapping navigates to the drill-down placeholder.
 *
 * Defensive read: missing value renders «—» rather than 0%.
 */
export default function KpiCard({
  kpiId,
  title,
  value,
  unit = '%',
  helper,
  onClick,
  children,
}: KpiCardProps) {
  const display =
    value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}${unit}`

  return (
    <button
      type="button"
      onClick={onClick}
      data-kpi={kpiId}
      className="group flex flex-col items-stretch gap-3 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-100 transition-all hover:ring-cyan-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-bold uppercase tracking-caps text-ink-muted">
          {title}
        </p>
        <span
          aria-hidden
          className="h-2 w-2 rounded-full bg-cyan-500"
        />
      </div>
      <p className="font-display text-[36px] font-extrabold leading-none text-navy-900">
        {display}
      </p>
      {helper && (
        <p className="text-caption text-ink-muted leading-snug">{helper}</p>
      )}
      {children}
    </button>
  )
}
