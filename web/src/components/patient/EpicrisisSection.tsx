import { useState } from 'react'
import { ChevronRight, FileText, Info, Plus } from 'lucide-react'
import ChecklistSection from './ChecklistSection'
import StatusChip from '../StatusChip'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'

interface Epicrisis {
  id: string
  title: string
  facility: string
  period: string
  summary: string
  pages: number
}

const SEEDED_EPICRISES: Epicrisis[] = [
  {
    id: 'ep-1',
    title: 'Госпитализация · диабет 2 типа, ухудшение',
    facility: 'Городская больница',
    period: '12–19 ноября 2024',
    summary:
      'Стационар, 7 дней. Подбор инсулина длительного действия, коррекция схемы по давлению.',
    pages: 4,
  },
  {
    id: 'ep-2',
    title: 'Дневной стационар · обследование',
    facility: 'Поликлиника № 22',
    period: '3–7 февраля 2025',
    summary:
      'Плановое обследование: ЭКГ, УЗИ почек, осмотр окулиста. Без острых находок, схема приёма уточнена врачом.',
    pages: 6,
  },
]

/**
 * Эпикризы — discharge / treatment summaries from past hospitalizations and
 * day-clinic courses. Patient-provided clinical context that the doctor
 * reads before the visit. Treated as a reference («Справка») section: not
 * counted toward overall prep progress, but valuable for trust and continuity.
 */
export default function EpicrisisSection() {
  const [items] = useState<Epicrisis[]>(SEEDED_EPICRISES)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<Epicrisis | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  function openPreview(item: Epicrisis) {
    setPreviewItem(item)
    setPreviewOpen(true)
  }

  return (
    <ChecklistSection title="Выписки">
      <p className="text-caption text-ink-muted leading-relaxed px-1">
        Выписки и заключения о прошлых курсах лечения — врач увидит контекст до приёма.
      </p>

      <div className="rounded-2xl bg-white overflow-hidden divide-y divide-ink-100">
        {items.map((ep) => (
          <button
            key={ep.id}
            onClick={() => openPreview(ep)}
            className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText size={16} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold text-ink-strong leading-snug">
                {ep.title}
              </p>
              <p className="text-caption text-ink-muted leading-snug mt-0.5">
                {ep.facility} · {ep.period}
              </p>
            </div>
            <ChevronRight
              size={16}
              strokeWidth={2}
              className="text-slate-400 flex-shrink-0 mt-1"
            />
          </button>
        ))}

        <button
          onClick={() => setAddOpen(true)}
          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
            <Plus size={16} strokeWidth={2} />
          </div>
          <p className="text-body font-semibold text-cyan-600 leading-snug flex-1">
            Добавить выписку
          </p>
        </button>
      </div>

      <div className="rounded-xl bg-cyan-50 px-3 py-2 flex items-start gap-2">
        <Info
          size={13}
          strokeWidth={2}
          className="flex-shrink-0 text-cyan-600 mt-0.5"
          aria-hidden
        />
        <p className="text-caption text-cyan-700 leading-snug">
          Выписки помогают врачу увидеть историю лечения и не повторять уже сделанные исследования.
        </p>
      </div>

      <BottomSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={previewItem?.title ?? 'Выписка'}
      >
        {previewItem && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="rounded-2xl bg-surface p-4 flex flex-col gap-1">
              <p className="text-caption text-ink-muted">
                {previewItem.facility}
              </p>
              <p className="text-body font-semibold text-ink-strong">
                {previewItem.period}
              </p>
              <p className="text-caption text-ink-muted">
                {previewItem.pages} стр.
              </p>
            </div>
            <div>
              <p className="text-micro font-bold uppercase tracking-caps text-ink-muted mb-2">
                Краткое содержание
              </p>
              <p className="text-body text-ink-strong leading-relaxed">
                {previewItem.summary}
              </p>
            </div>
            <div className="rounded-xl bg-cyan-50 px-3 py-2 flex items-start gap-2">
              <Info
                size={13}
                strokeWidth={2}
                className="flex-shrink-0 text-cyan-600 mt-0.5"
                aria-hidden
              />
              <p className="text-caption text-cyan-700 leading-snug">
                Содержание подготовлено по тексту выписки. Это не заменяет консультацию врача.
              </p>
            </div>
            <Button full variant="secondary" onClick={() => setPreviewOpen(false)}>
              Закрыть
            </Button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Добавить выписку"
      >
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-body text-ink-strong leading-relaxed">
            Сфотографируйте выписку или загрузите PDF. Мы соберём краткое содержание для врача.
          </p>
          <StatusChip label="Демо" variant="neutral" />
          <Button full onClick={() => setAddOpen(false)}>
            Понятно
          </Button>
        </div>
      </BottomSheet>
    </ChecklistSection>
  )
}
