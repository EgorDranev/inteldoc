import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useInteldoc } from './store'
import * as selectors from './selectors'
import { buildHomeEvents, type HomeEvent } from '../lib/homeEvents'
import type {
  ID,
  PlanItem,
  PlanItemStatus,
  PrepSectionStatuses,
  SectionStatus,
} from './types'

/**
 * Selector hooks. Use `useShallow` for selectors that return arrays of
 * stable store references (each item is the same object across renders).
 * Compose grouped views with `useMemo` so the inner equality check is shallow.
 */

export const useActivePatient = () => useInteldoc(selectors.selectActivePatient)
export const useDoctorActivePatient = () =>
  useInteldoc(selectors.selectDoctorActivePatient)
export const useAppointment = (patientId?: ID | null) =>
  useInteldoc((s) => selectors.selectAppointmentForPatient(s, patientId ?? s.currentPatientId))
export const usePrepComplete = () => useInteldoc(selectors.selectPrepIsComplete)

// ─── Flat collection hooks (filtered arrays of store-stable refs) ───────────

export const useUnseenRequests = () =>
  useInteldoc(useShallow(selectors.selectUnseenRequests))

export const useRequestsForPatient = (patientId: ID) =>
  useInteldoc(useShallow((s) => selectors.selectRequestsForPatient(s, patientId)))

const usePlanItemsFlat = (patientId?: ID | null) =>
  useInteldoc(
    useShallow((s) =>
      s.planItems.filter(
        (p) => p.patientId === (patientId ?? s.currentPatientId),
      ),
    ),
  )

/** Plan items grouped by status — derived once per change to the flat list. */
export const usePlanItems = (
  patientId?: ID | null,
): Record<PlanItemStatus, PlanItem[]> => {
  const flat = usePlanItemsFlat(patientId)
  return useMemo(
    () => ({
      assigned: flat.filter((p) => p.status === 'assigned'),
      uploaded: flat.filter((p) => p.status === 'uploaded'),
      acknowledged: flat.filter((p) => p.status === 'acknowledged'),
    }),
    [flat],
  )
}

export const useAnalyses = (patientId?: ID | null) =>
  useInteldoc(
    useShallow((s) =>
      s.analyses
        .filter((a) => a.patientId === (patientId ?? s.currentPatientId))
        .slice()
        .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)),
    ),
  )

export const useDocuments = (patientId?: ID | null) =>
  useInteldoc(
    useShallow((s) =>
      s.documents.filter(
        (d) => d.patientId === (patientId ?? s.currentPatientId),
      ),
    ),
  )

/** Plan items overdue right now: assigned status + dueDate in the past. */
export const useOverduePlanItems = (patientId?: ID | null) => {
  const flat = usePlanItemsFlat(patientId)
  return useMemo(() => {
    const now = new Date().toISOString()
    return flat.filter(
      (p) => p.status === 'assigned' && p.dueDate !== undefined && p.dueDate < now,
    )
  }, [flat])
}

/** Access grants whose explicit expiry has passed and that were not revoked. */
export const useExpiredAccessGrants = (patientId?: ID | null) => {
  const flat = useInteldoc(
    useShallow((s) =>
      s.accessGrants.filter(
        (g) => g.patientId === (patientId ?? s.currentPatientId),
      ),
    ),
  )
  return useMemo(() => {
    const now = new Date().toISOString()
    return flat.filter(
      (g) => !g.revokedAt && g.expiresAt !== undefined && g.expiresAt < now,
    )
  }, [flat])
}

/**
 * Typed event lane for the Home banner. Composes existing primitives so the
 * banner stays idempotent — each event's ack path (e.g. `seenByPatient` for
 * doctor requests) lives on the underlying data.
 */
export const useHomeEvents = (patientId?: ID | null): HomeEvent[] => {
  const unseenRequests = useUnseenRequests()
  const overduePlanItems = useOverduePlanItems(patientId)
  const analyses = useAnalyses(patientId)
  const accessGrants = useInteldoc(
    useShallow((s) =>
      s.accessGrants.filter(
        (g) => g.patientId === (patientId ?? s.currentPatientId),
      ),
    ),
  )
  return useMemo(
    () =>
      buildHomeEvents({
        unseenRequests,
        overduePlanItems,
        analyses,
        accessGrants,
        now: new Date(),
      }),
    [unseenRequests, overduePlanItems, analyses, accessGrants],
  )
}

export const useComplaints = (patientId?: ID | null) =>
  useInteldoc(
    useShallow((s) =>
      s.complaints.filter(
        (c) => c.patientId === (patientId ?? s.currentPatientId),
      ),
    ),
  )

// ─── Object-shaped selectors → split into primitive selections ──────────────

export const useDocumentReadiness = () => {
  const docs = useDocuments()
  return useMemo(() => {
    const REQUIRED: Array<'passport' | 'oms'> = ['passport', 'oms']
    const uploaded = REQUIRED.filter((req) =>
      docs.some((d) => d.type === req),
    ).length
    const total = REQUIRED.length
    return { uploaded, total, percent: Math.round((uploaded / total) * 100) }
  }, [docs])
}

/**
 * Per-section status for the patient prep screen. Drives both the chip on
 * each section header and the «X из Y» counter — same logic, single source.
 *
 *  - Actionable sections (newAnalyses · documents · complaints · appointment)
 *    get not_started / in_progress / done.
 *  - Reference sections (additionalDoctors · oldAnalyses) get `info` —
 *    rendered with a «Справочно» chip and excluded from the counter.
 *  - newAnalyses is `null` (hidden) when no plan was ever issued.
 */
export const useSectionStatuses = (): PrepSectionStatuses => {
  const planItems = usePlanItems()
  const analyses = useAnalyses()
  const complaints = useComplaints()
  const docsReadiness = useDocumentReadiness()
  const appointment = useAppointment()
  return useMemo<PrepSectionStatuses>(() => {
    const planEverIssued =
      planItems.assigned.length +
        planItems.uploaded.length +
        planItems.acknowledged.length >
      0

    let newAnalyses: SectionStatus | null = null
    if (planEverIssued) {
      if (
        planItems.assigned.length === 0 &&
        planItems.uploaded.length === 0 &&
        planItems.acknowledged.length > 0
      ) {
        newAnalyses = 'done'
      } else if (
        planItems.uploaded.length > 0 ||
        planItems.acknowledged.length > 0
      ) {
        newAnalyses = 'in_progress'
      } else {
        newAnalyses = 'not_started'
      }
    }

    let documents: SectionStatus
    if (docsReadiness.uploaded === docsReadiness.total) documents = 'done'
    else if (docsReadiness.uploaded > 0) documents = 'in_progress'
    else documents = 'not_started'

    const complaintsStatus: SectionStatus =
      complaints.length > 0 ? 'done' : 'not_started'

    const appointmentStatus: SectionStatus = appointment
      ? 'done'
      : 'not_started'

    // Old analyses are history — useful, but not a "do this" task. Mark as
    // info so the patient sees presence without it counting against progress.
    void analyses

    return {
      newAnalyses,
      documents,
      complaints: complaintsStatus,
      additionalDoctors: 'info',
      oldAnalyses: 'info',
      appointment: appointmentStatus,
    }
  }, [planItems, analyses, complaints, docsReadiness, appointment])
}

export const usePrepProgress = () => {
  const statuses = useSectionStatuses()
  return useMemo(() => {
    const actionable: SectionStatus[] = [
      statuses.documents,
      statuses.complaints,
      statuses.appointment,
    ]
    if (statuses.newAnalyses !== null) actionable.push(statuses.newAnalyses)
    const done = actionable.filter((s) => s === 'done').length
    const total = actionable.length
    return { done, total, label: `${done} из ${total}` }
  }, [statuses])
}
