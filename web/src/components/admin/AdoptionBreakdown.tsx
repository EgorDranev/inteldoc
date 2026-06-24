import { useMemo, useState } from 'react'
import type { AdoptionBreakdownRow } from '../../store/types'

interface AdoptionBreakdownProps {
  byDepartment: AdoptionBreakdownRow[]
  byDoctor: AdoptionBreakdownRow[]
}

type Slice = 'department' | 'doctor'

const SLICE_LABEL: Record<Slice, string> = {
  department: 'По отделениям',
  doctor: 'По врачам',
}

interface DerivedRow extends AdoptionBreakdownRow {
  /** % of invited who reached the granted stage. */
  grantedRate: number
  /** % of granted who reached the prepared stage. */
  prepRate: number
}

/**
 * «Где теряем» block — funnel breakdown with a Slice toggle
 * (department / doctor). Highlights the row with the lowest
 * prep rate as the weak link.
 *
 * Aggregate-only: never renders patient identifiers. Doctor names
 * are clinic staff, not patients.
 */
export default function AdoptionBreakdown({
  byDepartment,
  byDoctor,
}: AdoptionBreakdownProps) {
  const [slice, setSlice] = useState<Slice>('department')

  const rows = slice === 'department' ? byDepartment : byDoctor

  const derived = useMemo<DerivedRow[]>(
    () =>
      rows.map((r) => ({
        ...r,
        grantedRate: r.invited > 0 ? (r.granted / r.invited) * 100 : 0,
        prepRate: r.granted > 0 ? (r.prepared / r.granted) * 100 : 0,
      })),
    [rows],
  )

  const weakestId = useMemo(() => {
    if (derived.length < 2) return null
    let id: string | null = null
    let worst = Infinity
    for (const r of derived) {
      if (r.granted >= 5 && r.prepRate < worst) {
        worst = r.prepRate
        id = r.id
      }
    }
    return id
  }, [derived])

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-sunken p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h3-ui font-extrabold text-navy-900">
            Где теряем
          </h2>
          <p className="text-caption text-ink-muted mt-0.5">
            Воронка в разрезе — проверяйте отстающих
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Срез воронки"
          className="inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200"
        >
          {(['department', 'doctor'] as Slice[]).map((s) => {
            const active = slice === s
            return (
              <button
                key={s}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setSlice(s)}
                className={`px-3 py-1.5 text-caption font-bold rounded-md transition-colors ${
                  active
                    ? 'bg-navy-900 text-white'
                    : 'text-ink-muted hover:text-navy-900'
                }`}
              >
                {SLICE_LABEL[s]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Header row */}
      <div className="hidden md:grid grid-cols-[minmax(0,1.7fr)_minmax(0,2fr)_56px_56px_56px_104px] items-center gap-4 px-4 text-micro uppercase tracking-caps text-ink-muted font-bold">
        <span>{slice === 'department' ? 'Отделение' : 'Врач'}</span>
        <span>Воронка</span>
        <span className="text-right">Пригл.</span>
        <span className="text-right">Доступ</span>
        <span className="text-right">Подгот.</span>
        <span className="text-right">Готовность</span>
      </div>

      <div className="flex flex-col gap-2">
        {derived.length === 0 ? (
          <div className="rounded-xl bg-white px-4 py-6 text-center text-caption text-ink-muted ring-1 ring-slate-100">
            Данных по этому срезу пока нет.
          </div>
        ) : (
          derived.map((r) => {
            const isWeak = r.id === weakestId
            const top = r.invited
            const tiers: Array<{ key: string; count: number; tone: string }> = [
              { key: 'invited', count: r.invited, tone: 'bg-cyan-200' },
              { key: 'installed', count: r.installed, tone: 'bg-cyan-300' },
              { key: 'consented', count: r.consented, tone: 'bg-cyan-400' },
              { key: 'granted', count: r.granted, tone: 'bg-cyan-500' },
              {
                key: 'prepared',
                count: r.prepared,
                tone: isWeak ? 'bg-amber-500' : 'bg-cyan-600',
              },
            ]
            return (
              <div
                key={r.id}
                className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_72px] md:grid-cols-[minmax(0,1.7fr)_minmax(0,2fr)_56px_56px_56px_104px] items-center gap-4 rounded-xl bg-white px-4 py-3 ring-1 transition-colors ${
                  isWeak ? 'ring-amber-200' : 'ring-slate-100'
                }`}
                aria-label={`${r.label}, готовность ${Math.round(
                  r.prepRate,
                )}%${isWeak ? ', слабое звено' : ''}`}
              >
                {/* Label */}
                <div className="min-w-0">
                  <p className="text-body font-bold text-navy-900 truncate">
                    {r.label}
                  </p>
                  {r.sublabel && (
                    <p className="text-caption text-ink-muted mt-0.5 truncate">
                      {r.sublabel}
                    </p>
                  )}
                </div>

                {/* Mini funnel — vertical stack of centered narrowing tiers */}
                <div
                  className="flex flex-col justify-center gap-[3px] h-9"
                  aria-hidden
                >
                  {tiers.map((t) => (
                    <div key={t.key} className="flex justify-center">
                      <div
                        className={`h-[4px] rounded-full ${t.tone}`}
                        style={{
                          width: `${
                            top > 0 ? Math.max((t.count / top) * 100, 3) : 3
                          }%`,
                        }}
                        title={`${t.key}: ${t.count}`}
                      />
                    </div>
                  ))}
                </div>

                {/* Counts */}
                <p className="hidden md:block text-right text-body font-bold text-navy-900 tabular-nums">
                  {r.invited}
                </p>
                <p className="hidden md:block text-right text-body font-bold text-navy-900 tabular-nums">
                  {r.granted}
                </p>
                <p className="hidden md:block text-right text-body font-bold text-navy-900 tabular-nums">
                  {r.prepared}
                </p>

                {/* Prep rate */}
                <div className="text-right">
                  <p
                    className={`font-display text-h3-ui font-extrabold leading-none tabular-nums ${
                      isWeak ? 'text-amber-700' : 'text-navy-900'
                    }`}
                  >
                    {Math.round(r.prepRate)}%
                  </p>
                  <p
                    className={`text-micro uppercase tracking-caps mt-1 whitespace-nowrap ${
                      isWeak ? 'text-amber-700 font-bold' : 'text-ink-muted'
                    }`}
                  >
                    {isWeak ? 'нужна помощь' : 'готовы'}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      <p className="text-caption text-ink-subtle mt-1">
        Срез воронки без идентификации пациентов. «Готовность» — доля визитов
        с завершённой подготовкой.
      </p>
    </div>
  )
}
