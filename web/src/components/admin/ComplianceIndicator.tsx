import { Check, AlertTriangle, X, ShieldCheck } from 'lucide-react'
import type { ComplianceChecks, ComplianceState } from '../../store/types'

interface ComplianceIndicatorProps {
  state: ComplianceState
  checks: ComplianceChecks
}

const HEADLINE: Record<ComplianceState, { title: string; helper: string }> = {
  green: {
    title: 'Всё в норме',
    helper: 'Согласие, область доступа, журнал и сроки в порядке.',
  },
  amber: {
    title: 'Требуется внимание',
    helper: 'Есть мягкие предупреждения по журналу или срокам доступа.',
  },
  red: {
    title: 'Есть нарушения — свяжитесь с командой пилота',
    helper: 'Нарушены требования к согласию или области доступа.',
  },
}

const STATE_BG: Record<ComplianceState, string> = {
  green: 'bg-emerald-50 ring-emerald-200',
  amber: 'bg-amber-50 ring-amber-200',
  red: 'bg-rose-50 ring-rose-200',
}

const STATE_DOT: Record<ComplianceState, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
}

const STATE_TITLE_FG: Record<ComplianceState, string> = {
  green: 'text-emerald-800',
  amber: 'text-amber-800',
  red: 'text-rose-800',
}

interface CheckRow {
  id: 'N3' | 'N4' | 'N5' | 'N7'
  label: string
  ok: boolean
  /** N3/N4 are hard blockers (red on fail); N5/N7 are soft (amber on fail). */
  severity: 'hard' | 'soft'
}

export default function ComplianceIndicator({
  state,
  checks,
}: ComplianceIndicatorProps) {
  const headline = HEADLINE[state] ?? HEADLINE.red

  const rows: CheckRow[] = [
    {
      id: 'N3',
      label: 'Согласие зафиксировано (версия и время)',
      ok: !!checks?.n3ConsentRecorded,
      severity: 'hard',
    },
    {
      id: 'N4',
      label: 'Область доступа задана и видна пациенту',
      ok: !!checks?.n4ScopeDefined,
      severity: 'hard',
    },
    {
      id: 'N5',
      label: 'Журнал событий доступа ведётся',
      ok: !!checks?.n5AuditLogEnabled,
      severity: 'soft',
    },
    {
      id: 'N7',
      label: 'Сроки доступа отслеживаются и не просрочены массово',
      ok: !!checks?.n7ExpiryHealthy,
      severity: 'soft',
    },
  ]

  return (
    <section
      aria-label="Состояние compliance"
      className="flex flex-col gap-4"
    >
      <div
        className={`flex items-center gap-4 rounded-2xl ring-1 px-5 py-4 ${STATE_BG[state]}`}
      >
        <div
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white ${STATE_DOT[state]}`}
          aria-hidden
        >
          <ShieldCheck size={22} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p
            className={`text-body-lg font-extrabold ${STATE_TITLE_FG[state]}`}
          >
            {headline.title}
          </p>
          <p className="text-caption text-ink-muted mt-0.5">
            {headline.helper}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const tone = row.ok
            ? 'check-ok'
            : row.severity === 'hard'
            ? 'check-fail'
            : 'check-warn'
          return (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-xl bg-white px-4 py-2.5 ring-1 ring-slate-100"
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                  tone === 'check-ok'
                    ? 'bg-emerald-100 text-emerald-700'
                    : tone === 'check-warn'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {tone === 'check-ok' ? (
                  <Check size={16} strokeWidth={2.5} />
                ) : tone === 'check-warn' ? (
                  <AlertTriangle size={16} strokeWidth={2.5} />
                ) : (
                  <X size={16} strokeWidth={2.5} />
                )}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-caption font-extrabold tracking-caps text-cyan-500">
                  {row.id}
                </span>
                <span className="text-body text-navy-900">
                  {row.label}
                </span>
              </div>
              <span className="text-micro uppercase tracking-caps text-ink-muted flex-shrink-0">
                {row.ok ? 'ок' : row.severity === 'hard' ? 'нарушение' : 'предупреждение'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
