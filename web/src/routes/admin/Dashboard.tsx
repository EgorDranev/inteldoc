import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Clock, ShieldOff, Target } from 'lucide-react'
import CockpitShell from '../../components/doctor/CockpitShell'
import Sparkline from '../../components/admin/Sparkline'
import Funnel from '../../components/admin/Funnel'
import AdoptionBreakdown from '../../components/admin/AdoptionBreakdown'
import { useInteldoc } from '../../store/store'
import {
  selectAdminAccessPanel,
  selectComputedComplianceState,
  selectKpiTrend,
} from '../../store/selectors'
import { hydrateAdmin } from '../../store/actions'
import { formatDateTime } from '../../lib/formatters'
import { toast } from '../../lib/toast'

/**
 * ADM-E01: pilot overview, JTBD-driven IA.
 *
 * Reads top-down for a partner-clinic admin:
 *  1. «Идём ли к цели?» — goal progress in the header.
 *  2. «Идёт ли внедрение?» — adoption funnel (hero).
 *  3. «Где теряем?» — funnel breakdown by department / doctor.
 *  4. «Работает ли продукт?» — prep rate with trend + outliers.
 *  5. «Безопасно и аудит-готово?» — accesses + recent incidents.
 *  6. System health (OCR, compliance) is demoted to a footer pill.
 *
 * AGGREGATE-ONLY surface. No PII, no patient names, no analysis values.
 */
export default function AdminDashboard() {
  const nav = useNavigate()

  // BACKEND_MODE: pull the live PII-blind aggregates into the store once; the
  // selectors below then render backend data unchanged. No-op on the mock path.
  useEffect(() => {
    void hydrateAdmin()
  }, [])

  const kpis = useInteldoc((s) => s.pilotKpis)
  const goal = useInteldoc((s) => s.pilotGoal)
  const periodLabel = kpis?.periodLabel ?? 'Пилот Эндокор'

  const funnel = useInteldoc(useShallow((s) => s.funnel ?? []))
  const adoptionByDepartment = useInteldoc(
    useShallow((s) => s.adoptionByDepartment ?? []),
  )
  const adoptionByDoctor = useInteldoc(
    useShallow((s) => s.adoptionByDoctor ?? []),
  )

  const prepTrend = useInteldoc(
    useShallow((s) => selectKpiTrend(s, 'prepRate')),
  )

  // «Доступы и инциденты» panel reads live: pilot-wide seed baseline layered
  // with the in-session delta from the audited 20-grant set, so a revoke /
  // extend in A02 ticks these numbers immediately while the funnel/adoption
  // KPIs stay seeded.
  const access = useInteldoc(useShallow(selectAdminAccessPanel))
  const incidents = useInteldoc(useShallow((s) => s.accessIncidents ?? []))
  const complianceState = useInteldoc(selectComputedComplianceState)

  const totalActive = access.activeTotal
  const totalExpiring = access.expiringSoon

  // ─── Goal progress ────────────────────────────────────────────────────────
  const granted = funnel.find((f) => f.id === 'granted')?.count ?? totalActive
  const goalPercent = goal?.targetOnboarded
    ? Math.min(100, Math.round((granted / goal.targetOnboarded) * 100))
    : 0
  const daysToGoal = useMemo(() => {
    if (!goal?.targetDate || !kpis?.asOf) return null
    const target = new Date(goal.targetDate).getTime()
    const now = new Date(kpis.asOf).getTime()
    if (!Number.isFinite(target) || !Number.isFinite(now)) return null
    return Math.max(0, Math.round((target - now) / (1000 * 60 * 60 * 24)))
  }, [goal?.targetDate, kpis?.asOf])

  // ─── Prep trend tail ──────────────────────────────────────────────────────
  const trendLast = prepTrend.length > 0 ? prepTrend[prepTrend.length - 1] : null
  const trendDelta = useMemo(() => {
    if (prepTrend.length < 2) return null
    const first = prepTrend[0]?.value
    const last = prepTrend[prepTrend.length - 1]?.value
    if (typeof first !== 'number' || typeof last !== 'number') return null
    return Math.round(last - first)
  }, [prepTrend])

  const visibleIncidents = useMemo(() => {
    const stampOf = (t: 'revoked' | 'expired') =>
      incidents.find((i) => i.type === t)?.lastEventAt ?? ''
    const rows: { type: 'revoked' | 'expired'; count: number; lastEventAt: string }[] = [
      { type: 'revoked', count: access.revoked, lastEventAt: stampOf('revoked') },
      { type: 'expired', count: access.expired, lastEventAt: stampOf('expired') },
    ]
    return rows.filter((i) => i.count > 0)
  }, [access.revoked, access.expired, incidents])

  return (
    <CockpitShell>
      {/* Header — partner context + goal progress */}
      <header className="border-b border-slate-100 bg-white px-10 py-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="text-caption font-bold uppercase tracking-caps text-ink-muted">
              Партнёр Эндокор
            </p>
            <h1 className="mt-1 text-h1-ui font-extrabold text-navy-900">
              Обзор пилота
            </h1>
            <p className="mt-1 text-caption text-ink-muted">
              {periodLabel} · агрегированные показатели без персональных данных
            </p>
          </div>

          {goal && (
            <div
              className="rounded-2xl bg-navy-900 px-5 py-4 text-white min-w-[320px]"
              aria-label={`Прогресс к цели: ${granted} из ${goal.targetOnboarded} пациентов`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} strokeWidth={2.5} className="text-cyan-400" />
                <p className="text-caption font-bold uppercase tracking-caps text-cyan-400">
                  Цель пилота · {goal.targetLabel}
                </p>
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="font-display text-[28px] font-extrabold leading-none">
                  {granted}
                  <span className="text-cyan-400/80 font-bold text-h3-ui ml-1">
                    / {goal.targetOnboarded}
                  </span>
                </p>
                <p className="text-caption text-cyan-300">
                  {goalPercent}%
                  {daysToGoal != null && ` · осталось ${daysToGoal} дн.`}
                </p>
              </div>
              <div
                className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all"
                  style={{ width: `${goalPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto flex flex-col gap-8 px-10 py-8">
        {/* HERO · Воронка внедрения */}
        <section
          aria-label="Воронка внедрения"
          className="rounded-2xl bg-surface-sunken p-5"
        >
          <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-h2-ui font-extrabold text-navy-900">
                Воронка внедрения
              </h2>
              <p className="text-caption text-ink-muted mt-0.5">
                От приглашения до завершённой подготовки к визиту
              </p>
            </div>
            <p className="text-caption text-ink-muted">
              Снимок · {periodLabel}
            </p>
          </div>
          <Funnel stages={funnel} />
        </section>

        {/* «Где теряем» · разрез по отделениям / врачам */}
        <AdoptionBreakdown
          byDepartment={adoptionByDepartment}
          byDoctor={adoptionByDoctor}
        />

        {/* Готовность к визиту + Доступы и инциденты */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Готовность к визиту */}
          <button
            type="button"
            onClick={() => nav('/admin/kpi/prepRate')}
            className="group flex flex-col gap-3 rounded-2xl bg-white p-5 text-left ring-1 ring-slate-100 shadow-sm hover:ring-cyan-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-caption font-bold uppercase tracking-caps text-ink-muted">
                  Готовность к визиту
                </p>
                <p className="text-caption text-ink-muted mt-1">
                  Доля визитов с завершённой подготовкой
                </p>
              </div>
              <span aria-hidden className="h-2 w-2 rounded-full bg-cyan-500" />
            </div>
            <div className="flex items-end gap-4">
              <p className="font-display text-[44px] font-extrabold leading-none text-navy-900">
                {kpis?.prepRate != null ? `${Math.round(kpis.prepRate)}%` : '—'}
              </p>
              {trendDelta != null && (
                <p
                  className={`text-caption font-bold ${
                    trendDelta >= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {trendDelta >= 0 ? '+' : ''}
                  {trendDelta} п.п. за 14 дней
                </p>
              )}
            </div>
            {prepTrend.length >= 2 ? (
              <div className="mt-1 flex items-end justify-between gap-3">
                <Sparkline
                  points={prepTrend}
                  width={260}
                  height={56}
                  ariaLabel={`Динамика готовности к визиту, последнее значение ${
                    trendLast?.value ?? ''
                  }%`}
                />
                <p className="text-micro uppercase tracking-caps text-ink-muted whitespace-nowrap">
                  14 дней
                </p>
              </div>
            ) : (
              <p className="text-caption text-ink-muted">
                Недостаточно данных для тренда
              </p>
            )}
          </button>

          {/* Доступы и инциденты */}
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-sunken p-5">
            <div>
              <h2 className="text-h3-ui font-extrabold text-navy-900">
                Доступы и инциденты
              </h2>
              <p className="text-caption text-ink-muted mt-0.5">
                Операционная гигиена пилота
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-100">
                <p className="text-micro uppercase tracking-caps text-ink-muted font-bold">
                  Активных доступов
                </p>
                <p className="font-display text-h1-ui font-extrabold text-navy-900 mt-1 leading-none">
                  {totalActive}
                </p>
              </div>
              <div
                className={`rounded-xl px-4 py-3 ring-1 ${
                  totalExpiring > 0
                    ? 'bg-amber-50 ring-amber-200'
                    : 'bg-white ring-slate-100'
                }`}
              >
                <p className="text-micro uppercase tracking-caps text-ink-muted font-bold">
                  Истекают скоро
                </p>
                <p
                  className={`font-display text-h1-ui font-extrabold mt-1 leading-none ${
                    totalExpiring > 0 ? 'text-amber-700' : 'text-navy-900'
                  }`}
                >
                  {totalExpiring}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {visibleIncidents.length === 0 ? (
                <div className="rounded-xl bg-white px-4 py-4 text-center text-caption text-ink-muted ring-1 ring-slate-100">
                  Инцидентов за последние 72 часа не зафиксировано.
                </div>
              ) : (
                visibleIncidents.map((i) => {
                  const Icon = i.type === 'revoked' ? ShieldOff : Clock
                  const title =
                    i.type === 'revoked'
                      ? 'Отозванные доступы'
                      : 'Истёкшие доступы'
                  const isAnomaly = (i.count ?? 0) >= 5
                  return (
                    <div
                      key={i.type}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ${
                        isAnomaly
                          ? 'bg-amber-50 ring-amber-200'
                          : 'bg-white ring-slate-100'
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                          isAnomaly
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                        aria-hidden
                      >
                        <Icon size={14} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-bold text-navy-900">
                          {title}
                        </p>
                        <p className="text-caption text-ink-muted">
                          {formatDateTime(i.lastEventAt)}
                        </p>
                      </div>
                      <p className="font-display text-h3-ui font-extrabold text-navy-900">
                        {i.count ?? 0}
                      </p>
                    </div>
                  )
                })
              )}
            </div>

            <div className="mt-1 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => nav('/admin/access')}
                className="inline-flex items-center gap-1 text-caption font-bold text-cyan-700 hover:text-cyan-800 transition-colors"
              >
                Открыть журнал доступов →
              </button>
              <button
                type="button"
                onClick={() => toast('Отчёт сформирован', 'success')}
                className="text-caption font-bold text-ink-muted hover:text-navy-900 transition-colors"
              >
                Скачать отчёт (.csv)
              </button>
            </div>
          </div>
        </section>

        {/* System health · demoted footer pill */}
        <section
          aria-label="Состояние системы"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-100 bg-white px-4 py-3 text-caption text-ink-muted"
        >
          <span className="text-micro uppercase tracking-caps font-bold text-ink-subtle">
            Состояние системы
          </span>
          <span>
            <span className="font-bold text-navy-900">
              {kpis?.ocrRate != null ? `${Math.round(kpis.ocrRate)}%` : '—'}
            </span>{' '}
            OCR-распознавание
          </span>
          <span>
            <span
              className={`font-bold ${
                complianceState === 'green'
                  ? 'text-emerald-700'
                  : complianceState === 'amber'
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {complianceState === 'green'
                ? '✓'
                : complianceState === 'amber'
                  ? '!'
                  : '×'}
            </span>{' '}
            Согласие, область, журнал, сроки
          </span>
          {kpis?.asOf && (
            <span className="ml-auto text-micro uppercase tracking-caps">
              Снимок: {formatDateTime(kpis.asOf)}
            </span>
          )}
        </section>
      </div>
    </CockpitShell>
  )
}
