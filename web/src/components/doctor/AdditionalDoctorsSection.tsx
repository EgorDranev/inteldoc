import { useState } from 'react'
import { UserPlus, Check, Calendar } from 'lucide-react'
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from 'framer-motion'
import StatusBadge from '../primitives/StatusBadge'
import Button from '../primitives/Button'
import { SPECIALIST_OPTIONS } from './doctorConstants'
import { formatDateTime } from '../../lib/formatters'
import type { Appointment } from '../../store/types'

/**
 * «Какие ещё врачи могут понадобиться» — specs 19–22.
 * - 19: Block listing partner-curated specialists (no AI inference).
 * - 20: Selection list rendered in the doctor cockpit (informational here —
 *       the patient performs the actual booking on the mobile surface).
 * - 21: Booking lifecycle visible as «отметить как назначен» (mock toggle,
 *       not persisted to the frozen store).
 * - 22: Linking a preparatory appointment to the main visit shown when one
 *       exists.
 */
export default function AdditionalDoctorsSection({
  preparatoryAppointments,
  mainAppointment,
}: {
  preparatoryAppointments: Appointment[]
  mainAppointment: Appointment | null
}) {
  // Local-only marking for the demo; the patient surface still owns booking.
  const [recommended, setRecommended] = useState<Set<string>>(
    () => new Set(SPECIALIST_OPTIONS.slice(0, 2).map((s) => s.id)),
  )
  const reduceMotion = useReducedMotion()

  // Matches the patient surface Home rhythm: 60ms stagger, 320ms ease-out
  // children. Reduced-motion collapses to instant opacity only.
  const listContainer: Variants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: reduceMotion
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.06, delayChildren: 0.04 },
    },
  }
  const listItem: Variants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.12 } },
      }
    : {
        hidden: { opacity: 0, y: 8 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
        },
      }

  function toggle(id: string) {
    setRecommended((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <motion.ul
        className="flex flex-col gap-4"
        variants={listContainer}
        initial="hidden"
        animate="show"
      >
        {SPECIALIST_OPTIONS.map((s) => {
          const on = recommended.has(s.id)
          return (
            <motion.li
              key={s.id}
              variants={listItem}
              className="rounded-2xl bg-surface-sunken p-4 flex items-center gap-4"
            >
              <div
                className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-200 ease-out ${
                  on
                    ? 'bg-cyan-500 text-white'
                    : 'bg-white text-ink-muted shadow-[inset_0_0_0_1.5px_var(--slate-200)]'
                }`}
              >
                <UserPlus size={20} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-bold text-ink-strong">
                  {s.specialty}
                </p>
                <p className="text-caption text-ink-muted leading-snug">
                  {s.reason}
                </p>
                {s.slotHint && (
                  <p className="text-caption text-ink font-data mt-1">
                    Свободное время: {s.slotHint}
                  </p>
                )}
              </div>
              <Button
                variant={on ? 'primary' : 'secondary'}
                size="md"
                icon={
                  <AnimatePresence initial={false} mode="wait">
                    {on ? (
                      <motion.span
                        key="check"
                        initial={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.6 }
                        }
                        animate={
                          reduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, scale: 1 }
                        }
                        exit={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.6 }
                        }
                        transition={{
                          duration: reduceMotion ? 0.1 : 0.18,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="inline-flex"
                        aria-hidden
                      >
                        <Check size={14} strokeWidth={2.5} />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                }
                onClick={() => toggle(s.id)}
              >
                {on ? 'Рекомендован' : 'Рекомендовать'}
              </Button>
            </motion.li>
          )
        })}
      </motion.ul>

      <div>
        <p className="text-micro font-bold uppercase tracking-caps text-ink-muted mb-2">
          Записи к дополнительным врачам
        </p>
        {preparatoryAppointments.length === 0 ? (
          <p className="text-body text-ink-muted">
            Пациент пока не записан к дополнительным специалистам.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {preparatoryAppointments.map((a) => (
              <li
                key={a.id}
                className="rounded-xl bg-surface-sunken px-4 py-3 flex items-center gap-3"
              >
                <Calendar size={16} className="text-cyan-500" strokeWidth={2} />
                <div className="flex-1">
                  <p className="text-body text-ink-strong font-bold leading-tight">
                    {formatDateTime(a.date)}
                  </p>
                  <p className="text-caption text-ink-muted">
                    Подготовительный визит
                    {mainAppointment && ' перед основным приёмом'}
                  </p>
                </div>
                <StatusBadge tone={a.status === 'completed' ? 'success' : 'info'}>
                  {a.status === 'completed' ? 'Завершён' : 'Запланирован'}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
        {mainAppointment && preparatoryAppointments.length > 0 && (
          <p className="text-caption text-cyan-600 mt-2">
            Привязаны к основному приёму{' '}
            <span className="font-data font-bold">
              {formatDateTime(mainAppointment.date)}
            </span>
            .
          </p>
        )}
      </div>
    </div>
  )
}
