import type { ReactNode } from 'react'

interface ActionCardProps {
  icon: ReactNode
  title: string
  description?: string
  onClick?: () => void
  badge?: ReactNode
  highlight?: boolean
}

export default function ActionCard({
  icon,
  title,
  description,
  onClick,
  badge,
  highlight = false,
}: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 rounded-2xl p-4 text-left transition-all duration-200 ease-out active:scale-[0.98] ${
        highlight
          ? 'bg-cyan-500 text-white shadow-lg'
          : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
          highlight ? 'bg-white/20' : 'bg-cyan-50'
        }`}
      >
        <span className={highlight ? 'text-white' : 'text-cyan-500'}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-body-lg font-bold leading-snug ${
            highlight ? 'text-white' : 'text-navy-900'
          }`}
        >
          {title}
        </p>
        {description && (
          <p
            className={`text-caption mt-0.5 leading-snug ${
              highlight ? 'text-cyan-50/90' : 'text-slate-500'
            }`}
          >
            {description}
          </p>
        )}
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
      <svg
        className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-white/80' : 'text-slate-400'}`}
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M6 12L10 8L6 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
