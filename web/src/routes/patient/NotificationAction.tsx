import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeft, ChevronRight, Info } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import Button from '../../components/primitives/Button'
import StatusBadge from '../../components/primitives/StatusBadge'
import TabBar from '../../components/primitives/TabBar'
import { useInteldoc } from '../../store/store'
import { openNotification } from '../../store/actions'
import type { ID, OrderKind, PlanItem } from '../../store/types'
import { formatDateTime } from '../../lib/formatters'

const ORDER_KIND_PATIENT_LABEL: Record<OrderKind, string> = {
  lab: 'Анализ',
  instrumental: 'Обследование',
  referral: 'Направление',
  'self-monitor': 'Самоконтроль',
}

function isUploadableKind(kind: OrderKind): boolean {
  return kind === 'lab' || kind === 'instrumental'
}

function statusLabelFor(item: PlanItem): string {
  const kind: OrderKind = item.kind ?? 'lab'
  if (item.status === 'acknowledged') return 'Принято'
  if (item.status === 'uploaded') return 'Загружено'
  return isUploadableKind(kind) ? 'К загрузке' : 'К выполнению'
}

export default function NotificationAction() {
  const nav = useNavigate()
  const { requestId } = useParams<{ requestId: ID }>()
  const request = useInteldoc((s) =>
    s.doctorRequests.find((r) => r.id === requestId) ?? null,
  )
  const items = useInteldoc(
    useShallow((s) =>
      request ? s.planItems.filter((p) => request.planItemIds.includes(p.id)) : [],
    ),
  )
  const doctor = useInteldoc((s) =>
    request ? s.doctors.find((d) => d.id === request.fromDoctorId) : null,
  )

  // Mark as seen on mount.
  useEffect(() => {
    if (request && !request.seenByPatient) {
      openNotification(request.id)
    }
  }, [request])

  if (!request) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-[110px] text-center gap-3">
          <p className="text-h2-ui font-bold text-ink-strong">Запрос не найден</p>
          <button
            onClick={() => nav('/patient/home')}
            className="text-[12px] font-bold tracking-caps uppercase text-cyan-500"
          >
            Вернуться на главную
          </button>
        </div>
        <TabBar />
      </PhoneFrame>
    )
  }

  // Bottom CTA only makes sense for uploadable kinds — referrals and
  // self-monitoring don't have an upload flow. Pick the first assigned
  // uploadable item; if none, hide the CTA entirely.
  const firstAssignedUploadable = items.find(
    (p) => p.status === 'assigned' && isUploadableKind(p.kind ?? 'lab'),
  )

  return (
    <PhoneFrame>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={() => nav('/patient/home')}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-ink" strokeWidth={2} />
        </button>
        <p className="text-[15px] font-bold text-ink-strong">Запрос от врача</p>
        <div className="h-9 w-9" />
      </div>

      <div
        className={`flex-1 overflow-y-auto px-5 ${firstAssignedUploadable ? 'pb-4' : 'pb-[110px]'} flex flex-col gap-4`}
      >
        <div className="rounded-2xl bg-cyan-500 p-5 text-white shadow-md">
          <p className="text-[10px] font-bold uppercase tracking-caps text-white/85 mb-2">
            Новый запрос
          </p>
          <p className="text-[18px] font-bold leading-tight">{request.title}</p>
          {doctor && (
            <p className="text-caption text-white/85 mt-2">
              {doctor.name} · {doctor.specialty}
            </p>
          )}
          <p className="text-caption text-white/70 mt-1 font-data">
            {formatDateTime(request.createdAt)}
          </p>
        </div>

        <div className="rounded-2xl bg-surface p-5">
          <p className="text-body text-ink-strong leading-relaxed">{request.body}</p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-2 px-1">
            Что нужно сделать
          </p>
          <div className="flex flex-col gap-2">
            {items.length === 0 ? (
              <p className="text-body text-ink-muted px-1">
                Конкретных пунктов нет — это сообщение для ознакомления.
              </p>
            ) : (
              items.map((p) => {
                const kind: OrderKind = p.kind ?? 'lab'
                const uploadable = isUploadableKind(kind)
                const tone =
                  p.status === 'acknowledged'
                    ? 'success'
                    : p.status === 'uploaded'
                    ? 'info'
                    : 'warning'
                const label = statusLabelFor(p)
                const tappable = p.status === 'assigned' && uploadable
                const showKindTag = kind !== 'lab'
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      tappable
                        ? nav(`/patient/upload/${p.analysisType}`)
                        : undefined
                    }
                    disabled={!tappable}
                    className="rounded-2xl bg-surface p-4 flex items-start gap-3 text-left disabled:opacity-80 disabled:cursor-default hover:bg-cyan-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      {showKindTag && (
                        <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-1">
                          {ORDER_KIND_PATIENT_LABEL[kind]}
                        </p>
                      )}
                      <p className="text-[15px] font-bold text-ink-strong leading-snug">
                        {p.label}
                      </p>
                      {p.reason && (
                        <p className="text-caption text-ink-muted leading-snug mt-0.5">
                          {p.reason}
                        </p>
                      )}
                      {p.prep && p.status !== 'acknowledged' && (
                        <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg bg-cyan-50/70 px-2 py-1 text-caption text-cyan-900/90">
                          <Info
                            size={12}
                            strokeWidth={2.4}
                            className="text-cyan-600 mt-0.5 flex-shrink-0"
                          />
                          <span className="leading-snug">{p.prep}</span>
                        </p>
                      )}
                    </div>
                    <StatusBadge tone={tone}>{label}</StatusBadge>
                    {tappable && (
                      <ChevronRight size={16} className="text-slate-400 mt-1" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {firstAssignedUploadable && (
        <div className="px-5 pb-3 pt-3 bg-white/85 backdrop-blur border-t border-slate-100 mb-[89px]">
          <Button
            full
            onClick={() =>
              nav(`/patient/upload/${firstAssignedUploadable.analysisType}`)
            }
          >
            Перейти к загрузке
          </Button>
        </div>
      )}

      <TabBar />
    </PhoneFrame>
  )
}
