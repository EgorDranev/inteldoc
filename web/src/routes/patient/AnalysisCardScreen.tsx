import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CheckCircle2, FileText, ShieldCheck } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import StatusBadge from '../../components/primitives/StatusBadge'
import TabBar from '../../components/primitives/TabBar'
import OCRReviewPanel from '../../components/patient/OCRReviewPanel'
import { useInteldoc } from '../../store/store'
import { reportOcrFieldIssue } from '../../store/actions'
import { formatDateShort } from '../../lib/formatters'

export default function AnalysisCardScreen() {
  const nav = useNavigate()
  const { analysisId } = useParams<{ analysisId: string }>()
  const analysis = useInteldoc((s) =>
    s.analyses.find((a) => a.id === analysisId) ?? null,
  )

  if (!analysis) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 pb-[110px] text-center">
          <p className="text-h2-ui font-bold text-ink-strong">Анализ не найден</p>
          <button
            onClick={() => nav('/patient/history')}
            className="text-[12px] font-bold tracking-caps uppercase text-cyan-500"
          >
            Вернуться в историю
          </button>
        </div>
        <TabBar />
      </PhoneFrame>
    )
  }

  return (
    <PhoneFrame>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={() => nav(-1)}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-ink" strokeWidth={2} />
        </button>
        <p className="text-[15px] font-bold text-ink-strong">Анализ</p>
        <div className="h-9 w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[110px] flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
            {analysis.label}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-caption text-ink-muted">
              {analysis.date ? formatDateShort(analysis.date) : 'без даты'}
            </span>
            {analysis.status === 'acknowledged' ? (
              <StatusBadge tone="success">Принято</StatusBadge>
            ) : (
              <StatusBadge tone="info">Загружено</StatusBadge>
            )}
          </div>
        </div>

        <section className="grid grid-cols-3 gap-2">
          <MiniFact
            icon={<CalendarDays size={17} strokeWidth={2.2} />}
            label="Дата"
            value={analysis.date ? formatDateShort(analysis.date) : '—'}
          />
          <MiniFact
            icon={<CheckCircle2 size={17} strokeWidth={2.2} />}
            label="OCR"
            value="проверено"
          />
          <MiniFact
            icon={<ShieldCheck size={17} strokeWidth={2.2} />}
            label="Доступ"
            value="Эндокор"
          />
        </section>

        {/* Original file thumbnail (placeholder) */}
        <div className="rounded-2xl bg-surface-sunken p-4 flex items-center gap-3">
          <div className="h-14 w-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-cyan-500 flex-shrink-0">
            <FileText size={24} strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-ink-strong">Оригинал документа</p>
            <p className="text-caption text-ink-muted">PDF · загружен</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-2 px-1">
            Распознанные значения
          </p>
          <OCRReviewPanel
            analysis={analysis}
            onReportField={(field) => reportOcrFieldIssue(analysis.id, field)}
          />
        </div>

        <p className="text-caption text-ink-muted leading-relaxed text-center px-2">
          Это не медицинское заключение. Решения принимает ваш врач.
        </p>
      </div>

      <TabBar />
    </PhoneFrame>
  )
}

function MiniFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-500">
        {icon}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[12px] font-bold text-ink-strong">{value}</p>
    </div>
  )
}
