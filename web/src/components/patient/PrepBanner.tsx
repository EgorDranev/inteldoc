import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useHomeEvents } from '../../store/hooks'
import type { HomeEventTone } from '../../lib/homeEvents'

/**
 * Home event lane. Renders the single highest-priority event (P0 = urgent,
 * P1 = attention). Standing state (appointment, plan, prep agenda) lives in
 * dedicated cards lower on the page; this slot is reserved for arrivals.
 */

type ToneStyle = {
  card: string
  pulseDot: string | null
  eyebrow: string
  body: string
  cta: string
}

const TONE: Record<HomeEventTone, ToneStyle> = {
  urgent: {
    card: 'bg-cyan-500 text-white shadow-lg',
    pulseDot: 'bg-white',
    eyebrow: 'text-white/85',
    body: 'text-white/85',
    cta: 'text-white',
  },
  attention: {
    card: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
    pulseDot: null,
    eyebrow: 'text-amber-700',
    body: 'text-amber-800/85',
    cta: 'text-amber-800',
  },
}

export default function PrepBanner() {
  const nav = useNavigate()
  const events = useHomeEvents()
  if (events.length === 0) return null
  const top = events[0]
  const tone = TONE[top.tone]
  const more = events.length - 1

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => nav(top.to)}
        className={`w-full text-left rounded-2xl p-5 active:scale-[0.99] transition-transform ${tone.card}`}
      >
        <div className="flex items-center gap-2 mb-2">
          {tone.pulseDot && (
            <span className={`h-2 w-2 rounded-full animate-pulse ${tone.pulseDot}`} />
          )}
          <span
            className={`text-micro font-bold uppercase tracking-caps ${tone.eyebrow}`}
          >
            {top.eyebrow}
          </span>
        </div>
        <p className="text-h3-ui font-bold leading-tight mb-1.5">{top.title}</p>
        <p className={`text-caption leading-relaxed mb-4 ${tone.body}`}>
          {top.body}
        </p>
        <span
          className={`inline-flex items-center gap-1 text-caption font-bold tracking-caps uppercase ${tone.cta}`}
        >
          {top.cta} <ChevronRight size={14} strokeWidth={2.5} />
        </span>
      </button>
      {more > 0 && (
        <button
          onClick={() => nav('/patient/notifications')}
          className="self-start px-1 text-caption font-bold tracking-caps uppercase text-cyan-600"
        >
          Все уведомления (+{more})
        </button>
      )}
    </div>
  )
}
