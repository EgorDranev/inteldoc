import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RotateCcw,
  User,
  Stethoscope,
  LayoutDashboard,
  FastForward,
  X,
} from 'lucide-react'
import { enterPatientDemo, resetToSeed, signInWeb } from '../../store/actions'
import { SEGMENTS } from '../../store/segments'

/**
 * Demo toolbar — fixed pill at the bottom of the viewport.
 * Buttons:
 *  - Reset       → wipes localStorage and routes to entry
 *  - Patient     → routes to patient home
 *  - Doctor      → routes to doctor patient list
 *  - Segment N   → seeds the demo store to the start of segment N then routes
 */
export default function DemoToolbar() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function jumpToSegment(id: number) {
    if (busy) return
    setBusy(true)
    const seg = SEGMENTS.find((s) => s.id === id)!
    const route = await seg.apply()
    if (route.startsWith('/doctor')) signInWeb('doctor', 'demo.doctor')
    else if (route.startsWith('/admin')) signInWeb('admin', 'demo.admin')
    nav(route)
    setBusy(false)
    setOpen(false)
  }

  const Btn = ({
    icon,
    label,
    onClick,
    active,
  }: {
    icon: React.ReactNode
    label: string
    onClick: () => void
    active?: boolean
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-ui transition-colors ${
        active
          ? 'bg-cyan-500 text-white'
          : 'text-white/85 hover:text-white hover:bg-white/10'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2"
    >
      {open && (
        <div
          className="flex items-center gap-1 rounded-full bg-navy-900/95 px-2 py-1.5 shadow-md"
          style={{ backdropFilter: 'blur(20px)' }}
        >
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              onClick={() => jumpToSegment(s.id)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-ui text-white/85 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <span className="text-cyan-300 font-extrabold">{s.id}</span>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div
        className="flex items-center gap-1 rounded-full bg-navy-900/90 px-2 py-1.5 shadow-md"
        style={{ backdropFilter: 'blur(20px)' }}
      >
        <Btn
          icon={<RotateCcw size={13} strokeWidth={2.2} />}
          label="Сбросить"
          onClick={() => {
            resetToSeed()
            nav('/patient/entry/welcome')
          }}
        />
        <span className="h-4 w-px bg-white/15" />
        <Btn
          icon={<User size={13} strokeWidth={2.2} />}
          label="Пациент"
          onClick={() => {
            // Enter as the seeded persona (Мария) if no session exists, so the
            // cross-surface revocation state is reachable without re-onboarding.
            // No ?demo=home — that triggers a prep-segment bootstrap that
            // re-grants access and would wipe an admin revoke. enterPatientDemo
            // sets hasCompletedOnboarding so the onboarding gate still passes.
            enterPatientDemo()
            nav('/patient/home')
          }}
        />
        <Btn
          icon={<Stethoscope size={13} strokeWidth={2.2} />}
          label="Врач"
          onClick={() => {
            signInWeb('doctor', 'demo.doctor')
            nav('/doctor/patients')
          }}
        />
        <Btn
          icon={<LayoutDashboard size={13} strokeWidth={2.2} />}
          label="Админ"
          onClick={() => {
            signInWeb('admin', 'demo.admin')
            nav('/admin/dashboard')
          }}
        />
        <span className="h-4 w-px bg-white/15" />
        <Btn
          icon={open ? <X size={13} strokeWidth={2.2} /> : <FastForward size={13} strokeWidth={2.2} />}
          label={open ? 'Закрыть' : 'Сегменты'}
          onClick={() => setOpen((v) => !v)}
          active={open}
        />
      </div>
    </div>
  )
}
