import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, AlertTriangle, RotateCw } from 'lucide-react'
import Button from '../primitives/Button'

export type QualityIssue = 'glare' | 'blur' | 'crop'

interface QualityCheckProps {
  /** When provided, shows the failure variant for this issue. */
  issue?: QualityIssue | null
  /** Called when all checks pass and the flow should advance. */
  onPass: () => void
  /** Called when the user chooses to retake the photo. */
  onRetake: () => void
  /** Called when the user accepts a flagged image as-is. */
  onUseAnyway: () => void
}

interface CheckSpec {
  key: string
  label: string
}

const CHECKS: CheckSpec[] = [
  { key: 'frame', label: 'Бланк целиком в кадре' },
  { key: 'glare', label: 'Без бликов и засветки' },
  { key: 'sharp', label: 'Текст резкий и читаемый' },
]

const ISSUE_COPY: Record<
  QualityIssue,
  { title: string; detail: string; failedKey: string }
> = {
  glare: {
    title: 'Засветка в правом верхнем углу',
    detail:
      'Часть значений может быть распознана неточно. Лучше переснять при ровном освещении.',
    failedKey: 'glare',
  },
  blur: {
    title: 'Изображение немного размыто',
    detail:
      'Поднесите камеру ближе и подождите фокусировку. Так Василий точнее распознает значения.',
    failedKey: 'sharp',
  },
  crop: {
    title: 'Бланк обрезан по нижнему краю',
    detail:
      'Похоже, в кадр попала не вся страница. Переснимите так, чтобы рамка охватывала бланк целиком.',
    failedKey: 'frame',
  },
}

export default function QualityCheck({
  issue = null,
  onPass,
  onRetake,
  onUseAnyway,
}: QualityCheckProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step >= CHECKS.length) return
    const t = setTimeout(() => setStep((s) => s + 1), 480)
    return () => clearTimeout(t)
  }, [step])

  // Hold the latest onPass in a ref so it stays out of the auto-pass effect's
  // deps — a new callback identity from the parent must not re-run that effect
  // and tear down the pending timer.
  const onPassRef = useRef(onPass)
  useEffect(() => {
    onPassRef.current = onPass
  })

  // Auto-advance when every check passes with no issue. Deps are [step, issue]
  // only and neither changes between arming and firing, so the 520 ms timer is
  // never torn down early. The earlier version flipped a `resolved` state inside
  // this effect while `resolved` sat in its own deps; the resulting re-render
  // ran the cleanup and cancelled the timer, so the clean-photo path hung here
  // forever. No run-once latch is needed — setTimeout/clearTimeout is idempotent
  // (a re-arm just fires onPass once) and the parent's setStage('ocr') is too.
  useEffect(() => {
    if (step < CHECKS.length || issue) return
    const t = setTimeout(() => onPassRef.current(), 520)
    return () => clearTimeout(t)
  }, [step, issue])

  const failedKey = issue ? ISSUE_COPY[issue].failedKey : null
  const allDone = step >= CHECKS.length

  return (
    <div className="flex-1 flex flex-col px-5 pt-2 pb-8">
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500">
          Проверка качества
        </p>
        <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
          {!allDone
            ? 'Проверяем снимок…'
            : issue
            ? 'Нашли проблему'
            : 'Снимок готов к распознаванию'}
        </h1>
        <p className="text-caption text-ink-muted leading-relaxed">
          {!allDone
            ? 'Это занимает пару секунд. Можно не переснимать, если всё в порядке.'
            : issue
            ? 'Можно переснять для точного распознавания или использовать как есть.'
            : 'Все проверки прошли успешно. Передаю Василию.'}
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {CHECKS.map((c, i) => {
          const passed = step > i
          const failed = passed && failedKey === c.key && allDone
          const active = step === i
          return (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border ${
                failed
                  ? 'bg-amber-50 border-amber-200'
                  : passed
                  ? 'bg-emerald-50/60 border-emerald-100'
                  : active
                  ? 'bg-surface-sunken border-slate-200'
                  : 'bg-surface-sunken border-transparent'
              }`}
            >
              <CheckIndicator
                state={
                  failed
                    ? 'failed'
                    : passed
                    ? 'passed'
                    : active
                    ? 'active'
                    : 'pending'
                }
              />
              <p
                className={`text-[14px] font-semibold ${
                  failed
                    ? 'text-amber-800'
                    : passed
                    ? 'text-ink-strong'
                    : 'text-ink'
                }`}
              >
                {c.label}
              </p>
            </motion.div>
          )
        })}
      </div>

      {issue && allDone && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-3"
        >
          <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} strokeWidth={2.4} />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-[13px] font-bold text-amber-900">
              {ISSUE_COPY[issue].title}
            </p>
            <p className="text-caption text-amber-900/80 leading-snug">
              {ISSUE_COPY[issue].detail}
            </p>
          </div>
        </motion.div>
      )}

      <div className="flex-1" />

      {issue && allDone && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="flex flex-col gap-2 pt-4"
        >
          <Button full onClick={onRetake} icon={<RotateCw size={18} strokeWidth={2.2} />}>
            Переснять
          </Button>
          <Button full variant="secondary" onClick={onUseAnyway}>
            Использовать как есть
          </Button>
        </motion.div>
      )}
    </div>
  )
}

function CheckIndicator({
  state,
}: {
  state: 'pending' | 'active' | 'passed' | 'failed'
}) {
  if (state === 'passed') {
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="h-7 w-7 rounded-full bg-emerald-500 text-white flex items-center justify-center"
      >
        <Check size={16} strokeWidth={2.8} />
      </motion.div>
    )
  }
  if (state === 'failed') {
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.22 }}
        className="h-7 w-7 rounded-full bg-amber-500 text-white flex items-center justify-center"
      >
        <AlertTriangle size={14} strokeWidth={2.6} />
      </motion.div>
    )
  }
  if (state === 'active') {
    return (
      <div className="h-7 w-7 rounded-full border-[2.5px] border-slate-200 border-t-cyan-500 animate-spin" />
    )
  }
  return <div className="h-7 w-7 rounded-full border-2 border-slate-200" />
}
