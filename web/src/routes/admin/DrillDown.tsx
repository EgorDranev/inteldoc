import { useNavigate, useParams } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import CockpitShell from '../../components/doctor/CockpitShell'
import SecondaryButton from '../../components/SecondaryButton'
import type { KpiId } from '../../store/types'

const KPI_LABELS: Record<KpiId, string> = {
  onboarded: 'Онбординг',
  prepRate: 'Готовность к визиту',
  ocrRate: 'Распознавание документов',
}

function isKpiId(v: string | undefined): v is KpiId {
  return v === 'onboarded' || v === 'prepRate' || v === 'ocrRate'
}

/**
 * ADM-E01-F03: KPI drill-down placeholder.
 *
 * Static empty-state. No fake analytics, no patient lists. Just a clear
 * statement that the breakdown will arrive in a later release plus a
 * working «Назад» path.
 */
export default function DrillDown() {
  const { kpiId } = useParams<{ kpiId: string }>()
  const nav = useNavigate()
  const validKpi = isKpiId(kpiId) ? kpiId : undefined
  const label = validKpi ? KPI_LABELS[validKpi] : null

  return (
    <CockpitShell>
      <header className="border-b border-slate-100 bg-white px-10 py-6">
        <p className="text-caption font-bold uppercase tracking-caps text-ink-muted">
          Подробнее по KPI
        </p>
        <h1 className="mt-1 text-h1-ui font-extrabold text-navy-900">
          {label ?? 'Детальный разбор KPI'}
        </h1>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-10 py-16">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-500">
            <BarChart3 size={28} strokeWidth={2} />
          </div>
          <h2 className="mt-5 text-h2-ui font-extrabold text-navy-900">
            Подробный разбор появится в следующей версии
          </h2>
          <p className="mt-2 text-body text-ink-muted">
            Сейчас доступны общие показатели пилота. Сегментация и детальные
            разрезы появятся после согласования порогов с командой Эндокор.
          </p>
          <div className="mt-6 w-full max-w-[260px]">
            <SecondaryButton onClick={() => nav('/admin/dashboard')}>
              Назад к обзору пилота
            </SecondaryButton>
          </div>
        </div>
      </div>
    </CockpitShell>
  )
}
