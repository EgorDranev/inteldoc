interface PartnerHeaderProps {
  onBack?: () => void
  showBack?: boolean
  light?: boolean
  title?: string
}

export default function PartnerHeader({
  onBack,
  showBack = false,
  light = false,
  title,
}: PartnerHeaderProps) {
  return (
    <div
      className={`flex items-center px-5 pt-5 pb-4 gap-3 ${
        light ? 'bg-white border-b border-slate-100' : 'bg-navy-900'
      }`}
    >
      {showBack && (
        <button
          onClick={onBack}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
            light
              ? 'text-navy-900 hover:bg-slate-100'
              : 'text-white hover:bg-navy-800'
          }`}
          aria-label="Назад"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.5 15L7.5 10L12.5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className="flex items-center gap-2 flex-1">
        <div className="w-7 h-7 rounded-md bg-cyan-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-caption font-extrabold leading-none">Э</span>
        </div>
        <span
          className={`text-body font-bold tracking-ui ${
            light ? 'text-navy-900' : 'text-white'
          }`}
        >
          {title ?? 'Эндокор'}
        </span>
      </div>
    </div>
  )
}
