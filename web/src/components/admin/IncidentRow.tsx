import { ShieldOff, Clock } from 'lucide-react'
import type { AccessIncidentBucket } from '../../store/types'
import { formatDateTime } from '../../lib/formatters'

interface IncidentRowProps {
  incident: AccessIncidentBucket
  /** Anomaly threshold — counts at or above are softly highlighted in amber. */
  anomalyThreshold?: number
}

const TYPE_META: Record<
  AccessIncidentBucket['type'],
  { title: string; Icon: typeof ShieldOff }
> = {
  revoked: { title: 'Доступ отозван', Icon: ShieldOff },
  expired: { title: 'Срок доступа истёк', Icon: Clock },
}

/**
 * Aggregate row for one incident bucket. Count + last-event time only —
 * never per-patient detail.
 */
export default function IncidentRow({
  incident,
  anomalyThreshold = 5,
}: IncidentRowProps) {
  const meta = TYPE_META[incident.type]
  if (!meta) return null

  const count = incident.count ?? 0
  const isAnomaly = count >= anomalyThreshold
  const { Icon, title } = meta

  return (
    <div
      className={`flex items-center gap-4 rounded-xl px-4 py-3 ring-1 transition-colors ${
        isAnomaly
          ? 'bg-amber-50 ring-amber-200'
          : 'bg-white ring-slate-100'
      }`}
    >
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
          isAnomaly ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
        }`}
        aria-hidden
      >
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold text-navy-900">{title}</p>
        <p className="text-caption text-ink-muted mt-0.5">
          Последнее событие: {formatDateTime(incident.lastEventAt)}
        </p>
        {isAnomaly && (
          <p className="text-caption font-bold text-amber-700 mt-1">
            Возможна аномалия — проверьте
          </p>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="font-display text-h2-ui font-extrabold leading-none text-navy-900">
          {count}
        </p>
        <p className="text-micro uppercase tracking-caps text-ink-muted mt-1">
          за 72 ч
        </p>
      </div>
    </div>
  )
}
