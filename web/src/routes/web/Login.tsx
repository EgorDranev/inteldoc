import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Lock, Stethoscope, User } from 'lucide-react'
import Button from '../../components/primitives/Button'
import Input from '../../components/primitives/Input'
import CoBrandLockup from '../../components/system/CoBrandLockup'
import { signInWeb } from '../../store/actions'
import { useInteldoc } from '../../store/store'
import type { WebRole } from '../../store/types'

interface LocationState {
  from?: string
}

const ROLE_DEFAULT_ROUTE: Record<WebRole, string> = {
  doctor: '/doctor/patients',
  admin: '/admin/dashboard',
}

/**
 * Universal web login.
 *
 * Mocked auth — accepts any non-empty username and password and routes the
 * user into either the doctor cockpit or the partner-admin dashboard
 * depending on the selected role. There is no real verification; this is a
 * pilot prototype affordance, not a production sign-in surface.
 */
export default function WebLogin() {
  const nav = useNavigate()
  const { state } = useLocation()
  const fromPath = (state as LocationState | null)?.from
  const clinic = useInteldoc((s) => s.clinics[0])

  const [role, setRole] = useState<WebRole>('doctor')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Введите логин и пароль, чтобы продолжить.')
      return
    }
    signInWeb(role, username)
    const target =
      fromPath && matchesRole(fromPath, role)
        ? fromPath
        : ROLE_DEFAULT_ROUTE[role]
    nav(target, { replace: true })
  }

  return (
    <div className="min-h-[100dvh] flex bg-page-bg text-ink">
      {/* Brand panel */}
      <aside className="hidden lg:flex w-[460px] flex-shrink-0 flex-col justify-between bg-navy-900 text-white px-10 py-10">
        <CoBrandLockup
          variant="pill"
          size="md"
          dark
          partnerShortName={clinic?.shortName ?? null}
        />

        <div>
          <p className="text-micro font-bold uppercase tracking-caps text-cyan-400 mb-3">
            Кабинет клиники
          </p>
          <h1 className="text-[28px] font-bold leading-tight mb-3">
            Подготовленные пациенты — за один взгляд
          </h1>
          <p className="text-body text-slate-300 leading-relaxed">
            Войдите как врач, чтобы открыть очередь приёма, или как
            администратор клиники — чтобы видеть метрики внедрения и журнал
            доступов.
          </p>
        </div>

        <p className="text-caption text-slate-400 leading-relaxed">
          Прототип IntelDoc для пилота {clinic?.shortName ?? 'Эндокор'}. Это не
          боевой вход — данные мокированы, авторизация не проверяется.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-8">
            <CoBrandLockup
              variant="pill"
              size="md"
              partnerShortName={clinic?.shortName ?? null}
            />
          </div>

          <div className="mb-6">
            <p className="text-micro font-bold uppercase tracking-caps text-ink-muted mb-2">
              Вход в IntelDoc
            </p>
            <h2 className="text-[22px] font-bold text-ink-strong leading-tight">
              Войдите в кабинет
            </h2>
            <p className="text-body text-ink-muted leading-relaxed mt-2">
              Подойдёт любой логин и пароль — это демо-вход для пилота.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Роль"
            className="mb-5 inline-grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1 w-full"
          >
            <RoleTab
              active={role === 'doctor'}
              onClick={() => setRole('doctor')}
              icon={<Stethoscope size={16} strokeWidth={2.2} />}
              label="Врач"
            />
            <RoleTab
              active={role === 'admin'}
              onClick={() => setRole('admin')}
              icon={<LayoutDashboard size={16} strokeWidth={2.2} />}
              label="Администратор"
            />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Логин"
              type="text"
              autoComplete="username"
              placeholder="имя.фамилия"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                if (error) setError(null)
              }}
              required
            />
            <Input
              label="Пароль"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              required
              error={error ?? undefined}
            />

            <Button type="submit" full icon={<Lock size={16} strokeWidth={2.2} />}>
              Войти как {role === 'doctor' ? 'врач' : 'администратор'}
            </Button>
          </form>

          <div className="mt-6 rounded-xl bg-cyan-50 px-4 py-3 flex items-start gap-3">
            <User size={16} strokeWidth={2.2} className="text-cyan-600 mt-0.5 flex-shrink-0" />
            <p className="text-caption text-ink-muted leading-relaxed">
              Демо-вход без реальной проверки.{' '}
              {role === 'doctor'
                ? 'Откроет очередь врача и карточку пациента.'
                : 'Откроет панель внедрения и журнал доступов клиники.'}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function matchesRole(path: string, role: WebRole): boolean {
  if (role === 'doctor') return path.startsWith('/doctor')
  return path.startsWith('/admin')
}

interface RoleTabProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function RoleTab({ active, onClick, icon, label }: RoleTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-body font-bold tracking-ui transition-colors ${
        active
          ? 'bg-white text-ink-strong shadow-sm'
          : 'text-ink-muted hover:text-ink-strong'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
