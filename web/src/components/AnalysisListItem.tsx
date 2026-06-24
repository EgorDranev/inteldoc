import type { Analysis } from '../types'
import StatusChip from './StatusChip'

interface AnalysisListItemProps {
  analysis: Analysis
  onClick?: () => void
}

function ocrChip(status: Analysis['ocrStatus']) {
  if (status === 'recognized') return <StatusChip label="Распознано" variant="success" />
  if (status === 'needs-review') return <StatusChip label="Нужна проверка" variant="warning" />
  return <StatusChip label="Без OCR" variant="neutral" />
}

export default function AnalysisListItem({ analysis, onClick }: AnalysisListItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-2xl bg-white p-4 text-left transition-all duration-200 ease-out hover:bg-slate-50 active:scale-[0.99]"
    >
      <div className="w-11 h-11 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0">
        <svg className="text-cyan-500" width="22" height="22" viewBox="0 0 20 20" fill="none">
          <rect x="4" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 7H13M7 10H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body-lg font-bold text-navy-900 truncate leading-snug">
          {analysis.title}
        </p>
        <p className="text-caption text-slate-500 mt-0.5">
          {analysis.source} · {analysis.date}
        </p>
        <div className="mt-2">{ocrChip(analysis.ocrStatus)}</div>
      </div>
      <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 16 16" fill="none">
        <path
          d="M6 12L10 8L6 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
