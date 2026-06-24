import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AlertTriangle,
  Calendar,
  FileText,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  useAnalyses,
  useAppointment,
  useDocuments,
  useExpiredAccessGrants,
  useOverduePlanItems,
  useRequestsForPatient,
  useActivePatient,
} from '../store/hooks'
import { useInteldoc } from '../store/store'
import { formatDateTime } from './formatters'

export type EventKind =
  | 'analysis'
  | 'document'
  | 'access'
  | 'request'
  | 'appointment'
  | 'overdue'

export interface HistoryEvent {
  id: string
  kind: EventKind
  Icon: LucideIcon
  title: string
  description?: string
  timestamp: string
  href?: string
  badge?: { tone: 'success' | 'info' | 'warning' | 'neutral'; label: string }
  /** True when the event needs the patient's attention. Drives the bell sheet
   *  and the unread dot in История. Computed from data state — no separate
   *  read store needed. */
  unread?: boolean
}

export function useHistoryEvents(): HistoryEvent[] {
  const analyses = useAnalyses()
  const documents = useDocuments()
  const appointment = useAppointment()
  const patient = useActivePatient()
  const requests = useRequestsForPatient(patient?.id ?? '')
  const grants = useInteldoc(
    useShallow((s) =>
      s.accessGrants.filter((g) => g.patientId === patient?.id),
    ),
  )
  const overduePlanItems = useOverduePlanItems(patient?.id ?? null)
  const expiredGrants = useExpiredAccessGrants(patient?.id ?? null)

  return useMemo(() => {
    const list: HistoryEvent[] = []

    for (const a of analyses) {
      const isLowConfidence = a.qualityCheck === 'acceptable'
      const needsReview = isLowConfidence && a.status !== 'acknowledged'
      const badge =
        a.status === 'acknowledged'
          ? ({ tone: 'success', label: 'Принято' } as const)
          : isLowConfidence
            ? ({ tone: 'warning', label: 'Требует проверки' } as const)
            : ({ tone: 'info', label: 'Загружено' } as const)
      const description =
        a.status === 'acknowledged'
          ? 'Принято врачом'
          : isLowConfidence
            ? 'Распознано не полностью — проверьте'
            : 'Распознано и сохранено'
      list.push({
        id: `an-${a.id}`,
        kind: 'analysis',
        Icon: FileText,
        title: a.label,
        description,
        timestamp: a.uploadedAt,
        href: `/patient/history/${a.id}`,
        badge,
        unread: needsReview,
      })
    }

    for (const d of documents) {
      list.push({
        id: `doc-${d.id}`,
        kind: 'document',
        Icon: Upload,
        title: `Документ: ${d.label}`,
        description: 'Загружен и зашифрован',
        timestamp: d.uploadedAt,
        badge: { tone: 'success', label: 'Готово' },
      })
    }

    for (const g of grants) {
      list.push({
        id: `ag-${g.id}-granted`,
        kind: 'access',
        Icon: ShieldCheck,
        title: 'Доступ выдан клинике Эндокор',
        description: g.scope === 'lifetime-clinic' ? 'Бессрочно, для всей клиники' : undefined,
        timestamp: g.grantedAt,
      })
      if (g.revokedAt) {
        const byAdmin = g.revokedBy === 'admin'
        list.push({
          id: `ag-${g.id}-revoked`,
          kind: 'access',
          Icon: ShieldX,
          title: byAdmin
            ? 'Доступ отозван администратором Эндокор'
            : 'Доступ отозван',
          description: byAdmin
            ? 'Клиника больше не видит ваши данные. Вы можете выдать доступ снова.'
            : undefined,
          href: byAdmin ? '/patient/profile' : undefined,
          timestamp: g.revokedAt,
          badge: { tone: 'warning', label: 'Отозван' },
          unread: byAdmin,
        })
      }
    }

    for (const g of expiredGrants) {
      list.push({
        id: `ag-${g.id}-expired`,
        kind: 'access',
        Icon: ShieldAlert,
        title: 'Доступ истёк',
        description: 'Откройте профиль, чтобы продлить',
        timestamp: g.expiresAt!,
        href: '/patient/profile',
        badge: { tone: 'warning', label: 'Истёк' },
        unread: true,
      })
    }

    for (const r of requests) {
      list.push({
        id: `req-${r.id}`,
        kind: 'request',
        Icon: Inbox,
        title: 'Запрос от врача',
        description: r.title,
        timestamp: r.createdAt,
        href: `/patient/notification/${r.id}`,
        badge: r.seenByPatient
          ? { tone: 'neutral', label: 'Просмотрено' }
          : { tone: 'warning', label: 'Новое' },
        unread: !r.seenByPatient,
      })
    }

    for (const p of overduePlanItems) {
      list.push({
        id: `pi-${p.id}-overdue`,
        kind: 'overdue',
        Icon: AlertTriangle,
        title: p.label,
        description: 'Просрочен пункт плана',
        timestamp: p.dueDate!,
        href: `/patient/notification/${p.requestId}`,
        badge: { tone: 'warning', label: 'Просрочено' },
        unread: true,
      })
    }

    if (appointment) {
      list.push({
        id: `appt-${appointment.id}`,
        kind: 'appointment',
        Icon: Calendar,
        title: 'Приём запланирован',
        description: formatDateTime(appointment.date),
        timestamp: appointment.createdAt,
        badge: { tone: 'success', label: 'Запись' },
      })
    }

    return list.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
  }, [analyses, documents, grants, expiredGrants, requests, overduePlanItems, appointment])
}

export const KIND_TINT: Record<EventKind, string> = {
  analysis: 'bg-cyan-50 text-cyan-500',
  document: 'bg-[#EDE9FE] text-violet-600',
  access: 'bg-success-bg text-emerald-600',
  request: 'bg-warning-bg text-amber-600',
  appointment: 'bg-[#FFEDD5] text-orange-700',
  overdue: 'bg-[#FEF2F2] text-rose-600',
}
