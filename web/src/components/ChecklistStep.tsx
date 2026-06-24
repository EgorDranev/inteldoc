interface ChecklistStepProps {
  step: number
  label: string
  done: boolean
  active?: boolean
  locked?: boolean
  onClick?: () => void
}

export default function ChecklistStep({
  step,
  label,
  done,
  active = false,
  locked = false,
  onClick,
}: ChecklistStepProps) {
  return (
    <button
      onClick={!locked && !done ? onClick : undefined}
      disabled={locked}
      className={`w-full flex items-center gap-4 rounded-2xl p-4 text-left transition-all duration-200 ease-out ${
        done
          ? 'bg-success-bg'
          : active
          ? 'bg-cyan-50'
          : locked
          ? 'bg-slate-100 opacity-60'
          : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-body font-bold flex-shrink-0 ${
          done
            ? 'bg-emerald-500 text-white'
            : active
            ? 'bg-cyan-500 text-white'
            : 'bg-slate-200 text-slate-500'
        }`}
      >
        {done ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8L6.5 11.5L13 4.5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          step
        )}
      </div>
      <span
        className={`text-body font-bold flex-1 ${
          done
            ? 'text-emerald-700 line-through decoration-emerald-300'
            : active
            ? 'text-navy-900'
            : 'text-slate-700'
        }`}
      >
        {label}
      </span>
      {!done && !locked && (
        <svg className="w-4 h-4 text-slate-400" viewBox="0 0 16 16" fill="none">
          <path
            d="M6 12L10 8L6 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
