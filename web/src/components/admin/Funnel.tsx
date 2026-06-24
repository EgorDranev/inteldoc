import { useMemo } from 'react'
import type { FunnelStage } from '../../store/types'

interface FunnelProps {
  stages: FunnelStage[]
  /** Optional title shown above the funnel. */
  title?: string
}

interface StageDerived {
  stage: FunnelStage
  /** % vs the first stage (cohort share). */
  cohortShare: number
  /** % conversion vs the previous stage; null on the first stage. */
  stepConversion: number | null
  /** Drop in absolute count vs the previous stage; 0 on the first stage. */
  drop: number
  /** True for the stage with the worst step conversion (the weak link). */
  isWeakLink: boolean
}

/**
 * Adoption funnel — five stages of the pilot, narrowest-last.
 * Hero block on the admin overview.
 *
 * Bar width is proportional to the cohort share (count / first-stage count),
 * not the conversion percentage, so the visual reads as a real funnel.
 * The stage with the lowest step conversion is flagged as «слабое звено».
 *
 * Aggregate-only: never renders patient identifiers.
 */
export default function Funnel({ stages, title }: FunnelProps) {
  const derived = useMemo<StageDerived[]>(() => {
    if (stages.length === 0) return []
    const top = stages[0]?.count ?? 0
    if (top <= 0) {
      return stages.map((s) => ({
        stage: s,
        cohortShare: 0,
        stepConversion: null,
        drop: 0,
        isWeakLink: false,
      }))
    }

    // First pass: compute conversion to find the weak link.
    const conversions = stages.map((s, i) => {
      if (i === 0) return null
      const prev = stages[i - 1]?.count ?? 0
      if (prev <= 0) return null
      return (s.count / prev) * 100
    })

    let weakIdx = -1
    let weakValue = Infinity
    conversions.forEach((c, i) => {
      if (c == null) return
      if (c < weakValue) {
        weakValue = c
        weakIdx = i
      }
    })

    return stages.map((s, i) => ({
      stage: s,
      cohortShare: (s.count / top) * 100,
      stepConversion: conversions[i],
      drop: i === 0 ? 0 : (stages[i - 1]?.count ?? 0) - s.count,
      isWeakLink: i === weakIdx,
    }))
  }, [stages])

  if (derived.length === 0) {
    return (
      <div className="rounded-xl bg-white px-4 py-6 text-center text-caption text-ink-muted ring-1 ring-slate-100">
        Воронка пока пуста — данных недостаточно.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {title && (
        <h2 className="text-h3-ui font-extrabold text-navy-900">{title}</h2>
      )}
      <ol className="flex flex-col gap-2" aria-label="Этапы воронки внедрения">
        {derived.map((d) => (
          <li
            key={d.stage.id}
            className="grid grid-cols-[200px_1fr_auto] items-center gap-4 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-100"
            aria-label={`${d.stage.label}: ${d.stage.count}${
              d.stepConversion != null
                ? `, конверсия ${Math.round(d.stepConversion)}% от предыдущего этапа`
                : ''
            }`}
          >
            {/* Stage label */}
            <div className="min-w-0">
              <p className="text-body font-bold text-navy-900 truncate">
                {d.stage.label}
              </p>
              <p className="text-caption text-ink-muted mt-0.5">
                {Math.round(d.cohortShare)}% от приглашённых
              </p>
            </div>

            {/* Bar */}
            <div className="relative h-9 rounded-lg bg-slate-100 overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-lg transition-all ${
                  d.isWeakLink
                    ? 'bg-amber-200/80'
                    : 'bg-cyan-500/85'
                }`}
                style={{ width: `${Math.max(d.cohortShare, 4)}%` }}
                aria-hidden
              />
              <div className="relative flex h-full items-center justify-between px-3">
                {d.stepConversion != null ? (
                  <span
                    className={`text-caption font-bold ${
                      d.isWeakLink ? 'text-amber-900' : 'text-white'
                    }`}
                  >
                    {Math.round(d.stepConversion)}% дошли
                  </span>
                ) : (
                  <span className="text-caption font-bold text-white">
                    Старт воронки
                  </span>
                )}
                {d.isWeakLink && (
                  <span className="text-caption font-bold uppercase tracking-caps text-amber-900">
                    Слабое звено · −{d.drop}
                  </span>
                )}
              </div>
            </div>

            {/* Count */}
            <div className="text-right min-w-[64px]">
              <p className="font-display text-[22px] font-extrabold leading-none text-navy-900">
                {d.stage.count}
              </p>
              <p className="text-micro uppercase tracking-caps text-ink-muted mt-1">
                пациентов
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
