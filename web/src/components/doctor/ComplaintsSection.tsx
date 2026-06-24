import { useState } from 'react'
import { MessageSquare, Tag, X } from 'lucide-react'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion'
import { formatDateTime, formatRelativeSaved } from '../../lib/formatters'
import { COMPLAINT_TAG_LABEL } from './doctorConstants'
import type { Complaint, ComplaintTag } from '../../store/types'

/**
 * Doctor view of patient complaints (specs 16–18).
 * - 16: Display all complaints sorted newest first.
 * - 17: Render attached organisational tags (non-diagnostic taxonomy).
 * - 18: Editing remains patient-side; doctor sees a read-only history with
 *       creation timestamp so they can ask follow-up questions in a request.
 *
 * Tag chips at the top act as multi-select filters (OR semantics). Tag chip
 * styling is shared across the rollup and each card so the two reads as one
 * family. The per-card tag sits at the top of the card as the leading visual
 * anchor — it's the organising axis, not buried metadata.
 */
export default function ComplaintsSection({
  complaints,
}: {
  complaints: Complaint[]
}) {
  const reduceMotion = useReducedMotion()
  const [activeTags, setActiveTags] = useState<Set<ComplaintTag>>(new Set())

  // Mirrors AdditionalDoctorsSection: 60ms stagger, 320ms exponential ease-out.
  // Keeps motion language consistent across the doctor record tabs so each
  // tab swap reads as the same surface, not a different product.
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
        exit: { opacity: 0, transition: { duration: 0.12 } },
      }
    : {
        hidden: { opacity: 0, y: 8 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
        },
        exit: {
          opacity: 0,
          y: -6,
          transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
        },
      }

  // Tag chips are smaller, lighter signal — quicker rhythm, no Y displacement.
  const chipRow: Variants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: reduceMotion
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.035, delayChildren: 0.02 },
    },
  }
  const chip: Variants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.1 } },
      }
    : {
        hidden: { opacity: 0, scale: 0.92 },
        show: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
        },
      }

  if (complaints.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Header />
        <motion.div
          className="rounded-2xl bg-surface-sunken p-6 flex items-start gap-3"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0.12 : 0.28,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <MessageSquare size={20} className="text-ink-muted mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-body-lg font-bold text-ink-strong">
              Пациент пока не описал жалоб
            </p>
            <p className="text-caption text-ink-muted mt-1 leading-relaxed">
              Можно отправить запрос «Уточнение жалоб», чтобы получить контекст
              перед приёмом.
            </p>
          </div>
        </motion.div>
      </div>
    )
  }

  // Newest first.
  const sorted = complaints
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  // Tag rollup across all complaints (spec 17).
  const tagCounts = new Map<ComplaintTag, number>()
  for (const c of sorted) {
    for (const t of c.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }

  const isFiltering = activeTags.size > 0
  const visible = isFiltering
    ? sorted.filter((c) => (c.tags ?? []).some((t) => activeTags.has(t)))
    : sorted

  function toggleTag(t: ComplaintTag) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function clearFilter() {
    setActiveTags(new Set())
  }

  return (
    <div className="flex flex-col gap-4">
      <Header />

      {tagCounts.size > 0 && (
        <motion.div
          className="flex flex-wrap items-center gap-1.5"
          variants={chipRow}
          initial="hidden"
          animate="show"
        >
          {[...tagCounts.entries()].map(([tag, n]) => {
            const isActive = activeTags.has(tag)
            return (
              <motion.button
                key={tag}
                type="button"
                variants={chip}
                onClick={() => toggleTag(tag)}
                aria-pressed={isActive}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
                  'text-caption font-semibold uppercase tracking-caps',
                  'transition-colors duration-150 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2',
                  isActive
                    ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                    : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
                ].join(' ')}
              >
                <Tag size={11} strokeWidth={2.4} />
                {COMPLAINT_TAG_LABEL[tag] ?? tag}
                <span
                  className={`font-data ${
                    isActive ? 'text-white/80' : 'text-cyan-500'
                  }`}
                >
                  · {n}
                </span>
              </motion.button>
            )
          })}

          <AnimatePresence initial={false}>
            {isFiltering && (
              <motion.button
                key="clear"
                type="button"
                onClick={clearFilter}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.92 }
                }
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1 }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.92 }
                }
                transition={{
                  duration: reduceMotion ? 0.1 : 0.18,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold text-ink-muted hover:text-ink-strong hover:bg-surface-sunken transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
                aria-label="Сбросить фильтр по темам"
              >
                <X size={12} strokeWidth={2.4} />
                Сбросить
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <motion.ul
        className="flex flex-col gap-2"
        variants={listContainer}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((c) => (
            <motion.li
              key={c.id}
              layout
              variants={listItem}
              initial="hidden"
              animate="show"
              exit="exit"
              className="rounded-2xl bg-surface-sunken p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {(c.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-micro font-semibold uppercase tracking-caps text-cyan-700"
                  >
                    {COMPLAINT_TAG_LABEL[t] ?? t}
                  </span>
                ))}
                <span
                  className="text-caption text-ink-muted font-data"
                  title={formatDateTime(c.createdAt)}
                >
                  {formatRelativeSaved(c.createdAt)}
                </span>
              </div>
              <p className="text-body text-ink-strong leading-relaxed whitespace-pre-line">
                {c.text}
              </p>
            </motion.li>
          ))}

          {isFiltering && visible.length === 0 && (
            <motion.li
              key="empty-filter"
              layout
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }
              }
              transition={{
                duration: reduceMotion ? 0.12 : 0.24,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="rounded-2xl bg-surface-sunken p-6 flex items-start gap-3"
            >
              <MessageSquare
                size={18}
                className="text-ink-muted mt-0.5"
                strokeWidth={2}
              />
              <div className="flex-1 min-w-0">
                <p className="text-body text-ink-strong">
                  Нет жалоб по выбранным темам.
                </p>
                <button
                  type="button"
                  onClick={clearFilter}
                  className="mt-1 text-caption font-semibold text-cyan-600 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 rounded-sm"
                >
                  Сбросить фильтр
                </button>
              </div>
            </motion.li>
          )}
        </AnimatePresence>
      </motion.ul>

      <p className="text-caption text-ink-muted leading-relaxed">
        Жалобы записаны со слов пациента и могут уточняться через запрос.
      </p>
    </div>
  )
}

function Header() {
  return (
    <header>
      <h2 className="text-h2-ui font-bold text-ink-strong leading-tight">
        Жалобы пациента
      </h2>
    </header>
  )
}
