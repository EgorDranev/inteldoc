import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PhoneFrame from '../../../components/patient/PhoneFrame'
import VasilyMascot from '../../../components/system/VasilyMascot'
import Button from '../../../components/primitives/Button'
import { bootstrapPrepHome } from '../../../lib/onboarding-mocks'
import { track } from '../../../lib/analytics'

const MIN_DISPLAY_MS = 1500
const MAX_DISPLAY_MS = 4000

const STEPS = [
  'Сохраняю профиль…',
  'Подключаю клинику…',
  'Открываю главный экран…',
]

/**
 * Transition state — bridges the legal flow and the product surface.
 * Per spec: min 1500 ms display, max 4000 ms before forced advance.
 */
export default function Setup() {
  const nav = useNavigate()
  const enteredAt = useRef(performance.now())
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => {
    track({ name: 'transition_shown' })
    let cancelled = false

    // Cycle the micro-step labels every ~700ms.
    const cycle = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length)
    }, 700)

    async function go() {
      const start = enteredAt.current
      const minWait = new Promise<void>((r) => setTimeout(r, MIN_DISPLAY_MS))
      const forceAdvance = new Promise<'forced'>((r) =>
        setTimeout(() => r('forced'), MAX_DISPLAY_MS),
      )
      const work = bootstrapPrepHome().then(() => 'ok' as const)

      try {
        const winner = await Promise.race([work, forceAdvance])
        await minWait
        if (cancelled) return
        const durationMs = Math.round(performance.now() - start)
        if (winner === 'forced') {
          // Silent log; spec allows this.
          track({ name: 'transition_error', errorCode: 'forced_advance' })
        }
        track({ name: 'transition_completed', durationMs })
        track({ name: 'prep_home_viewed' })
        setAdvancing(true)
        nav('/patient/home', { replace: true })
      } catch (err) {
        if (cancelled) return
        const code = err instanceof Error ? err.message : 'unknown'
        track({ name: 'transition_error', errorCode: code })
        setError('Что-то пошло не так. Попробуем ещё раз?')
      }
    }

    void go()

    return () => {
      cancelled = true
      clearInterval(cycle)
    }
  }, [nav])

  function retry() {
    setError(null)
    enteredAt.current = performance.now()
    // Re-mount by toggling state — easiest way without a router-level reset.
    nav(0)
  }

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
        <VasilyMascot size={140} halo />
        <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500">
          Василий
        </p>
        <h1 className="text-h2-ui font-bold text-ink-strong leading-tight">
          Готовлю ваше пространство…
        </h1>

        {!error ? (
          <>
            {/* Cycling micro-step */}
            <AnimatePresence mode="wait">
              <motion.p
                key={stepIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="text-caption text-ink-muted leading-relaxed"
              >
                {STEPS[stepIndex]}
              </motion.p>
            </AnimatePresence>

            {/* Indeterminate progress dots */}
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-cyan-500"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
            {advancing && (
              <p className="sr-only" role="status">
                Открываем главный экран
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-body text-rose-700 leading-relaxed max-w-[280px]">
              {error}
            </p>
            <Button onClick={retry} size="md">
              Попробовать ещё раз
            </Button>
          </>
        )}
      </div>
    </PhoneFrame>
  )
}
