import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, Plus, Search, X } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import TopHeader from '../../components/patient/TopHeader'
import TabBar from '../../components/primitives/TabBar'
import StatusBadge from '../../components/primitives/StatusBadge'
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

export default function History() {
  const nav = useNavigate()
  const events = useHistoryEvents()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    if (!q) return events
    return events.filter((e) => {
      const haystack = [e.title, e.description ?? '', e.badge?.label ?? '']
        .join(' ')
        .toLocaleLowerCase('ru')
      return haystack.includes(q)
    })
  }, [events, query])

  const groups = groupByDay(filtered)
  const hasQuery = query.trim().length > 0

  return (
    <PhoneFrame>
      <TopHeader title="История" />

      {events.length > 0 && (
        <div className="px-5 pt-1 pb-3">
          <div className="relative">
            <Search
              size={18}
              strokeWidth={2}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по истории"
              aria-label="Поиск по истории"
              className="w-full rounded-2xl bg-slate-100 border border-transparent focus:border-cyan-400 focus:bg-white focus:outline-none pl-10 pr-10 py-3 text-[15px] text-ink-strong placeholder:text-ink-muted transition-colors"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 pb-[110px] flex flex-col gap-4">
        {events.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-cyan-50 text-cyan-500 flex items-center justify-center">
              <FileText size={28} strokeWidth={2} />
            </div>
            <p className="text-h2-ui font-bold text-ink-strong">
              Здесь будет история ваших действий
            </p>
            <p className="text-caption text-ink-muted leading-relaxed max-w-[280px]">
              Когда вы начнёте загружать анализы и получать обновления — они появятся здесь.
            </p>
            <button
              onClick={() => nav('/patient/upload')}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-500 text-white px-5 py-3 text-[15px] font-bold tracking-ui"
            >
              <Plus size={18} strokeWidth={2.5} />
              Добавить анализ
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <Search size={24} strokeWidth={2} />
            </div>
            <p className="text-h2-ui font-bold text-ink-strong">
              Ничего не найдено
            </p>
            <p className="text-caption text-ink-muted leading-relaxed max-w-[280px]">
              Попробуйте другой запрос — например, «глюкоза», «доступ» или «приём».
            </p>
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
                    className={`relative rounded-2xl bg-white p-4 flex items-start gap-3 ${
                      e.href ? 'hover:bg-slate-50 transition-colors text-left' : ''
                    }`}
                  >
                    {e.unread && (
                      <span
                        aria-label="Новое"
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-cyan-500"
                      />
                    )}
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
