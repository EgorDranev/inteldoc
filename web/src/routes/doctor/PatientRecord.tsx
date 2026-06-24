import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  ListChecks,
  MessageSquare,
  ShieldOff,
  UserPlus,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import CockpitShell from '../../components/doctor/CockpitShell'
import DocumentsSection from '../../components/doctor/DocumentsSection'
import ComplaintsSection from '../../components/doctor/ComplaintsSection'
import AdditionalDoctorsSection from '../../components/doctor/AdditionalDoctorsSection'
import { SPECIALIST_OPTIONS } from '../../components/doctor/doctorConstants'
import AnalysisDrawer from '../../components/doctor/AnalysisDrawer'
import {
  AppointmentMonitorBlock,
  CriticalLabBanner,
  DynamicsBlock,
  NextVisitBlock,
  OutOfRangeMetricsBlock,
  PrepUploadsBlock,
  TestOrdersBlock,
  VisitAgendaBlock,
  type DispatchedOrderRow,
  type NewOrderDraft,
  type NextVisitCarryover,
  type NextVisitInterval,
  type NextVisitSuggestion,
  type TestOrderItem,
} from '../../components/doctor/SummaryBlocks'
import { useInteldoc } from '../../store/store'
import {
  selectAnalysesForPatient,
  selectAppointmentForPatient,
  selectAppointmentsForPatient,
  selectComplaintsForPatient,
  selectDocumentsForPatient,
  selectRequestsForPatient,
} from '../../store/selectors'
import {
  selectAnalysesForCurrentPrep,
  selectCriticalLabs,
  selectDeltaSinceLastVisit,
  selectKeyMetrics,
  selectPrepMeta,
  selectRankedQuestions,
  selectVisitAgenda,
  selectVisitGaps,
} from '../../store/doctorSelectors'
import {
  hydrateDoctorRecord,
  openPatientRecord,
  requestPlanItem,
  sendRequest,
} from '../../store/actions'
import { BACKEND_MODE } from '../../api/config'
import {
  formatAge,
  formatAppointmentLead,
  formatDateDotted,
  formatDateShort,
  formatDateTime,
  pluralRu,
} from '../../lib/formatters'
import type {
  Analysis,
  ID,
  InteldocState,
  OrderKind,
} from '../../store/types'
import type {
  AgendaItem,
  CriticalLab,
  MetricDelta,
  MetricReading,
  VisitGap,
} from '../../store/doctorSelectors'

type Tab =
  | 'overview'
  | 'documents'
  | 'complaints'
  | 'extra-doctors'

type TabTone = 'neutral' | 'warning' | 'critical'

type DetailTabId = Exclude<Tab, 'overview'>

const DETAIL_TABS: Array<{
  id: DetailTabId
  label: string
  description: string
  Icon: typeof FileText
}> = [
  {
    id: 'complaints',
    label: 'Жалобы',
    description:
      'Что беспокоит пациента и вопросы к приёму, собранные при подготовке.',
    Icon: MessageSquare,
  },
  {
    id: 'extra-doctors',
    label: 'Дополнительные врачи',
    description:
      'Смежные специалисты, которые могут понадобиться к приёму.',
    Icon: UserPlus,
  },
  {
    id: 'documents',
    label: 'Документы',
    description:
      'Регистрация и клинический контекст от других ЛПУ.',
    Icon: FileText,
  },
]

const ALL_TABS: Array<{
  id: Tab
  label: string
  description: string
  Icon: typeof FileText
}> = [
  {
    id: 'overview',
    label: 'Подготовка к приёму',
    description:
      'На чём сосредоточиться сегодня: критичные показатели, изменения с прошлого визита, вопросы и план обследования.',
    Icon: ListChecks,
  },
  ...DETAIL_TABS,
]

export default function PatientRecord() {
  const nav = useNavigate()
  const { patientId } = useParams<{ patientId: ID }>()
  const reduceMotion = useReducedMotion()
  const [tab, setTab] = useState<Tab>('overview')
  // Store only the open analysis id, never a snapshot object — the live
  // analysis is re-derived from the store-subscribed `analyses` below so that
  // in-drawer writes (OCR verdicts, status changes) re-render the open drawer.
  const [openAnalysisId, setOpenAnalysisId] = useState<ID | null>(null)
  // Recheck orders («Контроль динамики») have no backing plan item, so their
  // committed status can't be derived from the store. We track which recheck
  // order IDs have been dispatched in this session to keep the «Запрошено»
  // pill stable while the doctor stays on the record.
  const [sentRecheckIds, setSentRecheckIds] = useState<Set<string>>(
    () => new Set(),
  )
  // Orders added by the doctor via the inline «+ Добавить назначение»
  // composer. Stored separately from the derived test orders and concatenated
  // at render time. `committed` is flipped on dispatch and persists for the
  // session, mirroring the recheck pattern.
  const [customOrders, setCustomOrders] = useState<TestOrderItem[]>([])
  // Document slots for which the doctor has flagged регистратура to chase
  // the patient. Session-scoped audit footprint (who/when), survives tab
  // switches within the record. Mirrors the recheck/customOrders pattern.
  const [regRequestedSlots, setRegRequestedSlots] = useState<
    Record<string, { by: string; at: string }>
  >({})
  // BACKEND_MODE hydrates the record from the live summary before render; track
  // it so the «not found» fallback shows a loader instead of flashing.
  const [hydrating, setHydrating] = useState(BACKEND_MODE)

  // Sync doctor active patient with URL on mount. In BACKEND_MODE, pull the live
  // summary into the store (patient + analyses + complaints + plan + appointment)
  // so the selectors below render live data and the write verbs (verdict /
  // acknowledge / dispatch) resolve real backend ids.
  useEffect(() => {
    if (!patientId) return
    if (BACKEND_MODE) {
      setHydrating(true)
      void hydrateDoctorRecord(patientId).finally(() => setHydrating(false))
    } else {
      openPatientRecord(patientId)
    }
  }, [patientId])

  const patient = useInteldoc((s) =>
    s.patients.find((p) => p.id === patientId) ?? null,
  )
  const accessRevoked = useInteldoc((s) =>
    s.accessGrants.some((g) => g.patientId === patientId && g.revokedAt),
  )
  const currentDoctorName = useInteldoc(
    (s) =>
      s.doctors.find((d) => d.id === s.currentDoctorId)?.name ?? 'Дежурный врач',
  )
  const analyses = useInteldoc(
    useShallow((s) =>
      patientId ? selectAnalysesForPatient(s, patientId) : [],
    ),
  )
  // Live analysis behind the open drawer — recomputed from the subscribed list
  // on every store change, so a verdict written inside the drawer is reflected
  // immediately (footer hides, audit stamp + status update without reopening).
  const openAnalysis = openAnalysisId
    ? analyses.find((a) => a.id === openAnalysisId) ?? null
    : null
  const documents = useInteldoc(
    useShallow((s) =>
      patientId ? selectDocumentsForPatient(s, patientId) : [],
    ),
  )
  const complaints = useInteldoc(
    useShallow((s) =>
      patientId ? selectComplaintsForPatient(s, patientId) : [],
    ),
  )
  const requests = useInteldoc(
    useShallow((s) =>
      patientId ? selectRequestsForPatient(s, patientId) : [],
    ),
  )
  const planFlat = useInteldoc(
    useShallow((s) =>
      patientId ? s.planItems.filter((p) => p.patientId === patientId) : [],
    ),
  )
  const appointments = useInteldoc(
    useShallow((s) =>
      patientId ? selectAppointmentsForPatient(s, patientId) : [],
    ),
  )
  const mainAppointment = useInteldoc((s) =>
    patientId ? selectAppointmentForPatient(s, patientId) : null,
  )
  const prep = useInteldoc(
    useShallow((s) =>
      patientId
        ? selectPrepMeta(s, patientId)
        : {
            preparedAt: null,
            timeSpentMin: null,
            docsCount: 0,
            questionsCount: 0,
          },
    ),
  )
  const rankedQuestions = useInteldoc(
    useShallow((s) => (patientId ? selectRankedQuestions(s, patientId, 3) : [])),
  )
  // selectKeyMetrics / selectVisitGaps build fresh objects on every call.
  // Subscribe to raw slices and derive with useMemo so the snapshot stays
  // stable across renders (otherwise useSyncExternalStore loops).
  const allAnalyses = useInteldoc(useShallow((s) => s.analyses))
  const allPlanItems = useInteldoc(useShallow((s) => s.planItems))
  const allDocuments = useInteldoc(useShallow((s) => s.documents))
  const allComplaints = useInteldoc(useShallow((s) => s.complaints))
  const allAppointments = useInteldoc(useShallow((s) => s.appointments))
  const allPatients = useInteldoc(useShallow((s) => s.patients))
  // Clinical-interpretation blocks (Вне референса / Динамика / Критические)
  // operate on accepted analyses only. Unaccepted uploads sit in the
  // «Анализы к этому визиту» block above and are promoted into clinical
  // signals when the doctor presses «Принять».
  const acknowledgedAnalyses = useMemo(
    () => allAnalyses.filter((a) => a.status === 'acknowledged'),
    [allAnalyses],
  )
  const prepUploads = useMemo(
    () =>
      patientId
        ? selectAnalysesForCurrentPrep(
            {
              analyses: allAnalyses,
              appointments: allAppointments,
            } as InteldocState,
            patientId,
          )
        : [],
    [allAnalyses, allAppointments, patientId],
  )
  const keyMetrics = useMemo(
    () =>
      patientId
        ? selectKeyMetrics(
            { analyses: acknowledgedAnalyses } as InteldocState,
            patientId,
          )
        : [],
    [acknowledgedAnalyses, patientId],
  )
  const visitGaps = useMemo<VisitGap[]>(
    () =>
      patientId
        ? selectVisitGaps(
            {
              analyses: allAnalyses,
              planItems: allPlanItems,
              documents: allDocuments,
            } as InteldocState,
            patientId,
          )
        : [],
    [allAnalyses, allPlanItems, allDocuments, patientId],
  )
  const agenda = useMemo<AgendaItem[]>(
    () =>
      patientId
        ? selectVisitAgenda(
            {
              analyses: allAnalyses,
              planItems: allPlanItems,
              documents: allDocuments,
              complaints: allComplaints,
              patients: allPatients,
            } as InteldocState,
            patientId,
          )
        : [],
    [
      allAnalyses,
      allPlanItems,
      allDocuments,
      allComplaints,
      allPatients,
      patientId,
    ],
  )
  const deltaSinceLastVisit = useMemo<MetricDelta[]>(
    () =>
      patientId
        ? selectDeltaSinceLastVisit(
            { analyses: acknowledgedAnalyses } as InteldocState,
            patientId,
          )
        : [],
    [acknowledgedAnalyses, patientId],
  )
  const criticalLabs = useMemo<CriticalLab[]>(
    () =>
      patientId
        ? selectCriticalLabs(
            { analyses: acknowledgedAnalyses } as InteldocState,
            patientId,
          )
        : [],
    [acknowledgedAnalyses, patientId],
  )

  const planDone = useMemo(
    () =>
      (planFlat ?? []).filter(
        (p) => p.status === 'uploaded' || p.status === 'acknowledged',
      ).length,
    [planFlat],
  )
  const planTotal = (planFlat ?? []).length

  // Ledger of dispatched orders for «Назначения к следующему приёму» (JTBD-2).
  // Sourced from plan items that already have `lastRequestedAt` set OR were
  // created via sendRequest (status 'assigned' on freshly created plan items).
  // intent is looked up from the parent DoctorRequest so the ledger row
  // carries the patient-facing chip (JTBD-1).
  const requestById = useMemo(() => {
    const map = new Map<string, (typeof requests)[number]>()
    for (const r of requests ?? []) map.set(r.id, r)
    return map
  }, [requests])

  const dispatchedOrders = useMemo<DispatchedOrderRow[]>(() => {
    return (planFlat ?? [])
      .map((p) => {
        const parent = requestById.get(p.requestId)
        const requestedAt = p.lastRequestedAt ?? p.createdAt
        return {
          id: p.id,
          label: p.label,
          kind: p.kind ?? 'lab',
          status: p.status,
          requestedAt,
          intent: parent?.intent,
        }
      })
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  }, [planFlat, requestById])

  // Attention indicator (JTBD-3) — count of plan items the patient has
  // uploaded but the doctor hasn't yet acknowledged.
  const unseenUploads = useMemo(
    () => (planFlat ?? []).filter((p) => p.status === 'uploaded').length,
    [planFlat],
  )

  // Spec 25 readiness — kept for AppointmentSection's prep summary input.
  const missingDocLabels = ['passport', 'oms'].filter(
    (t) => !(documents ?? []).some((d) => d.type === t),
  ).map((t) => (t === 'passport' ? 'паспорт' : 'ОМС'))
  const requiredDocsUploaded = 2 - missingDocLabels.length
  const docsReady = missingDocLabels.length === 0
  const planClear =
    (planFlat ?? []).filter((p) => p.status === 'assigned').length === 0
  const hasContent = (analyses ?? []).length > 0 || (complaints ?? []).length > 0
  const prepReady = docsReady && planClear && hasContent
  const prepBucketsTotal = (planFlat ?? []).length > 0 ? 5 : 4
  const prepBucketsDone =
    (docsReady ? 1 : 0) +
    (hasContent && (analyses ?? []).length > 0 ? 1 : 0) +
    ((complaints ?? []).length > 0 ? 1 : 0) +
    (mainAppointment ? 1 : 0) +
    ((planFlat ?? []).length > 0 && planClear ? 1 : 0)

  if (!patient) {
    return (
      <CockpitShell>
        <div className="flex-1 flex items-center justify-center text-ink-muted">
          {BACKEND_MODE && hydrating ? 'Загрузка карточки пациента…' : 'Пациент не найден'}
        </div>
      </CockpitShell>
    )
  }

  // Access gate — when the grant is revoked, the clinical record is locked
  // behind a banner instead of rendering content. The transition is visible
  // across all three surfaces from one shared state (CLAUDE.md guardrail 2).
  if (accessRevoked) {
    return (
      <CockpitShell>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <ShieldOff size={26} strokeWidth={2} />
            </div>
            <h2 className="text-h2-ui font-extrabold text-navy-900">
              Доступ к данным отозван
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-body text-ink-muted">
              {patient.name} больше не предоставляет Эндокор доступ к своим данным.
              Анализы и подготовка недоступны, пока доступ не будет выдан снова.
            </p>
            <button
              type="button"
              onClick={() => nav('/doctor/patients')}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 text-body font-bold text-white hover:bg-navy-800 transition-colors"
            >
              <ArrowLeft size={16} strokeWidth={2.2} />
              Вернуться к очереди
            </button>
          </div>
        </div>
      </CockpitShell>
    )
  }

  // «Запросить анализ» chip on a Vasily agenda item — issues the request
  // immediately. Plan-backed items re-issue the existing plan row via
  // `requestPlanItem` (drives «✓ Запрос отправлен» via
  // `requestable.lastRequestedAt`). Fresh items — created from a `data-gap`
  // synthesis with no underlying plan — create a brand-new request +
  // plan item via `sendRequest` so the patient sees a fresh checklist row.
  const requestAnalysisFromAgenda = (req: {
    planItemId?: string
    analysisType: import('../../store/types').AnalysisType
    label: string
    reason: string
    agendaItemId: string
  }) => {
    if (req.planItemId) {
      requestPlanItem(req.planItemId)
      return
    }
    const fresh = sendRequest({
      title: `Назначение: ${req.label}`,
      body: 'Перед следующим визитом нужно увидеть результат. Загрузите его, когда сдадите.',
      items: [
        {
          analysisType: req.analysisType,
          label: req.label,
          reason: req.reason,
          kind: 'lab',
        },
      ],
    })
    // Stamp the new plan item as requested so the agenda row that morphs
    // from «Пробел в данных» into a plan-pending row carries the
    // «✓ Запрос отправлен» confirmation pill instead of re-prompting the
    // doctor to send the same request again.
    for (const id of fresh.planItemIds) requestPlanItem(id)
  }

  // Bulk dispatch from «Назначения к приёму». Each order goes out via the
  // store: plan-backed orders re-issue the existing plan item (mirrors
  // `requestAnalysisFromAgenda`), fresh orders (rechecks, instrumental,
  // referrals, self-monitoring) create a brand-new request + plan item so
  // the patient sees fresh checklist rows. Title + body adapt to whether
  // the batch is all-lab or mixed; copy is patient-facing (this `body` is
  // surfaced on the patient request notification).
  const sendTestOrders = (orders: TestOrderItem[]) => {
    const fresh: TestOrderItem[] = []
    for (const o of orders) {
      if (o.planItemId) {
        requestPlanItem(o.planItemId)
      } else {
        fresh.push(o)
      }
    }
    if (fresh.length > 0) {
      const allLab = fresh.every((f) => (f.kind ?? 'lab') === 'lab')
      const onlyKind: OrderKind | null = fresh[0].kind ?? 'lab'
      const homogeneousKind = fresh.every(
        (f) => (f.kind ?? 'lab') === onlyKind,
      )
        ? onlyKind
        : null
      const titleSingle = (() => {
        const k = fresh[0].kind ?? 'lab'
        // «Назначение» reads as a prescription for non-lab singletons;
        // soften to a neutral framing for referrals / self-monitoring /
        // instrumental — keep «Назначение» only for labs.
        if (k === 'lab') return `Назначение: ${fresh[0].label}`
        return `К следующему визиту: ${fresh[0].label}`
      })()
      const titleMulti = allLab
        ? `Назначения: ${fresh.length} ${pluralRu(fresh.length, ['анализ', 'анализа', 'анализов'])}`
        : homogeneousKind === 'instrumental'
          ? `Обследования: ${fresh.length} ${pluralRu(fresh.length, ['пункт', 'пункта', 'пунктов'])}`
          : homogeneousKind === 'referral'
            ? `Направления: ${fresh.length} ${pluralRu(fresh.length, ['пункт', 'пункта', 'пунктов'])}`
            : `Назначения к приёму · ${fresh.length} ${pluralRu(fresh.length, ['пункт', 'пункта', 'пунктов'])}`
      // Pick the dominant patient-facing intent from the batch — if all items
      // share one, use it; otherwise fall back to `before-visit`. The patient
      // sees a single category header per request, so heterogeneous batches
      // collapse to the safest neutral category.
      const intents = fresh
        .map((f) => f.orderIntent)
        .filter((v): v is NonNullable<typeof v> => !!v)
      const allSame =
        intents.length === fresh.length &&
        intents.every((v) => v === intents[0])
      const batchIntent = allSame && intents.length > 0 ? intents[0] : 'before-visit'

      sendRequest({
        title: fresh.length === 1 ? titleSingle : titleMulti,
        body: allLab
          ? 'Перед следующим визитом нужно увидеть результаты. Загрузите их, когда сдадите.'
          : 'Несколько назначений к следующему визиту. Откройте список и отмечайте по мере выполнения.',
        items: fresh.map((f) => ({
          analysisType: f.analysisType ?? 'other',
          label: f.label,
          reason: f.rationale,
          kind: f.kind ?? 'lab',
          prep: f.prep,
        })),
        intent: batchIntent,
      })
      setSentRecheckIds((prev) => {
        const next = new Set(prev)
        for (const f of fresh) next.add(f.id)
        return next
      })
    }
  }

  // Inline composer in the «Назначения к следующему приёму» block — appends
  // a doctor-authored order to `customOrders`. Rationale is intentionally
  // soft («Добавлено врачом») so the row doesn't pretend to a derivation it
  // doesn't have; `intent` (doctor-internal reasoning chip) falls back to
  // `close-gap` for labs and `probe-signal` for non-lab. `orderIntent` is
  // the patient-facing intent picked in the composer (JTBD-1).
  const addCustomOrder = (draft: NewOrderDraft) => {
    const id = `order-custom-${Date.now()}`
    setCustomOrders((prev) => [
      ...prev,
      {
        id,
        label: draft.label,
        timing: 'к этому приёму',
        rationale: 'Добавлено врачом вручную.',
        intent: draft.kind === 'lab' ? 'close-gap' : 'probe-signal',
        orderIntent: draft.intent,
        kind: draft.kind,
        prep: draft.prep,
        analysisType: 'other',
      },
    ])
  }

  const preparatoryAppts = (appointments ?? []).filter(
    (a) => a.type === 'preparatory',
  )

  // Tab meta — counts and tone hints, so the tab strip carries signal at a
  // glance instead of just labels. Tones lift to red/amber only when there's
  // an actual issue to surface (critical lab, missing required docs, unseen
  // request).
  const overviewMeta: { count: number; tone: TabTone } = {
    count: visitGaps.length,
    tone:
      criticalLabs.length > 0
        ? 'critical'
        : visitGaps.length > 0
        ? 'warning'
        : 'neutral',
  }
  const detailMeta: Record<DetailTabId, { count: number; tone: TabTone }> = {
    documents: {
      count: (documents ?? []).length,
      tone: !docsReady ? 'warning' : 'neutral',
    },
    complaints: { count: (complaints ?? []).length, tone: 'neutral' },
    'extra-doctors': {
      count: SPECIALIST_OPTIONS.length,
      tone: 'neutral',
    },
  }

  return (
    <CockpitShell>
      <div className="flex-1 overflow-y-auto">
        {/* Patient identity + tab strip stay pinned together as the user
            scrolls the record. Wraps both in a single sticky block so the
            tabs always sit directly under the identity strip. */}
        <div className="sticky top-0 z-20 bg-page-bg">
          <PatientIdentityHeader
            patient={patient}
            appointmentDate={mainAppointment?.date ?? null}
            prepCompletedAt={prep.preparedAt}
            docsReady={docsReady}
            missingDocLabels={missingDocLabels}
            onBack={() => nav('/doctor/patients')}
          />

          <div className="px-8 pt-6">
            {/* Single full-width tab strip — all tabs share one row. Active
                tab fills with the brand cyan; inactive tabs are quiet text
                with a count badge. Rounded top corners visually fuse the
                strip with the content card below. */}
            <div className="flex items-center gap-1 rounded-t-2xl bg-surface border-b border-slate-100 px-4 pt-3 pb-3 overflow-x-auto overflow-y-hidden">
              {ALL_TABS.map(({ id, label, Icon }) => {
                const active = tab === id
                const meta =
                  id === 'overview' ? overviewMeta : detailMeta[id as DetailTabId]
                // Active state is painted by a shared `layoutId` pill so the
                // cyan fill morphs between tabs instead of teleporting. Under
                // reduced motion we fall back to a static background.
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id as Tab)}
                    className={`relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-body font-bold whitespace-nowrap flex-shrink-0 transition-colors ${
                      active
                        ? reduceMotion
                          ? 'bg-cyan-500 text-white'
                          : 'text-white'
                        : 'text-ink-muted hover:text-ink hover:bg-slate-50'
                    }`}
                  >
                    {active && !reduceMotion && (
                      <motion.span
                        layoutId="doctor-record-tab-pill"
                        aria-hidden
                        className="absolute inset-0 rounded-xl bg-cyan-500"
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 32,
                          mass: 0.6,
                        }}
                      />
                    )}
                    <Icon size={15} strokeWidth={2.2} className="relative" />
                    <span className="relative">{label}</span>
                    {meta.count > 0 && (
                      <span
                        className={`relative ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-micro font-bold tabular-nums ${
                          active
                            ? 'bg-white/20 text-white'
                            : meta.tone === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : meta.tone === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-ink-muted'
                        }`}
                      >
                        {meta.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-8 pb-6">
          <div className="rounded-b-2xl bg-surface p-6 min-h-[calc(100dvh-360px)]">
            {/* Tab swap: keyed crossfade on the description + panel together
                so the surface reads as a single panel state change. Exit is
                shorter than enter (60–70% ratio) — the user has already seen
                the old content. The animated tab pill carries the spatial
                continuity; this crossfade just softens the content cut. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.18,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <p className="text-body text-ink-muted mb-6">
                  {ALL_TABS.find((t) => t.id === tab)?.description}
                </p>
                {tab === 'overview' && (
                  <Overview
                    criticalLabs={criticalLabs}
                    deltaSinceLastVisit={deltaSinceLastVisit}
                    agenda={agenda}
                    keyMetrics={keyMetrics}
                    analyses={analyses ?? []}
                    acknowledgedAnalyses={acknowledgedAnalyses.filter(
                      (a) => a.patientId === patientId,
                    )}
                    prepUploads={prepUploads}
                    appointments={appointments ?? []}
                    sentRecheckIds={sentRecheckIds}
                    customOrders={customOrders}
                    dispatchedOrders={dispatchedOrders}
                    unseenUploads={unseenUploads}
                    mainAppointment={mainAppointment ?? null}
                    prepReady={prepReady}
                    prepBuckets={{
                      done: prepBucketsDone,
                      total: prepBucketsTotal,
                    }}
                    onOpenAnalysis={(a) => setOpenAnalysisId(a.id)}
                    onRequestAnalysis={requestAnalysisFromAgenda}
                    onSendTestOrders={sendTestOrders}
                    onAddOrder={addCustomOrder}
                  />
                )}
                {tab === 'documents' && (
                  <DocumentsSection
                    documents={documents ?? []}
                    regRequestedSlots={regRequestedSlots}
                    currentDoctorName={currentDoctorName}
                    onRequestViaRegistratura={(type) =>
                      setRegRequestedSlots((prev) =>
                        prev[type]
                          ? prev
                          : {
                              ...prev,
                              [type]: {
                                by: currentDoctorName,
                                at: new Date().toISOString(),
                              },
                            },
                      )
                    }
                  />
                )}
                {tab === 'complaints' && (
                  <ComplaintsSection complaints={complaints ?? []} />
                )}
                {tab === 'extra-doctors' && (
                  <AdditionalDoctorsSection
                    preparatoryAppointments={preparatoryAppts}
                    mainAppointment={mainAppointment ?? null}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {openAnalysis && (
        <AnalysisDrawer
          analysis={openAnalysis}
          linkedPlanItem={
            openAnalysis.linkedPlanItemId
              ? (planFlat ?? []).find(
                  (p) => p.id === openAnalysis.linkedPlanItemId,
                ) ?? null
              : null
          }
          onClose={() => setOpenAnalysisId(null)}
        />
      )}
    </CockpitShell>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

/**
 * Patient-anchored top header. Identity (avatar, name, age, dob, diagnosis)
 * sits as a single inline strip across the top, so the screen reads as a
 * patient record first and a visit context second. Status chips and the
 * primary CTA cluster on the right.
 */
function PatientIdentityHeader({
  patient,
  appointmentDate,
  prepCompletedAt,
  docsReady,
  missingDocLabels,
  onBack,
}: {
  patient: import('../../store/types').Patient
  appointmentDate: string | null
  prepCompletedAt: string | null
  docsReady: boolean
  missingDocLabels: string[]
  onBack: () => void
}) {
  const lead = appointmentDate ? formatAppointmentLead(appointmentDate) : null
  const isPastVisit = appointmentDate
    ? new Date(appointmentDate).getTime() < Date.now()
    : false
  const age = formatAge(patient.dob)
  const sexShort = patient.gender === 'female' ? 'Ж' : 'М'
  const identityParts = [age ? `${sexShort}, ${age}` : sexShort]
  if (patient.dob) identityParts[0] += ` (${formatDateDotted(patient.dob)})`
  return (
    <header className="flex flex-col gap-3 px-8 pt-5 pb-4 border-b border-divider">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 self-start text-caption text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} strokeWidth={2.2} />
        Все пациенты
      </button>

      <div className="min-w-0">
        <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
          {patient.name}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-caption text-ink-muted">
          <span>{identityParts[0]}</span>
          {patient.phone && <span>{patient.phone}</span>}
        </div>
      </div>

      {/* Fact chips: one chip system, tone signals category. Neutral = identity
          fact (diagnosis, visit). Success = state flipped to ready. Warning =
          state still needs attention. */}
      <div className="flex flex-wrap items-center gap-2 text-caption">
        {patient.diagnosis && (
          <MetaChip
            tone={patient.diagnosis.confirmed ? 'neutral' : 'warning'}
            label="Диагноз"
            value={patient.diagnosis.label}
          />
        )}
        {appointmentDate && (
          <MetaChip
            tone="neutral"
            label={isPastVisit ? 'Последний визит' : 'Визит'}
            value={
              lead
                ? `${formatDateTime(appointmentDate)} · ${lead.toLowerCase()}`
                : formatDateTime(appointmentDate)
            }
          />
        )}
        {prepCompletedAt ? (
          <MetaChip
            tone="success"
            label="Подготовка"
            value={`завершена ${formatDateShort(prepCompletedAt)}`}
          />
        ) : (
          <MetaChip
            tone="warning"
            label="Подготовка"
            value="не завершена"
          />
        )}
        <MetaChip
          tone={docsReady ? 'success' : 'warning'}
          label="Документы"
          value={
            docsReady
              ? 'паспорт и ОМС готовы'
              : `не загружены: ${missingDocLabels.join(' и ')}`
          }
        />
      </div>
    </header>
  )
}

function MetaChip({
  tone,
  label,
  value,
}: {
  tone: 'success' | 'warning' | 'neutral'
  label: string
  value: string
}) {
  const tones: Record<'success' | 'warning' | 'neutral', string> = {
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    neutral: 'bg-slate-100 text-slate-700',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${tones[tone]}`}
    >
      <span className="font-bold">{label}:</span>
      <span>{value}</span>
    </span>
  )
}

// ─── Overview = the 30-second pre-appointment brief ──────────────────────────

/**
 * Derives the set of proposed orders for the «Назначения к приёму» block.
 *
 * Two layers:
 *
 *   1. Lab orders — derived from the same signals the agenda exposes
 *      (close-gap / schedule-recheck / probe-signal). One per intent max.
 *   2. Non-lab orders — a small demo-grade set (УЗИ, направление,
 *      самоконтроль) seeded so the block demonstrates the full breadth of
 *      orderKinds the patient surface can receive. These are hardcoded
 *      rather than derived because the prototype doesn't model the signals
 *      that would justify them (anatomy, screening cadence) — that's
 *      acceptable for a pilot demo.
 *
 * Lossy but consistent: this is a prototype surface, not a clinical engine.
 */
function deriveTestOrders(
  agenda: AgendaItem[],
  deltas: MetricDelta[],
  sentRecheckIds: Set<string>,
): TestOrderItem[] {
  const orders: TestOrderItem[] = []
  const labelOf = (raw: string) => raw.split(' — ')[0].trim()

  const overdue = agenda.find((a) => a.sources.includes('plan-overdue'))
  if (overdue) {
    orders.push({
      id: `order-gap-${overdue.id}`,
      label: labelOf(overdue.label),
      timing: 'к этому приёму',
      rationale:
        overdue.rationale ??
        'По плану просрочен — переназначить, чтобы не зависеть от устной просьбы.',
      intent: 'close-gap',
      orderIntent: 'before-visit',
      kind: 'lab',
      prep: 'Сдавать утром, натощак. Любая лаборатория.',
      committed: !!overdue.requestable?.lastRequestedAt,
      planItemId: overdue.requestable?.planItemId,
      analysisType: overdue.requestable?.analysisType,
    })
  }

  const recheck =
    deltas.find((d) => d.trend === 'worsened') ??
    deltas.find((d) => d.field.toLowerCase().includes('hba1c'))
  if (recheck) {
    const v = Number.isInteger(recheck.current.value)
      ? recheck.current.value.toString()
      : recheck.current.value.toFixed(1)
    const recheckId = `order-recheck-${recheck.field}`
    orders.push({
      id: recheckId,
      label: `Повторный контроль: ${recheck.field}`,
      timing: 'через 3 месяца',
      rationale: `Текущий ${v}${recheck.unit ? ' ' + recheck.unit : ''} — выставить контроль динамики до следующего визита.`,
      intent: 'schedule-recheck',
      orderIntent: 'dynamics-control',
      kind: 'lab',
      analysisType: recheckFieldToAnalysisType(recheck.field),
      committed: sentRecheckIds.has(recheckId),
    })
  }

  const probe = agenda.find(
    (a) =>
      a.sources.includes('patient-question') &&
      !a.sources.includes('plan-overdue'),
  )
  if (probe) {
    orders.push({
      id: `order-probe-${probe.id}`,
      label: `${labelOf(probe.label)} · уточнение`,
      timing: 'к этому приёму',
      rationale:
        probe.rationale ??
        'Запрос пациента — закрыть сигнал данными, а не следующим визитом.',
      intent: 'probe-signal',
      orderIntent: 'additional-check',
      kind: 'lab',
      committed: !!probe.requestable?.lastRequestedAt,
      planItemId: probe.requestable?.planItemId,
      analysisType: probe.requestable?.analysisType,
    })
  }

  // ─── Non-lab demo orders ──────────────────────────────────────────────
  // Hardcoded to show the broader «Назначения к приёму» surface beyond
  // labs. `intent` is set to the closest lab-analogue (probe-signal /
  // schedule-recheck) but suppressed visually because `kind !== 'lab'`
  // makes the row render the kind chip instead.
  const uziId = 'order-instrumental-uzi-thyroid'
  orders.push({
    id: uziId,
    label: 'УЗИ щитовидной железы',
    timing: 'до следующего визита',
    rationale: 'Жалоба на тяжесть и комок в горле — закрыть инструментально.',
    intent: 'probe-signal',
    orderIntent: 'additional-check',
    kind: 'instrumental',
    prep: 'Запишитесь в регистратуре Эндокор. Подготовка не нужна.',
    committed: sentRecheckIds.has(uziId),
    analysisType: 'other',
  })

  const referralId = 'order-referral-ophthalmology'
  orders.push({
    id: referralId,
    label: 'Консультация офтальмолога',
    timing: 'в течение 3 месяцев',
    rationale:
      'Диабет 2 типа, 4 года — плановая проверка зрения у офтальмолога.',
    intent: 'schedule-recheck',
    orderIntent: 'dynamics-control',
    kind: 'referral',
    prep: 'Возьмите направление в регистратуре. Осмотр глазного дна — с расширением зрачка.',
    committed: sentRecheckIds.has(referralId),
    analysisType: 'other',
  })

  const diaryId = 'order-self-monitor-glucose-diary'
  orders.push({
    id: diaryId,
    label: 'Дневник глюкозы натощак',
    timing: '2 недели перед визитом',
    rationale: 'Опора для следующей встречи — без коррекции терапии.',
    intent: 'schedule-recheck',
    orderIntent: 'dynamics-control',
    kind: 'self-monitor',
    prep: 'Записывайте утром, до завтрака. Подойдёт любой глюкометр.',
    committed: sentRecheckIds.has(diaryId),
    analysisType: 'other',
  })

  return orders
}

/**
 * Builds the next-visit suggestion shown in the closing «Запись на приём»
 * block. Reads the same prep signals the rest of the brief already exposes
 * (critical labs, worsening trends, out-of-range metrics, recheck orders,
 * unresolved agenda items) so the recommendation feels grounded — not novel
 * judgement coming from a black box.
 *
 * Interval policy (prototype-grade, intentionally simple):
 *   · critical lab present                       → 1 месяц
 *   · HbA1c worsened OR any out-of-range metric  → 3 месяца
 *   · otherwise                                  → 6 месяцев
 */
function deriveNextVisit(
  criticalLabs: CriticalLab[],
  deltaSinceLastVisit: MetricDelta[],
  keyMetrics: MetricReading[],
  testOrders: TestOrderItem[],
  agenda: AgendaItem[],
): NextVisitSuggestion {
  const outOfRange = keyMetrics.filter(
    (m) => !m.lowConfidence && (m.range === 'above' || m.range === 'below'),
  )
  const hba1cWorsened = deltaSinceLastVisit.some(
    (d) => d.field.toLowerCase().includes('hba1c') && d.trend === 'worsened',
  )

  let interval: NextVisitInterval = '6m'
  let rationale =
    'Ключевые показатели в пределах допустимого — плановый контроль через 6 месяцев.'
  if (criticalLabs.length > 0) {
    interval = '1m'
    rationale = `${criticalLabs[0].field} в критическом диапазоне — контроль в ближайший месяц.`
  } else if (hba1cWorsened) {
    interval = '3m'
    const hba1c = deltaSinceLastVisit.find((d) =>
      d.field.toLowerCase().includes('hba1c'),
    )
    rationale = hba1c
      ? `HbA1c ухудшился до ${hba1c.current.value}${hba1c.unit ? ' ' + hba1c.unit : ''} — контроль через 3 месяца.`
      : 'HbA1c ухудшился — контроль через 3 месяца.'
  } else if (outOfRange.length > 0) {
    interval = '3m'
    rationale = `${outOfRange[0].field} вне нормы — контроль через 3 месяца.`
  }

  const carryover: NextVisitCarryover[] = []
  for (const o of testOrders) {
    if (o.intent === 'schedule-recheck' && !o.committed) {
      carryover.push({
        id: o.id,
        label: o.label,
        reason: `${o.timing}, к следующему визиту.`,
      })
    }
  }
  for (const a of agenda) {
    if (
      a.sources.includes('plan-pending') &&
      !a.requestable?.lastRequestedAt &&
      !carryover.some((c) => c.label === a.label.split(' — ')[0])
    ) {
      carryover.push({
        id: `carry-${a.id}`,
        label: a.label.split(' — ')[0],
        reason: 'Не выполнено к визиту — переносится в подготовку.',
      })
    }
  }

  // Assign default adherence priority. Heuristic: the primary clinical
  // follow-up is «обязательно»; the tail of the package is «желательно».
  // Doctor can flip per item in the UI. Critical-lab path makes everything
  // mandatory — no soft items when something is critical.
  const trimmed = carryover.slice(0, 4)
  const isCriticalCase = criticalLabs.length > 0
  const withPriority = trimmed.map((c, i) => ({
    ...c,
    priority:
      isCriticalCase || trimmed.length <= 1 || i < trimmed.length - 1
        ? ('must' as const)
        : ('nice' as const),
  }))

  return { interval, rationale, carryover: withPriority }
}

/** Maps a key-metric field name to the closest AnalysisType bucket. */
function recheckFieldToAnalysisType(
  field: string,
): import('../../store/types').AnalysisType {
  const f = field.toLowerCase()
  if (f.includes('hba1c')) return 'HbA1c'
  if (f.includes('глюкоза')) return 'glucose'
  if (f.includes('креатинин')) return 'creatinine'
  if (f.includes('холестерин') || f.includes('лпнп')) return 'cholesterol'
  return 'other'
}

function Overview({
  criticalLabs,
  deltaSinceLastVisit,
  agenda,
  keyMetrics,
  analyses,
  acknowledgedAnalyses,
  prepUploads,
  appointments,
  sentRecheckIds,
  customOrders,
  dispatchedOrders,
  unseenUploads,
  mainAppointment,
  prepReady,
  prepBuckets,
  onOpenAnalysis,
  onRequestAnalysis,
  onSendTestOrders,
  onAddOrder,
}: {
  criticalLabs: CriticalLab[]
  deltaSinceLastVisit: MetricDelta[]
  agenda: AgendaItem[]
  keyMetrics: MetricReading[]
  analyses: Analysis[]
  /** Accepted-only subset for clinical-interpretation blocks (Динамика). */
  acknowledgedAnalyses: Analysis[]
  /** Analyses uploaded since the patient's last completed visit, all states. */
  prepUploads: Analysis[]
  appointments: import('../../store/types').Appointment[]
  sentRecheckIds: Set<string>
  customOrders: TestOrderItem[]
  /** Dispatched orders ledger for «Назначения к следующему приёму» (JTBD-2). */
  dispatchedOrders: DispatchedOrderRow[]
  /** Attention indicator count for the ledger header (JTBD-3). */
  unseenUploads: number
  mainAppointment: import('../../store/types').Appointment | null
  prepReady: boolean
  prepBuckets: { done: number; total: number }
  onOpenAnalysis: (a: Analysis) => void
  onRequestAnalysis: (req: {
    /** Plan-backed re-request when present; absent for fresh requests built from a `data-gap` synthesis item. */
    planItemId?: string
    analysisType: import('../../store/types').AnalysisType
    label: string
    reason: string
    agendaItemId: string
  }) => void
  onSendTestOrders: (orders: TestOrderItem[]) => void
  onAddOrder: (draft: NewOrderDraft) => void
}) {
  const reduceMotion = useReducedMotion()
  const derivedOrders = deriveTestOrders(
    agenda,
    deltaSinceLastVisit,
    sentRecheckIds,
  )
  // Derived orders first, then doctor-added orders. Custom orders flip to
  // `committed` via the shared `sentRecheckIds` set populated by
  // `sendTestOrders` — same pattern as recheck orders.
  const customOrdersWithCommitted = customOrders.map((o) => ({
    ...o,
    committed: sentRecheckIds.has(o.id),
  }))
  const testOrders = [...derivedOrders, ...customOrdersWithCommitted]
  const nextVisit = deriveNextVisit(
    criticalLabs,
    deltaSinceLastVisit,
    keyMetrics,
    testOrders,
    agenda,
  )
  // Suppress the unused-var lint while keeping the prop available for any
  // future block that still wants the full history.
  void analyses

  // Outer choreography for the prep brief: each block enters with a small
  // upward settle, ~45ms apart, so the eye is led top-to-bottom on tab open.
  // Motion vocabulary mirrors sibling tabs (DocumentsSection, Complaints):
  // expo-out, opacity+y, opacity-only fallback under reduced motion. Total
  // sequence stays under the 700ms stagger ceiling for 8 blocks.
  const overviewContainer: Variants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: reduceMotion
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.045, delayChildren: 0.04 },
    },
  }
  const overviewItem: Variants = reduceMotion
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
    <motion.div
      className="flex flex-col gap-7"
      variants={overviewContainer}
      initial="hidden"
      animate="show"
    >
      {criticalLabs.length > 0 && (
        <motion.div variants={overviewItem}>
          <CriticalLabBanner labs={criticalLabs} />
        </motion.div>
      )}
      <motion.div variants={overviewItem}>
        <PrepUploadsBlock
          analyses={prepUploads}
          onOpenAnalysis={onOpenAnalysis}
        />
      </motion.div>
      <motion.div variants={overviewItem}>
        <OutOfRangeMetricsBlock
          metrics={keyMetrics.filter(
            (m) =>
              (m.range === 'above' || m.range === 'below') &&
              // Either the OCR was confident from the start, or the doctor
              // promoted it via manual confirmation.
              (!m.lowConfidence || m.verification === 'confirmed'),
          )}
          deltas={deltaSinceLastVisit}
          hasAnyMetrics={keyMetrics.length > 0}
          onOpenAnalysis={(id) => {
            const a = acknowledgedAnalyses.find((x) => x.id === id)
            if (a) onOpenAnalysis(a)
          }}
        />
      </motion.div>
      <motion.div variants={overviewItem}>
        <DynamicsBlock
          analyses={acknowledgedAnalyses}
          onOpenAnalysis={onOpenAnalysis}
        />
      </motion.div>
      <motion.div variants={overviewItem}>
        <TestOrdersBlock
          items={testOrders}
          dispatched={dispatchedOrders}
          unseenUploads={unseenUploads}
          onSendOrders={onSendTestOrders}
          onAddOrder={onAddOrder}
        />
      </motion.div>
      <motion.div variants={overviewItem}>
        <VisitAgendaBlock items={agenda} onRequestAnalysis={onRequestAnalysis} />
      </motion.div>
      <motion.div variants={overviewItem}>
        <NextVisitBlock suggestion={nextVisit} />
      </motion.div>
      <motion.div variants={overviewItem}>
        <AppointmentMonitorBlock
          mainAppointment={mainAppointment}
          prepReady={prepReady}
          prepBuckets={prepBuckets}
        />
      </motion.div>
    </motion.div>
  )
}

