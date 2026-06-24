import { useNavigate } from 'react-router-dom'
import { Eye, Heart, Activity, Calendar, Check, MessageCircle } from 'lucide-react'
import StatusChip from '../StatusChip'
import type { SectionStatus } from '../../store/types'

type ConsultStatus = 'completed' | 'scheduled' | 'not_booked'

export interface ExtraSpecialist {
  slug: string
  name: string
  /** Generic specialty description — used by the catalog at /patient/extra-doctors. */
  reason: string
  /** Endocrinologist-attributed reason tied to this patient's signals. */
  personalReason?: string
  /** Whether the endocrinologist prescribed this consult in the current plan. */
  prescribed?: boolean
  bookingStatus?: ConsultStatus
  bookedAt?: string
  bookedWith?: string
  deadline?: string
  completedAt?: string
  completedBy?: string
}

export const ADDITIONAL_SPECIALISTS: ExtraSpecialist[] = [
  {
    slug: 'ophthalmologist',
    name: 'Офтальмолог',
    reason: 'Контроль состояния сосудов глазного дна',
    personalReason: 'Контроль глазного дна по результатам HbA1c',
    prescribed: true,
    bookingStatus: 'scheduled',
    bookedAt: '18 мая · 11:00',
    bookedWith: 'Лебедева М.И.',
  },
  {
    slug: 'cardiologist',
    name: 'Кардиолог',
    reason: 'Профилактика осложнений со стороны сердца',
    personalReason: 'Оценка риска — повышенное АД',
    prescribed: true,
    bookingStatus: 'not_booked',
    deadline: 'Записаться до 30 мая',
  },
  {
    slug: 'neurologist',
    name: 'Невролог',
    reason: 'Оценка чувствительности при нейропатии',
    personalReason: 'Жалобы на онемение стоп',
    prescribed: true,
    bookingStatus: 'completed',
    completedAt: '4 мая',
    completedBy: 'Зайцева И.П.',
  },
  {
    slug: 'nephrologist',
    name: 'Нефролог',
    reason: 'Контроль функции почек при сахарном диабете',
  },
]

const SPECIALTY_ICON: Record<string, typeof Eye> = {
  ophthalmologist: Eye,
  cardiologist: Heart,
  neurologist: Activity,
}

const STATUS_CHIP: Record<
  ConsultStatus,
  { label: string; variant: 'success' | 'info' | 'warning' }
> = {
  completed: { label: 'Завершена', variant: 'success' },
  scheduled: { label: 'Запланирована', variant: 'info' },
  not_booked: { label: 'Не записана', variant: 'warning' },
}

interface AdditionalDoctorsSectionProps {
  /** Kept for parent compatibility; the block now drives its own progress signal. */
  status?: SectionStatus
}

/**
 * «Назначенные консультации» — consults prescribed by the patient's
 * endocrinologist in the current plan. JTBDs: trust the source, understand
 * why for me, act per-row, see status at a glance, know results loop back,
 * keep agency without breaking the prescription.
 */
export default function AdditionalDoctorsSection(
  _props: AdditionalDoctorsSectionProps = {},
) {
  const nav = useNavigate()

  const prescribed = ADDITIONAL_SPECIALISTS.filter((s) => s.prescribed)
  const completedCount = prescribed.filter(
    (s) => s.bookingStatus === 'completed',
  ).length

  return (
    <section id="prescribed-consults" className="flex flex-col gap-2 scroll-mt-6">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
          Назначенные консультации
        </p>
        <StatusChip
          label={`${completedCount} из ${prescribed.length} готово`}
          variant={
            completedCount === prescribed.length
              ? 'success'
              : completedCount > 0
                ? 'info'
                : 'neutral'
          }
        />
      </div>

      <p className="text-caption text-ink-muted leading-relaxed px-1">
        Назначила Иванова Е.А., эндокринолог · 28 апреля
      </p>

      <div className="flex flex-col gap-2 mt-1">
        {prescribed.map((spec) => {
          const Icon = SPECIALTY_ICON[spec.slug] ?? Eye
          const status = spec.bookingStatus ?? 'not_booked'
          const chip = STATUS_CHIP[status]
          const isCompleted = status === 'completed'
          const isScheduled = status === 'scheduled'

          return (
            <div
              key={spec.slug}
              className="rounded-2xl bg-white p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-cyan-50 text-cyan-500'
                  }`}
                >
                  {isCompleted ? (
                    <Check size={20} strokeWidth={2.5} />
                  ) : (
                    <Icon size={20} strokeWidth={2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-body-lg font-bold text-ink-strong leading-tight">
                      {spec.name}
                    </p>
                    <StatusChip label={chip.label} variant={chip.variant} />
                  </div>
                  <p className="text-caption text-ink-muted leading-snug mt-1">
                    {spec.personalReason ?? spec.reason}
                  </p>
                </div>
              </div>

              {isScheduled && spec.bookedAt && (
                <div className="flex items-center justify-between gap-3 pl-[52px]">
                  <div className="flex items-center gap-2 text-caption text-ink-strong font-data min-w-0">
                    <Calendar size={14} className="text-cyan-500 flex-shrink-0" strokeWidth={2} />
                    <span className="truncate">
                      {spec.bookedAt}
                      {spec.bookedWith ? ` · ${spec.bookedWith}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      nav(`/patient/extra-doctors?focus=${spec.slug}`)
                    }
                    className="text-caption font-bold tracking-caps uppercase text-cyan-500 flex-shrink-0"
                  >
                    Перенести
                  </button>
                </div>
              )}

              {status === 'not_booked' && (
                <div className="flex items-center justify-between gap-3 pl-[52px]">
                  <p className="text-caption text-amber-700 font-data min-w-0 truncate">
                    {spec.deadline ?? 'Запись не оформлена'}
                  </p>
                  <button
                    onClick={() =>
                      nav(`/patient/extra-doctors?focus=${spec.slug}`)
                    }
                    className="text-caption font-bold tracking-caps uppercase text-cyan-500 flex-shrink-0"
                  >
                    Записаться
                  </button>
                </div>
              )}

              {isCompleted && spec.completedAt && (
                <div className="flex items-center gap-2 pl-[52px] text-caption text-ink-muted font-data">
                  <Calendar size={14} className="text-emerald-500 flex-shrink-0" strokeWidth={2} />
                  <span className="truncate">
                    {spec.completedAt}
                    {spec.completedBy ? ` · ${spec.completedBy}` : ''}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl bg-cyan-50 px-4 py-3 flex items-start gap-3 mt-1">
        <div className="h-5 w-5 rounded-full bg-cyan-500/15 text-cyan-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Check size={12} strokeWidth={2.5} />
        </div>
        <p className="text-caption text-cyan-700 leading-relaxed">
          Результаты консультаций возвращаются вашему эндокринологу в Эндокор автоматически.
        </p>
      </div>

      <button
        onClick={() => nav('/patient/extra-doctors')}
        className="self-end flex items-center gap-1.5 text-caption font-bold tracking-caps uppercase text-ink-muted px-1 mt-1"
      >
        <MessageCircle size={14} strokeWidth={2} />
        Обсудить с врачом
      </button>
    </section>
  )
}
