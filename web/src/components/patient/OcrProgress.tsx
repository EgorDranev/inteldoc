import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ScanLine, ListChecks, Ruler } from 'lucide-react'
import VasilyMascot from '../system/VasilyMascot'

interface OcrProgressProps {
  /** Called once all visible steps complete. Parent should wait on its own
   *  data work as well — both should resolve before advancing. */
  onComplete: () => void
  /** Per-step duration in ms. */
  stepMs?: number
}

interface Step {
  key: string
  label: string
  Icon: typeof ScanLine
}

const STEPS: Step[] = [
  { key: 'read', label: 'Читаю бланк', Icon: ScanLine },
  { key: 'find', label: 'Нахожу показатели', Icon: ListChecks },
  { key: 'units', label: 'Сверяю единицы измерения', Icon: Ruler },
]

export default function OcrProgress({ onComplete, stepMs = 620 }: OcrProgressProps) {
  const [active, setActive] = useState(0)

  // Keep onComplete out of the step effect's deps. The parent (UploadFlow)
  // passes a fresh inline arrow on every render and re-renders mid-OCR (its own
  // uploadAnalysis() resolution sets state); if onComplete were a dep, each such
  // re-render would tear down and re-arm the in-flight step timer, and if those
  // re-renders outpaced stepMs the steps would never advance — the OCR screen
  // would stall. The step chain itself depends on `active` (intended: each tick
  // sets the next step, re-running the effect to arm the next timer).
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  })

  useEffect(() => {
    if (active >= STEPS.length) {
      const t = setTimeout(() => onCompleteRef.current(), 360)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setActive((a) => a + 1), stepMs)
    return () => clearTimeout(t)
  }, [active, stepMs])

  return (
    <div className="flex-1 flex flex-col px-5 pt-2 pb-8">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <VasilyMascot size={108} halo />
        <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500">
          Василий
        </p>
        <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
          Распознаю значения
        </h1>
        <p className="text-caption text-ink-muted leading-relaxed max-w-[300px]">
          Это занимает несколько секунд. Можно не ждать — карта откроется сама.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {STEPS.map((s, i) => {
          const done = active > i
          const isActive = active === i
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border ${
                done
                  ? 'bg-emerald-50/60 border-emerald-100'
                  : isActive
                  ? 'bg-cyan-50 border-cyan-100'
                  : 'bg-surface-sunken border-transparent'
              }`}
            >
              <StepIndicator
                state={done ? 'done' : isActive ? 'active' : 'pending'}
                Icon={s.Icon}
              />
              <p
                className={`text-[14px] font-semibold ${
                  done ? 'text-ink-strong' : isActive ? 'text-cyan-700' : 'text-ink'
                }`}
              >
                {s.label}
              </p>
              {isActive && (
                <motion.span
                  className="ml-auto flex gap-1"
                  aria-hidden
                >
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-1.5 w-1.5 rounded-full bg-cyan-500"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        delay: d * 0.15,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </motion.span>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function StepIndicator({
  state,
  Icon,
}: {
  state: 'pending' | 'active' | 'done'
  Icon: typeof ScanLine
}) {
  if (state === 'done') {
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="h-9 w-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0"
      >
        <Check size={18} strokeWidth={2.6} />
      </motion.div>
    )
  }
  if (state === 'active') {
    return (
      <div className="h-9 w-9 rounded-xl bg-cyan-500 text-white flex items-center justify-center shrink-0">
        <Icon size={18} strokeWidth={2.2} />
      </div>
    )
  }
  return (
    <div className="h-9 w-9 rounded-xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
      <Icon size={18} strokeWidth={2} />
    </div>
  )
}
