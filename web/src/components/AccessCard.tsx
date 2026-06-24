import StatusChip from './StatusChip'

interface AccessCardProps {
  recipient: string
  type: string
  grantedOn: string
  expiresOn: string
  status: 'active' | 'expired'
  viewedBy?: string
  lastViewed?: string
}

export default function AccessCard({
  recipient,
  type,
  grantedOn,
  expiresOn,
  status,
  viewedBy,
  lastViewed,
}: AccessCardProps) {
  const active = status === 'active'
  return (
    <div className={`rounded-2xl p-5 ${active ? 'bg-success-bg' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-body-lg font-bold text-navy-900 leading-snug">
          {recipient}
        </p>
        <StatusChip
          label={active ? 'Активен' : 'Истёк'}
          variant={active ? 'success' : 'neutral'}
        />
      </div>
      <p className="text-caption text-slate-500 mb-4">{type}</p>
      <div className="space-y-2">
        <div className="flex justify-between text-caption">
          <span className="text-slate-500">Выдан</span>
          <span className="text-slate-700 font-bold font-data">{grantedOn}</span>
        </div>
        <div className="flex justify-between text-caption">
          <span className="text-slate-500">Действует до</span>
          <span
            className={`font-bold font-data ${
              active ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {expiresOn}
          </span>
        </div>
        {viewedBy && (
          <div
            className={`flex justify-between text-caption pt-2 mt-2 border-t ${
              active ? 'border-emerald-200/60' : 'border-slate-200'
            }`}
          >
            <span className="text-slate-500">{viewedBy}</span>
            <span className="text-slate-700">{lastViewed}</span>
          </div>
        )}
      </div>
    </div>
  )
}
