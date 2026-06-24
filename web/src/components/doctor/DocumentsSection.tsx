import { FileText, Check, AlertCircle, ExternalLink, Sparkles, Send } from 'lucide-react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import StatusBadge from '../primitives/StatusBadge'
import { formatDateFull, formatDateTime } from '../../lib/formatters'
import { DOCUMENT_SLOTS } from './doctorConstants'
import type { Document, DocumentType } from '../../store/types'

export interface RegistraturaRequestStamp {
  by: string
  at: string
}

function StructureBadge({
  status,
}: {
  status: Document['structureStatus']
}) {
  if (status === 'structured') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-caption font-bold text-emerald-700">
        <Sparkles size={11} strokeWidth={2.4} /> Структурировано
      </span>
    )
  }
  if (status === 'original-only') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-caption font-bold text-amber-700">
        <FileText size={11} strokeWidth={2.4} /> Только оригинал
      </span>
    )
  }
  return null
}

const REGISTRATION_TYPES: DocumentType[] = ['passport', 'oms', 'snils']
const CLINICAL_TYPES: DocumentType[] = ['referral', 'other']

/**
 * Documents tab on D02.
 *
 * Serves four doctor JTBD:
 *   1. «Приём не задержится на регистрации?» — answered by the registration
 *      banner at top: one glance, паспорт + ОМС status. Should take ≤3 s.
 *   2. «Это продолжение наблюдения?» — answered by the клинический контекст
 *      group: referral row, when filled, surfaces source clinic, дата
 *      направления, повод. Quiet empty state when no referral exists.
 *   3. «Есть выписки/заключения, которые стоит просмотреть?» — answered by
 *      the «Другие документы» row in the same group: actual document label
 *      when filled, quiet placeholder when empty.
 *   4. «Если документа нет — дёрнуть регистратуру, а не самому звонить.» —
 *      required-but-missing rows expose a «Запросить через регистратуру»
 *      action. Click stamps the row with доктор + время (single-doctor mock,
 *      session-scoped). Confined to the Регистрация group because optional /
 *      clinical-context absence is a different judgment call.
 *
 * Visual hierarchy mirrors the priority of these jobs: registration is a
 * green-banner glance, клинический контекст gets richer per-row content,
 * regrequest affordance shows up only where action is meaningful.
 */
export default function DocumentsSection({
  documents,
  regRequestedSlots = {},
  currentDoctorName,
  onRequestViaRegistratura,
}: {
  documents: Document[]
  regRequestedSlots?: Record<string, RegistraturaRequestStamp>
  currentDoctorName?: string
  onRequestViaRegistratura?: (type: DocumentType) => void
}) {
  const regSlots = DOCUMENT_SLOTS.filter((s) => REGISTRATION_TYPES.includes(s.type))
  const regRequired = regSlots.filter((s) => s.required)
  const regRequiredFilled = regRequired.filter((s) =>
    documents.some((d) => d.type === s.type),
  ).length
  const regReady = regRequiredFilled === regRequired.length

  const clinicalSlots = DOCUMENT_SLOTS.filter((s) => CLINICAL_TYPES.includes(s.type))

  // Motion language matches sibling tabs (ComplaintsSection, AdditionalDoctors):
  // 60ms stagger, 320ms expo-out children. Reduced-motion collapses to opacity
  // only so tab swaps still feel coherent on accessibility settings.
  const reduceMotion = useReducedMotion()

  const listContainer: Variants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: reduceMotion
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.06, delayChildren: 0.06 },
    },
  }
  // Clinical list starts as the last registration row begins — keeps the
  // reading order «регистрация → контекст» without a sequential wait.
  const clinicalContainer: Variants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: reduceMotion
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.06, delayChildren: 0.18 },
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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-h2-ui font-bold text-ink-strong leading-tight">
          Документы
        </h2>
        <p className="text-caption text-ink-muted mt-1">
          Что готово к приёму: пакет для регистрации и контекст от других ЛПУ.
        </p>
      </header>

      {/* JTBD 1 — registration glance. The banner is the whole answer; the rows
          below are audit trail. Doctor should not need to scan them. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-caption font-bold uppercase tracking-caps text-ink-strong">
          Регистрация
        </h3>

        <motion.div
          className="rounded-2xl bg-surface-sunken p-4 flex items-center gap-4"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0.12 : 0.28,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <div className="flex-shrink-0 h-14 w-14 rounded-2xl bg-white flex items-center justify-center text-cyan-500">
            {regReady ? (
              <Check size={28} strokeWidth={2.5} aria-hidden />
            ) : (
              <span className="font-data text-h2-ui font-bold leading-none">
                {regRequiredFilled}
                <span className="text-ink-muted">/{regRequired.length}</span>
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-h3-ui font-bold text-ink-strong">
              {regReady
                ? 'Приём не задержится на регистрации'
                : `Загружено ${regRequiredFilled} из ${regRequired.length} обязательных`}
            </p>
            <p className="text-caption text-ink-muted mt-1">
              {regReady
                ? 'Паспорт и ОМС в IntelDoc — регистратура подтвердит на стойке.'
                : 'Пациент догружает обязательные документы до приёма.'}
            </p>
          </div>
          <StatusBadge tone={regReady ? 'success' : 'warning'}>
            {regReady ? 'Готовы' : 'В работе'}
          </StatusBadge>
        </motion.div>

        <motion.ul
          className="flex flex-col gap-2"
          variants={listContainer}
          initial="hidden"
          animate="show"
        >
          {regSlots.map((slot) => {
            const matches = documents.filter((d) => d.type === slot.type)
            const filled = matches.length > 0
            const last = matches.length
              ? matches.slice().sort((a, b) =>
                  a.uploadedAt < b.uploadedAt ? 1 : -1,
                )[0]
              : null
            const showRegRequest = !filled && slot.required
            const regStamp = regRequestedSlots[slot.type]
            const wasRequested = !!regStamp
            return (
              <motion.li
                key={slot.type}
                variants={listItem}
                className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-surface-sunken"
              >
                <div
                  className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    filled
                      ? 'bg-emerald-100 text-emerald-700'
                      : slot.required
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-white text-ink-muted shadow-[inset_0_0_0_1.5px_var(--slate-200)]'
                  }`}
                >
                  {filled ? (
                    <Check size={16} strokeWidth={2.5} />
                  ) : slot.required ? (
                    <AlertCircle size={16} strokeWidth={2} />
                  ) : (
                    <FileText size={16} strokeWidth={2} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body font-semibold text-ink-strong">{slot.label}</p>
                  {last && (
                    <p className="text-caption text-ink-muted mt-0.5 font-data">
                      Загружено {formatDateTime(last.uploadedAt)}
                    </p>
                  )}
                  {wasRequested && (
                    <p className="text-caption text-emerald-700 mt-0.5 leading-snug">
                      <span className="font-bold">Запрос отправлен в регистратуру</span>
                      <span className="text-ink-muted">
                        {' · '}
                        {regStamp.by}
                        {' · '}
                        <span className="font-data">{formatDateTime(regStamp.at)}</span>
                      </span>
                    </p>
                  )}
                </div>
                {showRegRequest && !wasRequested ? (
                  <button
                    type="button"
                    onClick={() => onRequestViaRegistratura?.(slot.type)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-caption font-bold text-ink-strong shadow-[inset_0_0_0_1.5px_var(--slate-200)] hover:bg-slate-50 hover:shadow-[inset_0_0_0_1.5px_var(--slate-300)] transition-colors flex-shrink-0"
                  >
                    <Send size={13} strokeWidth={2.4} />
                    Запросить через регистратуру
                  </button>
                ) : (
                  <StatusBadge
                    tone={
                      filled
                        ? 'success'
                        : wasRequested
                        ? 'success'
                        : slot.required
                        ? 'warning'
                        : 'neutral'
                    }
                  >
                    {filled
                      ? 'Загружен'
                      : wasRequested
                      ? 'Запрос отправлен'
                      : slot.required
                      ? 'Ожидаем'
                      : 'Не приложен'}
                  </StatusBadge>
                )}
              </motion.li>
            )
          })}
        </motion.ul>

        {/* Footnote explaining the boundary: doctor flags, регистратура chases.
            Shown only when at least one slot is requestable to keep the screen
            quiet on the happy path. */}
        {regSlots.some(
          (s) => s.required && !documents.some((d) => d.type === s.type),
        ) && (
          <p className="text-caption text-ink-muted leading-relaxed">
            Доктор отмечает, чего не хватает — регистратура связывается с пациентом.
            {currentDoctorName ? ` Запрос уходит от ${currentDoctorName}.` : ''}
          </p>
        )}
      </section>

      {/* JTBD 2 + 3 — clinical context that may reframe the visit. Rows are
          richer when filled (source clinic, дата направления, повод for the
          referral; real document label for other docs) and quiet when empty —
          empty here is itself meaningful: «это первичка с точки зрения
          IntelDoc». */}
      <section className="flex flex-col gap-3">
        <h3 className="text-caption font-bold uppercase tracking-caps text-ink-strong">
          Клинический контекст от других ЛПУ
        </h3>

        <motion.ul
          className="flex flex-col gap-2"
          variants={clinicalContainer}
          initial="hidden"
          animate="show"
        >
          {clinicalSlots.map((slot) => {
            const matches = documents.filter((d) => d.type === slot.type)
            const filled = matches.length > 0
            const last = matches.length
              ? matches.slice().sort((a, b) =>
                  a.uploadedAt < b.uploadedAt ? 1 : -1,
                )[0]
              : null
            const isReferral = slot.type === 'referral'

            if (!filled) {
              return (
                <motion.li
                  key={slot.type}
                  variants={listItem}
                  className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-surface-sunken/60"
                >
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white text-ink-muted shadow-[inset_0_0_0_1.5px_var(--slate-200)]">
                    <FileText size={16} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-medium text-ink-muted">{slot.label}</p>
                    <p className="text-caption text-ink-muted mt-0.5 leading-snug">
                      {isReferral
                        ? 'Приём не отмечен как продолжение наблюдения в другом ЛПУ.'
                        : 'Выписок и заключений из других ЛПУ нет.'}
                    </p>
                  </div>
                  <StatusBadge tone="neutral">Не приложено</StatusBadge>
                </motion.li>
              )
            }

            return (
              <motion.li
                key={slot.type}
                variants={listItem}
                className="rounded-2xl p-4 flex gap-4 bg-surface-sunken"
              >
                <div
                  className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isReferral
                      ? 'bg-cyan-100 text-cyan-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isReferral ? (
                    <ExternalLink size={20} strokeWidth={2.2} />
                  ) : (
                    <FileText size={20} strokeWidth={2.2} />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-semibold text-ink-strong">
                        {last!.label}
                      </p>
                      {isReferral && (
                        <p className="text-caption font-bold uppercase tracking-caps text-cyan-700 mt-0.5">
                          Продолжение наблюдения
                        </p>
                      )}
                    </div>
                    <StatusBadge tone="success">Загружен</StatusBadge>
                  </div>

                  {isReferral && (last!.sourceFacility || last!.referralReason || last!.referralDate) && (
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-caption">
                      {last!.sourceFacility && (
                        <>
                          <dt className="text-ink-muted">Источник</dt>
                          <dd className="text-ink-strong font-medium">{last!.sourceFacility}</dd>
                        </>
                      )}
                      {last!.referralDate && (
                        <>
                          <dt className="text-ink-muted">Дата направления</dt>
                          <dd className="text-ink-strong font-medium font-data">
                            {formatDateFull(last!.referralDate)}
                          </dd>
                        </>
                      )}
                      {last!.referralReason && (
                        <>
                          <dt className="text-ink-muted">Повод</dt>
                          <dd className="text-ink-strong font-medium">{last!.referralReason}</dd>
                        </>
                      )}
                    </dl>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-caption text-ink-muted font-data">
                      Загружено {formatDateTime(last!.uploadedAt)}
                    </p>
                    {last!.structureStatus && (
                      <StructureBadge status={last!.structureStatus} />
                    )}
                  </div>
                </div>
              </motion.li>
            )
          })}
        </motion.ul>
      </section>
    </div>
  )
}
