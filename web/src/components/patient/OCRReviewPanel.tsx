import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'
import type { Analysis } from '../../store/types'

interface OCRReviewPanelProps {
  analysis: Analysis
  /** Patient flags a field as misrecognised. The value is NEVER edited here. */
  onReportField: (field: string) => void
}

/**
 * Read-only view of the recognised values. The patient cannot edit clinical
 * content (mirrors the doctor's structuring-only rule); if a value looks wrong
 * they flag it — the flag routes a data-integrity report to Эндокор + IntelDoc and
 * the clinician corrects it. Rows reveal with a small stagger (the upload
 * "magic moment" per spec).
 */
export default function OCRReviewPanel({ analysis, onReportField }: OCRReviewPanelProps) {
  const fields = Object.entries(analysis.ocrFields)
  // Fields flagged this session (parent persists to the store too).
  const [reported, setReported] = useState<Set<string>>(new Set())
  const [reportingField, setReportingField] = useState<string | null>(null)

  useEffect(() => {
    setReported(new Set())
    setReportingField(null)
  }, [analysis.id])

  const isReported = (key: string): boolean =>
    reported.has(key) || !!analysis.ocrFieldMeta?.[key]?.patientReport

  function confirmReport() {
    if (!reportingField) return
    onReportField(reportingField)
    setReported((prev) => new Set(prev).add(reportingField))
    setReportingField(null)
  }

  return (
    <div className="rounded-2xl bg-white px-5 py-2">
      <AnimatePresence initial>
        {fields.map(([key, value], i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-start justify-between gap-3 py-3 border-b border-slate-100 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted">
                {key}
              </p>
              {/* Read-only clinical value — patients do not edit it. */}
              <p className="mt-0.5 text-body-lg font-bold text-ink-strong font-data">
                {value}
              </p>
            </div>
            {isReported(key) ? (
              <span className="flex flex-shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-caps text-amber-600">
                <ShieldAlert size={13} strokeWidth={2.4} />
                На проверке
              </span>
            ) : (
              <button
                onClick={() => setReportingField(key)}
                className="flex-shrink-0 text-[12px] font-bold tracking-caps uppercase text-ink-muted hover:text-amber-600 transition-colors"
              >
                Неверно?
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      <BottomSheet
        open={reportingField !== null}
        onClose={() => setReportingField(null)}
        title="Сообщить о проблеме"
      >
        <p className="text-body text-ink leading-relaxed">
          Значение мы не меняем. Запись уйдёт на проверку — специалист проверит
          и при необходимости исправит.
        </p>
        <div className="flex flex-col gap-2">
          <DestinationLine
            title="Эндокор · регистратура"
            sub="исправит запись · ответ в течение рабочего дня"
          />
          <DestinationLine
            title="IntelDoc · аудит и безопасность"
            sub="проверит распознавание · ответ в течение 1 рабочего дня"
          />
        </div>
        <Button full onClick={confirmReport}>
          Отправить на проверку
        </Button>
      </BottomSheet>
    </div>
  )
}

function DestinationLine({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-surface-sunken px-3 py-2.5">
      <CheckCircle2 size={16} strokeWidth={2.2} className="mt-0.5 flex-shrink-0 text-cyan-500" />
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink-strong leading-tight">{title}</p>
        <p className="text-caption text-ink-muted leading-snug">{sub}</p>
      </div>
    </div>
  )
}
