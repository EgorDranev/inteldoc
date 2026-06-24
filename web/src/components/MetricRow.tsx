import type { MetricValue } from '../types'

interface MetricRowProps {
  metric: MetricValue
  editable?: boolean
  onValueChange?: (val: string) => void
}

export default function MetricRow({ metric, editable = false, onValueChange }: MetricRowProps) {
  const flagColor =
    metric.flag === 'high'
      ? 'text-amber-600'
      : metric.flag === 'low'
      ? 'text-rose-600'
      : 'text-emerald-600'

  const flagLabel =
    metric.flag === 'high' ? 'Выше нормы' : metric.flag === 'low' ? 'Ниже нормы' : 'В норме'

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-body font-bold text-navy-900">{metric.parameter}</p>
          {metric.confidence === 'low' && (
            <span className="inline-flex items-center rounded-full bg-warning-bg text-amber-700 px-2 py-0.5 text-micro font-bold tracking-caps uppercase">
              Проверьте
            </span>
          )}
        </div>
        <p className="text-caption text-slate-500 mt-0.5">
          Норма: {metric.referenceRange} {metric.unit}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        {editable ? (
          <input
            type="text"
            defaultValue={String(metric.value)}
            onChange={(e) => onValueChange?.(e.target.value)}
            className="w-24 text-right text-body-lg font-bold font-data rounded-lg bg-white px-3 py-1.5 shadow-[inset_0_0_0_1.5px_var(--blue-300)] focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--blue-600)]"
          />
        ) : (
          <p className={`text-body-lg font-bold font-data ${flagColor}`}>
            {metric.value} {metric.unit}
          </p>
        )}
        <p className={`text-caption mt-0.5 font-bold ${flagColor}`}>{flagLabel}</p>
      </div>
    </div>
  )
}
