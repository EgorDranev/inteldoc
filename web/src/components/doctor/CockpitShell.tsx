import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Users,
  CalendarDays,
  MessageSquare,
  Settings,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  FileText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInteldoc } from '../../store/store'
import { signOutWeb } from '../../store/actions'
import CoBrandLockup from '../system/CoBrandLockup'

/**
 * Sidebar + main-content shell used by every cockpit screen — both the
 * doctor's queue/record views and the partner-admin pilot dashboard.
 *
 * Layout follows IntelDoc_Doctor_Dashboard_Prototype_Brief.md §3 / §4:
 * 220 px sidebar with role-aware identity block + nav.
 */
export default function CockpitShell({ children }: { children: ReactNode }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const doctorId = useInteldoc((s) => s.currentDoctorId)
  const doctor = useInteldoc((s) => s.doctors.find((d) => d.id === doctorId))
  const clinic = useInteldoc((s) => s.clinics[0])
  const auth = useInteldoc((s) => s.webAuth)

  // Resolve role from the active session, falling back to the URL so the
  // sidebar still renders correctly during the brief moment between
  // navigation and auth-state propagation (e.g. demo-toolbar shortcuts).
  const role: 'doctor' | 'admin' =
    auth?.role ?? (pathname.startsWith('/admin') ? 'admin' : 'doctor')
  const isAdmin = role === 'admin'

  function handleSignOut() {
    signOutWeb()
    nav('/web/login', { replace: true })
  }

  type NavItem = {
    id: string
    to: string
    label: string
    Icon: LucideIcon
    disabled?: boolean
  }

  const doctorNav: NavItem[] = [
    { id: 'patients', to: '/doctor/patients', label: 'Пациенты', Icon: Users },
    { id: 'schedule', to: '/doctor/schedule', label: 'Расписание', Icon: CalendarDays, disabled: true },
    { id: 'messages', to: '/doctor/messages', label: 'Сообщения', Icon: MessageSquare, disabled: true },
    { id: 'settings', to: '/doctor/settings', label: 'Настройки', Icon: Settings, disabled: true },
  ]

  const adminNav: NavItem[] = [
    { id: 'pilot', to: '/admin/dashboard', label: 'Внедрение', Icon: LayoutDashboard },
    { id: 'access', to: '/admin/access', label: 'Доступы', Icon: ShieldCheck },
    { id: 'audit', to: '/admin/audit', label: 'Журнал', Icon: FileText, disabled: true },
    { id: 'settings', to: '/admin/settings', label: 'Настройки', Icon: Settings, disabled: true },
  ]

  const navItems = isAdmin ? adminNav : doctorNav

  const isActive = (to: string) =>
    to === '/admin/dashboard'
      ? pathname === '/admin' || pathname.startsWith('/admin/dashboard') || pathname.startsWith('/admin/kpi')
      : pathname.startsWith(to)

  return (
    <div className="min-h-[100dvh] bg-page-bg text-ink flex">
      <aside className="w-[220px] flex-shrink-0 bg-navy-900 text-white flex flex-col pb-6 border-r border-white/5">
        <div className="px-5 pt-6 pb-7">
          <CoBrandLockup
            variant="pill"
            size="sm"
            dark
            partnerShortName={clinic?.shortName ?? null}
          />
        </div>

        <div className="px-3 pb-4">
          {isAdmin ? (
            <div className="rounded-xl px-3 py-3 bg-white/5">
              <p className="text-body font-bold truncate">Анна Ковалёва</p>
              <p className="text-caption text-slate-400 truncate">
                Администратор · {clinic?.shortName ?? 'Эндокор'}
              </p>
            </div>
          ) : doctor ? (
            <div className="rounded-xl px-3 py-3 bg-white/5">
              <p className="text-body font-bold truncate">{doctor.name}</p>
              <p className="text-caption text-slate-400 truncate">
                {doctor.specialty}
              </p>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1">
          {navItems.map(({ id, to, label, Icon, disabled }) => {
            const active = isActive(to)
            return (
              <button
                key={id}
                disabled={disabled}
                onClick={() => !disabled && nav(to)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-body font-bold text-left transition-colors ${
                  active
                    ? 'bg-cyan-500/20 text-white'
                    : disabled
                    ? 'text-slate-500 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon size={18} strokeWidth={2} />
                {label}
              </button>
            )
          })}
        </nav>

        {auth && (
          <div className="px-3 pt-3 mt-2 border-t border-white/5">
            <p className="px-3 pb-1 text-micro font-bold uppercase tracking-caps text-slate-500 truncate">
              {auth.username}
            </p>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-body font-bold text-slate-300 hover:bg-white/5 transition-colors"
            >
              <LogOut size={16} strokeWidth={2} />
              Выйти
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
    </div>
  )
}
