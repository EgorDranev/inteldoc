import type { ReactNode } from 'react'

interface VasiliyTipProps {
  /** Short attention-grabbing title — calm, not alarming. */
  title: string
  /** Body copy — consultative only: summaries, clarifications, prep guidance. */
  children: ReactNode
  /** Optional secondary action ("Обсудить", "Подробнее"…). */
  cta?: string
  onCta?: () => void
  /**
   * Visual emphasis. `bubble` shows Vasiliy beside a chat-bubble (used as a
   * primary moment on prep-home). `inline` is a compact tip-card with a
   * small mascot avatar (used inside dense screens like OCR review).
   */
  variant?: 'bubble' | 'inline'
}

/**
 * Card that surfaces Vasiliy's consultative guidance.
 * Per CLAUDE.md the AI must remain consultative-only — never diagnostic.
 * Always renders the disclaimer line so it's visible everywhere Vasiliy speaks.
 */
export default function VasiliyTip({
  title,
  children,
  cta,
  onCta,
  variant = 'inline',
}: VasiliyTipProps) {
  if (variant === 'bubble') {
    return (
      <div className="relative rounded-2xl bg-white p-5 pb-4">
        <div className="flex items-end gap-3">
          <img
            src="/vasiliy.png"
            alt=""
            aria-hidden
            className="h-24 w-auto flex-shrink-0 -mb-1 select-none pointer-events-none"
            draggable={false}
          />
          <div className="flex-1 min-w-0 pb-2">
            <p className="text-micro font-bold tracking-caps uppercase text-cyan-500 mb-1">
              Василий · помощник
            </p>
            <p className="text-body-lg font-bold text-navy-900 leading-snug mb-1">
              {title}
            </p>
            <div className="text-caption text-slate-700 leading-relaxed">
              {children}
            </div>
          </div>
        </div>
        {cta && (
          <button
            onClick={onCta}
            className="mt-3 inline-flex items-center gap-1 text-caption font-bold tracking-caps uppercase text-cyan-500"
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
        <p className="mt-3 text-micro text-slate-400 leading-snug">
          Это не заменяет консультацию врача.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex gap-3">
        <div
          aria-hidden
          className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0 overflow-hidden"
        >
          <img
            src="/vasiliy.png"
            alt=""
            className="h-12 w-auto -mb-1 select-none pointer-events-none"
            draggable={false}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-micro font-bold tracking-caps uppercase text-cyan-500">
            Василий
          </p>
          <p className="text-body font-bold text-navy-900 leading-snug mt-0.5">
            {title}
          </p>
          <div className="text-caption text-slate-700 leading-relaxed mt-1">
            {children}
          </div>
          {cta && (
            <button
              onClick={onCta}
              className="mt-2.5 inline-flex items-center gap-1 text-caption font-bold tracking-caps uppercase text-cyan-500"
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
        </div>
      </div>
      <p className="mt-3 text-micro text-slate-400 leading-snug">
        Это не заменяет консультацию врача.
      </p>
    </div>
  )
}
