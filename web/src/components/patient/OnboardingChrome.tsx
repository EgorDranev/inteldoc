import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CoBrandLockup from '../system/CoBrandLockup'

interface OnboardingChromeProps {
  /** Show the back arrow. Hidden on Screen 1 (no exit point). */
  showBack?: boolean
  /** Where to go on back tap. Defaults to history-back. */
  onBack?: () => void
  /**
   * Progress label. Pass undefined on Screen 1 (pre-flow). Format follows the
   * spec: e.g. «Профиль · Шаг 1 из 3» or «Согласия · Последний шаг».
   */
  progressLabel?: string
  /** Current step (1-based). Last step omitted ⇒ no segmented bar shown. */
  step?: number
  totalSteps?: number
  /** When true, render the dark variant for hero screens (e.g. Screen 1). */
  dark?: boolean
}

/**
 * Top chrome for every onboarding screen.
 * - Left: back arrow (conditional)
 * - Centre-left: Эндокор × IntelDoc co-branding pill
 * - Right: spacer (matches back-button width so the pill stays centred-left)
 * - Below: optional segmented progress bar + label
 */
export default function OnboardingChrome({
  showBack = false,
  onBack,
  progressLabel,
  step,
  totalSteps,
  dark = false,
}: OnboardingChromeProps) {
  const nav = useNavigate()
  const txt = dark ? 'text-white' : 'text-ink-strong'
  const subtle = dark ? 'text-slate-300' : 'text-ink-muted'

  return (
    <header className={`px-5 pt-5 pb-3 ${dark ? '' : 'bg-page-bg'}`}>
      <div className="flex items-center">
        {showBack ? (
          <button
            onClick={onBack ?? (() => nav(-1))}
            aria-label="Назад"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
            }`}
          >
            <ArrowLeft size={20} className={txt} strokeWidth={2} />
          </button>
        ) : (
          <div className="h-9 w-9" aria-hidden />
        )}

        <div className="flex-1 flex justify-center">
          <CoBrandLockup variant="pill" size="sm" dark={dark} />
        </div>

        <div className="h-9 w-9" aria-hidden />
      </div>

      {(progressLabel || (step && totalSteps)) && (
        <div className="mt-4 flex flex-col gap-1.5">
          {step && totalSteps && (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => {
                const filled = i < step
                return (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      filled
                        ? dark
                          ? 'bg-cyan-300'
                          : 'bg-cyan-500'
                        : dark
                        ? 'bg-white/15'
                        : 'bg-slate-200'
                    }`}
                  />
                )
              })}
            </div>
          )}
          {progressLabel && (
            <p
              className={`text-caption font-bold uppercase tracking-caps ${subtle}`}
            >
              {progressLabel}
            </p>
          )}
        </div>
      )}
    </header>
  )
}
