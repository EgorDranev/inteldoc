import type { PlanItem } from '../types'
import StatusChip from './StatusChip'

interface PlanItemRowProps {
  item: PlanItem
  onClick?: () => void
}

export default function PlanItemRow({ item, onClick }: PlanItemRowProps) {
  const chipProps =
    item.status === 'done'
      ? { label: 'Выполнено', variant: 'success' as const }
      : item.status === 'overdue'
      ? { label: 'Просрочено', variant: 'error' as const }
      : { label: 'Загрузить', variant: 'warning' as const }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-4 rounded-2xl bg-white p-4 text-left transition-all duration-200 ease-out hover:bg-slate-50"
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          item.status === 'done'
            ? 'bg-emerald-500'
            : item.status === 'overdue'
            ? 'bg-rose-500'
            : 'bg-amber-400'
        }`}
      >
        {item.status === 'done' ? (
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6L5 9L10 3"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="text-white text-caption font-extrabold leading-none">!</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body-lg font-bold text-navy-900 leading-snug">{item.title}</p>
        <p className="text-caption text-slate-500 mt-0.5">{item.dueDate}</p>
        <p className="text-caption text-slate-500 mt-1.5 leading-snug">{item.whyNeeded}</p>
      </div>
      <div className="flex-shrink-0">
        <StatusChip label={chipProps.label} variant={chipProps.variant} />
      </div>
    </button>
  )
}
