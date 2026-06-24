import type { ReactNode } from 'react'

export type StatusTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

interface StatusBadgeProps {
  tone: StatusTone
  children: ReactNode
  size?: 'sm' | 'md'
  pulse?: boolean
}

const TONE: Record<StatusTone, string> = {
  success: 'bg-success-bg text-emerald-700',
  warning: 'bg-warning-bg text-amber-700',
  danger: 'bg-danger-bg text-rose-700',
  info: 'bg-cyan-50 text-cyan-600',
  neutral: 'bg-slate-100 text-slate-600',
}

export default function StatusBadge({
  tone,
  children,
  size = 'sm',
  pulse,
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-caps ${
        size === 'sm' ? 'px-2.5 py-1 text-micro' : 'px-3 py-1.5 text-caption'
      } ${TONE[tone]}`}
    >
      {pulse && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
          aria-hidden
        />
      )}
      {children}
    </span>
  )
}
