import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronRight,
  IdCard,
  Info,
  ScrollText,
  Stethoscope,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import ChecklistSection from './ChecklistSection'
import type { Document, DocumentType } from '../../store/types'

interface DocumentSpec {
  type: DocumentType
  label: string
  hint: string
  required: boolean
  Icon: LucideIcon
}

/**
 * Combines specs:
 *  - 011 document preparation checklist
 *  - 012 document upload entry
 *  - 013 document readiness status
 *  - 014 OMS document
 *  - 015 external LPU referral
 */
export const DOCUMENT_CHECKLIST: DocumentSpec[] = [
  {
    type: 'passport',
    label: 'Паспорт',
    hint: 'Удостоверяет личность на ресепшене',
    required: true,
    Icon: IdCard,
  },
  {
    type: 'oms',
    label: 'Полис ОМС',
    hint: 'Подтверждает право на бесплатные услуги',
    required: true,
    Icon: ScrollText,
  },
  {
    type: 'snils',
    label: 'СНИЛС',
    hint: 'По желанию — ускорит оформление',
    required: false,
    Icon: ScrollText,
  },
  {
    type: 'referral',
    label: 'Направление от другого ЛПУ',
    hint: 'По направлению — приложите, чтобы приняли быстрее',
    required: false,
    Icon: Stethoscope,
  },
]

interface DocumentsSectionProps {
  documents: Document[]
}

export default function DocumentsSection({ documents }: DocumentsSectionProps) {
  const nav = useNavigate()
  const { uploaded, total } = selectRequiredDocReadiness(documents)
  const progressPct = (uploaded / Math.max(total, 1)) * 100

  return (
    // No header chip: the in-card progress bar below is the canonical
    // status signal — clearer than a generic «Не начато» / «В процессе».
    <ChecklistSection title="Документы">
      {/* Rows live in one calm card with dividers — keeps the admin-paperwork
          track visually quieter than the Analyses block below, which carries
          the AI value prop on this screen. Each row stays tappable; chevron
          is always visible so «заменить загруженное» is discoverable. */}
      <div className="rounded-2xl bg-white overflow-hidden divide-y divide-ink-100">
        {/* Top progress strip — bar + «X из Y» counter. Mirrors the cyan
            progress pattern from the top-level prep card so per-section and
            overall progress read with the same visual language. */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden flex-1">
            <div
              className="h-full bg-cyan-500 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-caption text-ink-muted font-data flex-shrink-0">
            {uploaded} из {total}
          </span>
        </div>
        {DOCUMENT_CHECKLIST.map((spec) => {
          const present = documents.find((d) => d.type === spec.type)
          const iconBg = present
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-slate-100 text-slate-500'
          return (
            <button
              key={spec.type}
              onClick={() => nav(`/patient/doc-upload/${spec.type}`)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
            >
              <div
                className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}
              >
                {present ? (
                  <Check size={16} strokeWidth={2.5} />
                ) : (
                  <spec.Icon size={16} strokeWidth={2} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-ink-strong leading-snug">
                  {spec.label}
                </p>
                <p className="text-caption text-ink-muted leading-snug mt-0.5">
                  {present ? 'Загружено · можно заменить' : spec.hint}
                </p>
              </div>
              {!present && spec.required && (
                <span className="text-micro font-bold uppercase tracking-caps text-amber-700 flex-shrink-0">
                  Обязательно
                </span>
              )}
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="text-slate-400 flex-shrink-0"
              />
            </button>
          )
        })}
      </div>

      {/* P2 notification — trust / data-handling note. Info (cyan) tone,
          quiet caption-size strip below the rows. `mt-1` gives it a footnote
          breath separate from the row stack above. */}
      <div className="mt-1 rounded-xl bg-cyan-50 px-3 py-2 flex items-start gap-2">
        <Info
          size={13}
          strokeWidth={2}
          className="flex-shrink-0 text-cyan-600 mt-0.5"
          aria-hidden
        />
        <p className="text-caption text-cyan-700 leading-snug">
          Документы хранятся в зашифрованном виде. Доступ имеет только клиника, которой вы выдали разрешение.
        </p>
      </div>
    </ChecklistSection>
  )
}

// Helper used by the checklist count when needed elsewhere.
export function selectRequiredDocReadiness(documents: Document[]): {
  uploaded: number
  total: number
} {
  const required = DOCUMENT_CHECKLIST.filter((d) => d.required)
  const uploaded = required.filter((spec) =>
    documents.some((d) => d.type === spec.type),
  ).length
  return { uploaded, total: required.length }
}
