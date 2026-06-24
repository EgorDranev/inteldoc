import type { ReactNode, CSSProperties } from 'react'

interface CardProps {
  title?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  style?: CSSProperties
  /** Drop the slate-050 fill (used when the parent already provides bg). */
  unstyled?: boolean
  onClick?: () => void
}

export default function Card({
  title,
  action,
  children,
  className = '',
  style,
  unstyled = false,
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`flex flex-col gap-3 rounded-2xl p-5 ${
        unstyled ? '' : 'bg-surface-sunken'
      } ${onClick ? 'cursor-pointer transition-colors hover:bg-cyan-50' : ''} ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <div className="text-body-lg font-bold leading-snug text-ink-strong">
              {title}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
