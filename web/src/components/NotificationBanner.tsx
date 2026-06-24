type NotifType = 'info' | 'action' | 'reminder' | 'success'

interface NotificationBannerProps {
  type: NotifType
  title: string
  body: string
  cta?: string
  onCta?: () => void
  /** Optional second CTA — rendered as a muted text link next to the primary. */
  secondaryCta?: string
  onSecondaryCta?: () => void
}

const typeStyles: Record<
  NotifType,
  { bg: string; titleColor: string; ctaColor: string }
> = {
  info: { bg: 'bg-cyan-50', titleColor: 'text-cyan-700', ctaColor: 'text-cyan-600' },
  action: { bg: 'bg-warning-bg', titleColor: 'text-amber-800', ctaColor: 'text-amber-700' },
  reminder: { bg: 'bg-cyan-50', titleColor: 'text-navy-900', ctaColor: 'text-cyan-500' },
  success: { bg: 'bg-success-bg', titleColor: 'text-emerald-800', ctaColor: 'text-emerald-700' },
}

export default function NotificationBanner({
  type,
  title,
  body,
  cta,
  onCta,
  secondaryCta,
  onSecondaryCta,
}: NotificationBannerProps) {
  const s = typeStyles[type]
  return (
    <div className={`rounded-2xl p-4 ${s.bg}`}>
      <p className={`text-body-lg font-bold mb-1 ${s.titleColor}`}>{title}</p>
      <p className="text-caption text-slate-700 leading-relaxed">{body}</p>
      {(cta || secondaryCta) && (
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          {cta && (
            <button
              onClick={onCta}
              className={`inline-flex items-center gap-1 text-caption font-bold tracking-caps uppercase ${s.ctaColor}`}
            >
              {cta}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 12L10 8L6 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {secondaryCta && (
            <button
              onClick={onSecondaryCta}
              className={`inline-flex items-center gap-1 text-caption font-bold tracking-caps uppercase ${s.ctaColor}`}
            >
              {secondaryCta}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 12L10 8L6 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
