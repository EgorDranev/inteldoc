import StatusChip from '../StatusChip'
import type { DepartmentAccess } from '../../store/types'

interface DepartmentAccessRowProps {
  row: DepartmentAccess
}

/**
 * One row in the «Активные доступы по отделениям» list. Aggregate-only —
 * no patient names or ids are ever shown.
 */
export default function DepartmentAccessRow({ row }: DepartmentAccessRowProps) {
  const expiring = row.expiringSoon ?? 0
  const active = row.activeCount ?? 0

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-100"
      aria-label={`${row.department}, активных доступов ${active}, истекают в ближайшие 7 дней — ${expiring}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold text-navy-900 truncate">
          {row.department}
        </p>
        <p className="text-caption text-ink-muted mt-0.5">
          Истекают в ближайшие 7 дней — {expiring}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {expiring > 0 && (
          <StatusChip
            label={`скоро ${expiring}`}
            variant="warning"
            size="sm"
          />
        )}
        <div className="text-right">
          <p className="font-display text-h2-ui font-extrabold leading-none text-navy-900">
            {active}
          </p>
          <p className="text-micro uppercase tracking-caps text-ink-muted mt-1">
            активных
          </p>
        </div>
      </div>
    </div>
  )
}
