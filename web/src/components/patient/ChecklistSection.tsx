import type { ReactNode } from 'react'
import StatusChip from '../StatusChip'
import type { ChipVariant } from '../../types'
import type { SectionStatus } from '../../store/types'

interface ChecklistSectionProps {
  title: string
  /** Small caption shown on the right when no `status` chip is rendered. */
  hint?: string
  /**
   * Per-section progress signal. When provided, a StatusChip is rendered
   * on the right of the title and `hint` is suppressed — the chip is the
   * canonical signal that the «X из Y» counter is reading.
   */
  status?: SectionStatus
  children: ReactNode
}

const STATUS_VARIANT: Record<SectionStatus, ChipVariant> = {
  done: 'success',
  in_progress: 'info',
  not_started: 'neutral',
  info: 'neutral',
}

const STATUS_LABEL: Record<SectionStatus, string> = {
  done: 'Готово',
  in_progress: 'В процессе',
  not_started: 'Не начато',
  info: 'Справка',
}

export default function ChecklistSection({
  title,
  hint,
  status,
  children,
}: ChecklistSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
          {title}
        </p>
        {status ? (
          <StatusChip
            label={STATUS_LABEL[status]}
            variant={STATUS_VARIANT[status]}
          />
        ) : hint ? (
          <span className="text-caption text-ink-muted font-data">{hint}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}
