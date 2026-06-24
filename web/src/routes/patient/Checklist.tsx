import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CalendarDays, ChevronRight, Stethoscope } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import PhoneFrame from '../../components/patient/PhoneFrame'
import VasilyRecoCard from '../../components/patient/VasilyRecoCard'
import TopHeader from '../../components/patient/TopHeader'
import TabBar from '../../components/primitives/TabBar'
import Button from '../../components/primitives/Button'
import AnalysesSection from '../../components/patient/AnalysesSection'
import DocumentsSection from '../../components/patient/DocumentsSection'
import ComplaintsSection from '../../components/patient/ComplaintsSection'
import AdditionalDoctorsSection from '../../components/patient/AdditionalDoctorsSection'
import EpicrisisSection from '../../components/patient/EpicrisisSection'
import CaregiverAccessSection from '../../components/patient/CaregiverAccessSection'
import {
  useActivePatient,
  useAnalyses,
  useAppointment,
  useComplaints,
  useDocuments,
  usePlanItems,
  usePrepComplete,
  usePrepProgress,
  useSectionStatuses,
} from '../../store/hooks'
import { useShallow } from 'zustand/react/shallow'
import { useInteldoc } from '../../store/store'
import { markPrepComplete } from '../../store/actions'
import {
  formatAppointmentLead,
  formatDateShort,
  formatRelativeSaved,
  pluralRu,
} from '../../lib/formatters'
type ActionableSection =
  | 'documents'
  | 'newAnalyses'
  | 'complaints'
  | 'appointment'

const NEXT_STEP_ORDER: ActionableSection[] = [
  'documents',
  'newAnalyses',
  'complaints',
  'appointment',
]

const SECTION_LABEL: Record<ActionableSection, string> = {
  documents: 'Документы',
  newAnalyses: 'Анализы',
  complaints: 'Жалобы',
  appointment: 'Основная запись',
}

// DOM ids for scroll-into-view from Vasily's primary chip. Kept in one
// place so the card and the section wrappers can't drift.
const SECTION_ANCHOR: Record<ActionableSection, string> = {
  documents: 'section-documents',
  newAnalyses: 'section-analyses',
  complaints: 'section-complaints',
  appointment: 'section-appointment',
}

export default function Checklist() {
  const nav = useNavigate()
  const planItems = usePlanItems()
  const analyses = useAnalyses()
  const complaints = useComplaints()
  const docs = useDocuments()
  const appointment = useAppointment()
  const prepComplete = usePrepComplete()
  const progress = usePrepProgress()
  const statuses = useSectionStatuses()
  const lastSavedAt = useInteldoc((s) => s.lastSavedAt)
  const patient = useActivePatient()
  const prefersReduce = useReducedMotion()

  // Re-render the «Сохранено — …» label as minutes tick by, so the user
  // doesn't see a stuck «только что» after sitting on the screen.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!lastSavedAt) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [lastSavedAt])

  // When preparation flips complete, record it once: stamps prepCompletedAt and,
  // in BACKEND_MODE, POSTs /me/prep/complete so the patient's label moves to
  // «Готов» on the doctor's live queue (the slice headline). The backend
  // completion is idempotent, so a re-fire is harmless.
  const prepCompleteFired = useRef(false)
  useEffect(() => {
    if (prepComplete && !prepCompleteFired.current) {
      prepCompleteFired.current = true
      markPrepComplete()
    }
  }, [prepComplete])

  // Soft ring drawn on the section Vasily's primary chip just scrolled to.
  // Confirms «you arrived where I sent you» — short, fades on its own.
  const [highlighted, setHighlighted] = useState<ActionableSection | null>(null)
  const highlightTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current)
  }, [])

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: prefersReduce ? 0 : 0.05,
        delayChildren: prefersReduce ? 0 : 0.04,
      },
    },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: prefersReduce ? 0 : 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReduce ? 0 : 0.28,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      },
    },
  }

  // Next-step hint — first non-done actionable section in display order.
  // Skips reference sections (info) and the hidden newAnalyses (null when
  // no plan was ever issued). Falls back to a neutral line in the rare
  // case where everything actionable is `done` but prepComplete is false.
  // Exposes the section key too so Vasily's primary chip can scroll to it.
  const nextStep = useMemo(() => {
    if (prepComplete) {
      return {
        text: 'Вы готовы к приёму. Осталось подтвердить запись.',
        key: 'appointment' as ActionableSection,
      }
    }
    const next = NEXT_STEP_ORDER.find((k) => {
      const s = statuses[k]
      return s === 'not_started' || s === 'in_progress'
    })
    if (!next) {
      return {
        text: 'Можно идти по разделам в любом порядке — как удобнее',
        key: null as ActionableSection | null,
      }
    }
    const verb = progress.done === 0 ? 'Начните с раздела' : 'Дальше — раздел'
    return { text: `${verb} “${SECTION_LABEL[next]}”`, key: next }
  }, [statuses, progress.done, prepComplete])

  // Meta line for Vasily card — removes the two start-rate killers for
  // 35–65: "how long is this" and "how big is this". Switches to "X из Y"
  // once the user has started, so re-entry isn't blank-slate.
  // Time estimate is rough on purpose (no false precision).
  const vasilyMeta = useMemo(() => {
    const remaining = Math.max(progress.total - progress.done, 0)
    if (remaining === 0) return undefined
    const minutesByRemaining: Record<number, string> = {
      1: 'Около 2 минут',
      2: 'Около 3 минут',
      3: 'Около 5 минут',
      4: 'Около 7 минут',
    }
    const timeText = minutesByRemaining[remaining] ?? `Около ${remaining * 2} минут`
    if (progress.done === 0) {
      const word = pluralRu(progress.total, ['раздел', 'раздела', 'разделов'])
      return `${timeText} · ${progress.total} ${word}`
    }
    return `${timeText} · ${progress.label}`
  }, [progress])

  const scrollToSection = (key: ActionableSection | null) => {
    if (!key) return
    const el = document.getElementById(SECTION_ANCHOR[key])
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current)
    setHighlighted(key)
    highlightTimer.current = window.setTimeout(() => setHighlighted(null), 1400)
  }

  const askVasily = (prompt: string) => {
    nav('/patient/vasily', { state: { initialPrompt: prompt } })
  }

  // Attending-doctor headline — answers «к кому я готовлюсь». Pulled from
  // the active patient's attendingDoctorId, falls back gracefully if seed
  // data is incomplete.
  const doctorLine = useInteldoc((s) => {
    if (!patient?.attendingDoctorId) return null
    const d = s.doctors.find((x) => x.id === patient.attendingDoctorId)
    if (!d) return null
    return `${d.name} · ${d.specialty}`
  })

  // Date strip — passive context inside the progress card. Explicit «when»
  // when known, explicit «not yet» when not. The dedicated booking row below
  // carries the action; this line is just data-density next to the doctor.
  const appointmentLine = useMemo(() => {
    if (!appointment) return 'Дата приёма пока не выбрана'
    const lead = formatAppointmentLead(appointment.date).toLowerCase()
    return `Приём ${formatDateShort(appointment.date)} · ${lead}`
  }, [appointment])

  // Defensive read for plan meta (doctor + sent date). `useShallow` is required:
  // the selector builds a fresh object, so without it every getSnapshot returns a
  // new reference → infinite render loop (only triggers once the patient actually
  // has a doctor request, e.g. in BACKEND_MODE).
  const planMeta = useInteldoc(
    useShallow((s) => {
      if (!patient) return null
      const req = s.doctorRequests
        .filter((r) => r.patientId === patient.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
      if (!req) return null
      const doctor = s.doctors.find((d) => d.id === req.fromDoctorId)
      return {
        doctorName: doctor?.name,
        sentLabel: `получен ${formatDateShort(req.createdAt)}`,
      }
    }),
  )

  return (
    <PhoneFrame>
      <TopHeader title="Подготовка" showPartner={false} />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="flex-1 overflow-y-auto px-5 pb-[110px] flex flex-col gap-6"
      >
        {/* Top progress card — gives the user a calm overall sense */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-surface-sunken p-5 flex flex-col gap-3"
        >
          <p className="text-body-lg font-bold text-ink-strong leading-tight min-w-0 truncate">
            Подготовка к приёму в Эндокор
          </p>
          <div className="flex items-center gap-3">
            <div className="h-1.5 rounded-full bg-white overflow-hidden flex-1">
              <div
                className="h-full bg-cyan-500 transition-all duration-300 ease-out"
                style={{
                  width: `${
                    (progress.done / Math.max(progress.total, 1)) * 100
                  }%`,
                }}
              />
            </div>
            <span className="text-caption text-ink-muted font-data flex-shrink-0">
              {progress.label}
            </span>
          </div>
          {(doctorLine || appointmentLine) && (
            <div className="rounded-xl bg-white overflow-hidden divide-y divide-ink-100">
              {doctorLine && (
                <p className="text-body text-ink-strong leading-snug flex items-center gap-3 px-4 py-3">
                  <Stethoscope
                    size={16}
                    strokeWidth={2}
                    className="flex-shrink-0 text-ink-strong"
                    aria-hidden
                  />
                  {doctorLine}
                </p>
              )}
              {appointmentLine && (
                <button
                  id={SECTION_ANCHOR.appointment}
                  onClick={() => nav('/patient/book')}
                  className="w-full text-left text-body leading-snug flex items-center gap-3 px-4 py-3 text-ink-strong font-data active:bg-ink-50 transition-colors"
                  aria-label={
                    appointment
                      ? 'Открыть запись на приём'
                      : 'Выбрать дату приёма'
                  }
                >
                  {appointment ? (
                    <CalendarDays
                      size={16}
                      strokeWidth={2}
                      className="flex-shrink-0 text-ink-strong"
                      aria-hidden
                    />
                  ) : (
                    <span className="relative flex-shrink-0 inline-flex">
                      <CalendarClock
                        size={16}
                        strokeWidth={2}
                        className="text-ink-subtle"
                        aria-hidden
                      />
                      <span
                        aria-hidden
                        className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-surface-sunken"
                      />
                    </span>
                  )}
                  <span className={`flex-1 min-w-0 ${appointment ? '' : 'text-ink'}`}>
                    {appointmentLine}
                  </span>
                  <ChevronRight
                    size={16}
                    strokeWidth={2}
                    className="flex-shrink-0 text-ink-subtle"
                    aria-hidden
                  />
                </button>
              )}
            </div>
          )}
          <AnimatePresence initial={false}>
            {lastSavedAt && (
              <motion.p
                key="saved-badge"
                initial={{ opacity: 0, y: prefersReduce ? 0 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: prefersReduce ? 0 : 0.22,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="self-start inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-caption font-semibold text-emerald-800 leading-none"
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
                />
                Сохранено {formatRelativeSaved(lastSavedAt)}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Vasily's recommendation — separated from the status card so
            coaching has its own voice and doesn't crowd the progress
            indicators. Four jobs in one minimal card:
              - "Where do I start" — primary chip scrolls to the next
                actionable section;
              - "How long / how much" — meta line shows a rough time
                estimate and section count;
              - "Where am I" — meta switches to "N из M" once started,
                so a returning patient doesn't see a blank-slate prompt;
              - "Why bother" — the «Зачем это?» chip opens chat with the
                prompt pre-asked.
            Hidden once prep is complete (no more advice). */}
        {!prepComplete && (
          <motion.div variants={itemVariants}>
            <VasilyRecoCard
              reco={nextStep.text}
              meta={vasilyMeta}
              primary={
                nextStep.key
                  ? {
                      label: progress.done === 0 ? 'Начать' : 'Продолжить',
                      onClick: () => scrollToSection(nextStep.key),
                    }
                  : undefined
              }
              quickReplies={[
                { label: 'Зачем это?', prompt: 'Зачем это нужно?' },
              ]}
              onAsk={askVasily}
            />
          </motion.div>
        )}

        {/* Документы (specs 011–015) */}
        <motion.div
          variants={itemVariants}
          id={SECTION_ANCHOR.documents}
          className={`flex flex-col gap-2 scroll-mt-4 rounded-2xl transition-shadow duration-500 ease-out ${
            highlighted === 'documents'
              ? 'ring-2 ring-cyan-300 ring-offset-4 ring-offset-page-bg'
              : ''
          }`}
        >
          <DocumentsSection documents={docs} />
        </motion.div>

        {/* Анализы — prescribed + history merged (specs 001–010) */}
        <motion.div
          variants={itemVariants}
          id={SECTION_ANCHOR.newAnalyses}
          className={`flex flex-col gap-2 scroll-mt-4 rounded-2xl transition-shadow duration-500 ease-out ${
            highlighted === 'newAnalyses'
              ? 'ring-2 ring-cyan-300 ring-offset-4 ring-offset-page-bg'
              : ''
          }`}
        >
          <AnalysesSection
            analyses={analyses}
            planItems={planItems}
            planMeta={planMeta}
            status={statuses.newAnalyses ?? undefined}
            appointment={appointment}
            diagnosisLabel={patient?.diagnosis?.label}
          />
        </motion.div>

        {/* Эпикризы — patient-provided treatment summaries from past care.
            Reference section: not counted toward overall prep progress. */}
        <motion.div variants={itemVariants}>
          <EpicrisisSection />
        </motion.div>

        {/* Жалобы (specs 016–018) */}
        <motion.div
          variants={itemVariants}
          id={SECTION_ANCHOR.complaints}
          className={`flex flex-col gap-2 scroll-mt-4 rounded-2xl transition-shadow duration-500 ease-out ${
            highlighted === 'complaints'
              ? 'ring-2 ring-cyan-300 ring-offset-4 ring-offset-page-bg'
              : ''
          }`}
        >
          <ComplaintsSection complaints={complaints} status={statuses.complaints} />
        </motion.div>

        {/* Какие ещё врачи (specs 019–021) */}
        <motion.div variants={itemVariants}>
          <AdditionalDoctorsSection status={statuses.additionalDoctors} />
        </motion.div>

        {/* Доступ близкого человека — view-only access to prep progress for
            a trusted person (spouse, adult child, caregiver). Clinical data
            stays inaccessible. Reference section, not counted in «X из Y». */}
        <motion.div variants={itemVariants}>
          <CaregiverAccessSection />
        </motion.div>

        {/* Completion banner */}
        <AnimatePresence>
          {prepComplete && !appointment && (
            <motion.div
              key="completion-banner"
              initial={{ opacity: 0, scale: prefersReduce ? 1 : 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: prefersReduce ? 1 : 0.97 }}
              transition={{
                duration: prefersReduce ? 0 : 0.32,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="rounded-2xl bg-cyan-500 text-white p-5 shadow-lg"
            >
              <p className="text-micro font-bold uppercase tracking-caps text-white/85 mb-1">
                Подготовка завершена
              </p>
              <p className="text-h3-ui font-bold leading-tight mb-3">
                Вы готовы к приёму
              </p>
              <Button
                variant="secondary"
                full
                onClick={() => nav('/patient/book')}
                className="bg-white !text-cyan-500 shadow-none"
              >
                Записаться к основному врачу
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <TabBar />
    </PhoneFrame>
  )
}
