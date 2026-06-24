interface AppointmentCardProps {
  doctor: string
  department: string
  date: string
  time: string
  format: string
  confirmed?: boolean
}

export default function AppointmentCard({
  doctor,
  department,
  date,
  time,
  format,
  confirmed = false,
}: AppointmentCardProps) {
  return (
    <div
      className={`rounded-2xl p-5 ${
        confirmed ? 'bg-success-bg' : 'bg-cyan-500 shadow-lg'
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
            confirmed ? 'bg-emerald-100' : 'bg-white/20'
          }`}
        >
          <svg
            className={confirmed ? 'text-emerald-600' : 'text-white'}
            width="22"
            height="22"
            viewBox="0 0 20 20"
            fill="none"
          >
            <rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 2V5M13 2V5M3 8H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p
            className={`text-micro font-bold uppercase tracking-caps ${
              confirmed ? 'text-emerald-700' : 'text-white/80'
            }`}
          >
            {confirmed ? 'Подтверждён' : 'Следующий приём'}
          </p>
          <p
            className={`text-h3-ui font-bold leading-tight font-data mt-0.5 ${
              confirmed ? 'text-emerald-900' : 'text-white'
            }`}
          >
            {date} · {time}
          </p>
        </div>
      </div>
      <div
        className={`space-y-2 pt-3 ${
          confirmed
            ? 'border-t border-emerald-200/60'
            : 'border-t border-white/15'
        }`}
      >
        {[
          { k: 'Врач', v: doctor },
          { k: 'Отделение', v: department },
          { k: 'Формат', v: format },
        ].map((row) => (
          <div key={row.k} className="flex justify-between gap-3 text-caption">
            <span className={confirmed ? 'text-slate-500' : 'text-white/70'}>
              {row.k}
            </span>
            <span
              className={`font-bold text-right max-w-[60%] ${
                confirmed ? 'text-navy-900' : 'text-white'
              }`}
            >
              {row.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
