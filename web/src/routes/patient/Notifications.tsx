import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, ChevronRight } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import StatusBadge from '../../components/primitives/StatusBadge'
import TabBar from '../../components/primitives/TabBar'
import {
  KIND_TINT,
  useHistoryEvents,
  type HistoryEvent,
} from '../../lib/historyEvents'
import { formatDateShort } from '../../lib/formatters'

function groupByDay(
  events: HistoryEvent[],
): Array<{ key: string; label: string; events: HistoryEvent[] }> {
  const groups = new Map<string, HistoryEvent[]>()
  for (const e of events) {
    const d = new Date(e.timestamp)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }
  return Array.from(groups.entries()).map(([key, arr]) => ({
    key,
    label: formatDateShort(arr[0].timestamp),
    events: arr,
  }))
}

export default function Notifications() {
  const nav = useNavigate()
  const all = useHistoryEvents()
  const unread = useMemo(() => all.filter((e) => e.unread), [all])
  const groups = groupByDay(unread)

  return (
    <PhoneFrame>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={() => nav(-1)}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-ink" strokeWidth={2} />
        </button>
        <span className="text-[18px] font-bold text-ink-strong">Уведомления</span>
        <div className="h-9 w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[110px] flex flex-col gap-4">
        {unread.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-cyan-50 text-cyan-500 flex items-center justify-center">
              <Bell size={28} strokeWidth={2} />
            </div>
            <p className="text-h2-ui font-bold text-ink-strong">
              Пока ничего нового
            </p>
            <p className="text-caption text-ink-muted leading-relaxed max-w-[280px]">
              Мы сообщим о запросах врача и обновлениях плана.
            </p>
            <button
              onClick={() => nav('/patient/history')}
              className="mt-3 text-[12px] font-bold tracking-caps uppercase text-cyan-500"
            >
              Открыть историю
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted px-1">
                {group.label}
              </p>
              {group.events.map((e) => {
                const card = (
                  <div
                    className={`rounded-2xl bg-white p-4 flex items-start gap-3 ${
                      e.href ? 'hover:bg-slate-50 transition-colors text-left' : ''
                    }`}
                  >
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        KIND_TINT[e.kind]
                      }`}
                    >
                      <e.Icon size={20} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-ink-strong leading-snug">
                        {e.title}
                      </p>
                      {e.description && (
                        <p className="text-caption text-ink-muted leading-snug mt-0.5">
                          {e.description}
                        </p>
                      )}
                      {e.badge && (
                        <div className="mt-1.5">
                          <StatusBadge tone={e.badge.tone}>{e.badge.label}</StatusBadge>
                        </div>
                      )}
                    </div>
                    {e.href && (
                      <ChevronRight size={18} className="text-slate-400 mt-1" />
                    )}
                  </div>
                )
                return e.href ? (
                  <button
                    key={e.id}
                    onClick={() => e.href && nav(e.href)}
                    className="text-left"
                  >
                    {card}
                  </button>
                ) : (
                  <div key={e.id}>{card}</div>
                )
              })}
            </section>
          ))
        )}
      </div>

      <TabBar />
    </PhoneFrame>
  )
}
