import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Heart,
  History as HistoryIcon,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
  UserCircle2,
} from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import TopHeader from '../../components/patient/TopHeader'
import RevokeAccessSheet from '../../components/patient/RevokeAccessSheet'
import EditIdentitySheet from '../../components/patient/EditIdentitySheet'
import EditBaselineSheet from '../../components/patient/EditBaselineSheet'
import ConsentsSheet from '../../components/patient/ConsentsSheet'
import MyDataSheet from '../../components/patient/MyDataSheet'
import DeleteAccountSheet from '../../components/patient/DeleteAccountSheet'
import TabBar from '../../components/primitives/TabBar'
import Avatar from '../../components/primitives/Avatar'
import Button from '../../components/primitives/Button'
import { useActivePatient } from '../../store/hooks'
import { useInteldoc } from '../../store/store'
import { CONSENT_BLOCKS } from '../../lib/consent-text'
import {
  deleteAccount,
  regrantAccess,
  resetToSeed,
  revokeAccess,
  setMarketingChannel,
  signOutPatient,
} from '../../store/actions'
import { DEMO_MODE } from '../../api/config'
import StatusChip from '../../components/StatusChip'
import { formatAge, formatDateFull, formatDateShort } from '../../lib/formatters'

interface ToggleProps {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
  Icon?: typeof Bell
}

function Toggle({ label, description, value, onChange, Icon }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-3 py-3 text-left"
      aria-pressed={value}
    >
      {Icon && (
        <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
          <Icon size={18} strokeWidth={2} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-ink-strong leading-tight">{label}</p>
        {description && (
          <p className="text-caption text-ink-muted leading-snug mt-0.5">
            {description}
          </p>
        )}
      </div>
      <span
        className={`h-6 w-10 rounded-full transition-colors flex items-center px-0.5 ${
          value ? 'bg-cyan-500' : 'bg-slate-200'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

function SectionHeader({
  Icon,
  title,
}: {
  Icon: typeof Bell
  title: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className="text-cyan-500" strokeWidth={2} />
      <p className="text-[15px] font-bold text-ink-strong">{title}</p>
    </div>
  )
}

export default function Profile() {
  const nav = useNavigate()
  const patient = useActivePatient()
  // The patient's single Эндокор grant — revoked or not. Reading the revoked grant
  // (not filtering it out) lets the card show an explicit «отозван» state
  // instead of silently going inert when an admin revokes from A02.
  const grant = useInteldoc((s) =>
    s.accessGrants.find((g) => g.patientId === s.currentPatientId),
  )
  const accessRevoked = !!grant?.revokedAt
  const revokedByAdmin = grant?.revokedBy === 'admin'

  // Local-only notification settings (no contract field — see follow-up).
  const [pushOn, setPushOn] = useState(true)
  const [emailOn, setEmailOn] = useState(false)
  const [reminderOn, setReminderOn] = useState(true)

  const [revokeOpen, setRevokeOpen] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const [consentsOpen, setConsentsOpen] = useState(false)
  const [myDataOpen, setMyDataOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const consentBundle = useInteldoc((s) =>
    s.consentBundles.find((b) => b.userId === s.currentPatientId),
  )

  // Marketing-channel toggles mirror the onboarding consent sheet: source of
  // truth is the patient's `marketing` consent record, not local state.
  const marketingRecord = consentBundle?.consents.find(
    (c) => c.id === 'marketing',
  )
  const marketingChannels = marketingRecord?.channels ?? []
  const marketingWithdrawn = !!marketingRecord?.withdrawnAt

  // True when any consent the user has is outdated or withdrawn — drives
  // the inline «требует внимания» chip on the privacy entry row.
  const consentNeedsAttention = useMemo(() => {
    if (!consentBundle) return false
    return consentBundle.consents.some((c) => {
      if (c.withdrawnAt) return true
      const spec = CONSENT_BLOCKS.find((s) => s.id === c.id)
      if (!spec) return false
      return c.accepted && c.version !== spec.version
    })
  }, [consentBundle])

  function handleDelete() {
    deleteAccount()
    setDeleteOpen(false)
    setMyDataOpen(false)
    nav('/patient/entry/welcome', { replace: true })
  }

  // Identity verification state: clinic-confirmed unless the patient has
  // edited identity fields after the last verification timestamp.
  const identityPending = useMemo(() => {
    if (!patient?.identityUpdatedAt) return false
    if (!patient.identityVerifiedAt) return true
    return patient.identityUpdatedAt > patient.identityVerifiedAt
  }, [patient?.identityUpdatedAt, patient?.identityVerifiedAt])

  const bmi = useMemo(() => {
    if (!patient?.heightCm || !patient?.weightKg) return null
    const m = patient.heightCm / 100
    if (m <= 0) return null
    return patient.weightKg / (m * m)
  }, [patient?.heightCm, patient?.weightKg])

  function bmiLabel(v: number): { label: string; tone: 'ok' | 'warn' } {
    if (v < 18.5) return { label: 'низкий', tone: 'warn' }
    if (v < 25) return { label: 'норма', tone: 'ok' }
    if (v < 30) return { label: 'повышен', tone: 'warn' }
    return { label: 'высокий', tone: 'warn' }
  }

  function formatOms(oms?: string): string {
    if (!oms) return '—'
    // 16-digit ОМС: group as XXXX XXXX XXXX XXXX, mask middle two groups.
    const digits = oms.replace(/\D/g, '')
    if (digits.length !== 16) return oms
    return `${digits.slice(0, 4)} •••• •••• ${digits.slice(12)}`
  }

  function logout() {
    if (DEMO_MODE) {
      // Demo: wipe back to the seeded persona and restart the walkthrough.
      resetToSeed()
      nav('/patient/entry/welcome', { replace: true })
    } else {
      // Production: end the real session and return to the login screen.
      signOutPatient()
      nav('/patient/login', { replace: true })
    }
  }

  function confirmRevoke() {
    if (grant) revokeAccess(grant.id)
    setRevokeOpen(false)
  }

  const dobLine = patient?.dob
    ? `${formatAge(patient.dob)} · ${formatDateShort(patient.dob)}`
    : 'Дата рождения не указана'

  return (
    <PhoneFrame>
      <TopHeader title="Профиль" />

      <div className="flex-1 overflow-y-auto px-5 pb-[110px] flex flex-col gap-4">
        {/* 1 · Identity card — «Личная карточка» */}
        <div className="rounded-2xl bg-surface p-5">
          <div className="flex items-start gap-4">
            <Avatar name={patient?.name ?? 'Иванова Мария'} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-bold text-ink-strong leading-tight">
                {patient?.name ?? 'Иванова Мария Сергеевна'}
              </p>
              <p className="text-caption text-ink-muted font-data mt-0.5">
                {dobLine}
              </p>
              {patient && (
                <div
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    identityPending
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {identityPending ? (
                    <>
                      <Clock size={12} strokeWidth={2.4} />
                      Изменения отправлены в Эндокор
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={12} strokeWidth={2.4} />
                      Совпадает с данными Эндокор
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIdentityOpen(true)}
              disabled={!patient}
              className="h-9 w-9 rounded-xl bg-slate-100 text-ink-strong hover:bg-slate-200 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              aria-label="Изменить личные данные"
            >
              <Pencil size={16} strokeWidth={2.2} />
            </button>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-caption">
              <span className="text-ink-muted">Пол</span>
              <span className="text-ink-strong font-bold">
                {patient?.gender === 'male' ? 'Мужской' : patient?.gender === 'female' ? 'Женский' : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-caption">
              <span className="text-ink-muted">Полис ОМС</span>
              <span className="text-ink-strong font-bold font-data">
                {formatOms(patient?.identifiers.oms)}
              </span>
            </div>
            {patient?.identityVerifiedAt && !identityPending && (
              <p className="text-[11px] text-ink-muted leading-snug pt-1">
                Эндокор подтвердил совпадение {formatDateFull(patient.identityVerifiedAt)}
              </p>
            )}
            {identityPending && (
              <p className="text-[11px] text-ink-muted leading-snug pt-1">
                Клиника проверит изменения при следующем приёме.
              </p>
            )}
          </div>
        </div>

        {/* 2 · Medical baseline — «Базовые данные» */}
        <div className="rounded-2xl bg-surface p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Heart size={18} className="text-cyan-500" strokeWidth={2} />
              <p className="text-[15px] font-bold text-ink-strong">Базовые данные</p>
            </div>
            <button
              type="button"
              onClick={() => setBaselineOpen(true)}
              disabled={!patient}
              className="h-9 w-9 rounded-xl bg-slate-100 text-ink-strong hover:bg-slate-200 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              aria-label="Изменить базовые данные"
            >
              <Pencil size={16} strokeWidth={2.2} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-caps font-bold text-ink-muted">
                Рост
              </p>
              <p className="text-body font-bold text-ink-strong font-data mt-0.5">
                {patient?.heightCm ? `${patient.heightCm} см` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-caps font-bold text-ink-muted">
                Вес
              </p>
              <p className="text-body font-bold text-ink-strong font-data mt-0.5">
                {patient?.weightKg ? `${patient.weightKg} кг` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-caps font-bold text-ink-muted">
                ИМТ
              </p>
              {bmi ? (
                <p className="text-body font-bold text-ink-strong font-data mt-0.5">
                  {bmi.toFixed(1)}
                  <span
                    className={`ml-1 text-[10px] font-bold ${
                      bmiLabel(bmi).tone === 'ok'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {bmiLabel(bmi).label}
                  </span>
                </p>
              ) : (
                <p className="text-body font-bold text-ink-strong font-data mt-0.5">—</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-caps font-bold text-ink-muted mb-1.5">
                Хронические состояния
              </p>
              {patient?.chronicConditions && patient.chronicConditions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patient.chronicConditions.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center rounded-full bg-cyan-50 text-cyan-700 px-2.5 py-1 text-caption font-bold"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-caption text-ink-muted">Не указаны</p>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-caps font-bold text-ink-muted mb-1.5">
                Аллергии
              </p>
              {patient?.allergies && patient.allergies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patient.allergies.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 px-2.5 py-1 text-caption font-bold"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-caption text-ink-muted">Не указаны</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-ink-muted leading-snug">
            <UserCircle2 size={12} strokeWidth={2.4} className="text-cyan-500 flex-shrink-0" />
            <span>
              Это видит ваш врач в Эндокор
              {patient?.baselineUpdatedAt && (
                <> · обновлено {formatDateShort(patient.baselineUpdatedAt)}</>
              )}
            </span>
          </div>
        </div>

        {/* 2 · Clinic / partner block — highest-trust */}
        <div className="rounded-2xl bg-surface p-5">
          <SectionHeader Icon={ShieldCheck} title="Связь с клиникой" />

          <div className="flex items-center justify-between text-caption mb-2">
            <span className="text-ink-muted">Получатель</span>
            <span className="text-ink-strong font-bold">Эндокор</span>
          </div>

          {accessRevoked ? (
            <>
              <div className="flex items-center justify-between text-caption mb-2">
                <span className="text-ink-muted">Статус</span>
                <StatusChip label="Доступ отозван" variant="error" />
              </div>
              {grant?.revokedAt && (
                <div className="flex items-center justify-between text-caption">
                  <span className="text-ink-muted">
                    {revokedByAdmin ? 'Отозван администратором Эндокор' : 'Отозван вами'}
                  </span>
                  <span className="text-ink-strong font-bold">
                    {formatDateShort(grant.revokedAt)}
                  </span>
                </div>
              )}
              {revokedByAdmin && (
                <p className="mt-3 text-caption text-ink-muted">
                  Администратор Эндокор отозвал доступ. Клиника больше не видит ваши
                  данные. Вы можете выдать доступ снова.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-caption mb-2">
                <span className="text-ink-muted">Срок</span>
                <span className="text-ink-strong font-bold">
                  {grant?.expiresAt
                    ? `до ${formatDateShort(grant.expiresAt)}`
                    : 'бессрочно'}
                </span>
              </div>
              <div className="flex items-center justify-between text-caption mb-2">
                <span className="text-ink-muted">Распространяется на</span>
                <span className="text-ink-strong font-bold">
                  всех врачей клиники
                </span>
              </div>
              {grant?.lastViewedAt && (
                <div className="flex items-center justify-between text-caption">
                  <span className="text-ink-muted">Последний просмотр</span>
                  <span className="text-ink-strong font-bold">
                    {formatDateShort(grant.lastViewedAt)}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {accessRevoked ? (
              <Button
                variant="primary"
                size="md"
                full
                icon={<ShieldCheck size={16} strokeWidth={2.4} />}
                onClick={() => grant && regrantAccess(grant.id)}
              >
                Выдать доступ снова
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                full
                icon={<ShieldOff size={16} strokeWidth={2.4} />}
                onClick={() => setRevokeOpen(true)}
                disabled={!grant}
              >
                Отозвать доступ
              </Button>
            )}
            <button
              onClick={() => nav('/patient/history')}
              className="flex items-center justify-center gap-1.5 py-1.5 text-caption font-bold text-cyan-500 hover:text-cyan-600 transition-colors"
            >
              <HistoryIcon size={14} strokeWidth={2.4} />
              История доступа
              <ChevronRight size={14} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* 3 · Contacts */}
        <div className="rounded-2xl bg-surface p-5">
          <SectionHeader Icon={Phone} title="Контакты" />

          <div className="flex flex-col gap-3">
            {patient?.phone && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
                  <Phone size={18} strokeWidth={2} />
                </div>
                <p className="text-body text-ink-strong font-data">
                  {patient.phone}
                </p>
              </div>
            )}

            {patient?.email ? (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
                  <Mail size={18} strokeWidth={2} />
                </div>
                <p className="text-body text-ink-strong">{patient.email}</p>
              </div>
            ) : (
              <button
                type="button"
                className="flex items-center gap-3 text-left rounded-xl -mx-1 px-1 py-1 hover:bg-slate-50 transition-colors"
              >
                <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0">
                  <Mail size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <Plus size={14} className="text-ink-muted" strokeWidth={2.4} />
                  <p className="text-body text-ink-muted">Добавить email</p>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* 4 · Notification settings */}
        <div className="rounded-2xl bg-surface p-5">
          <SectionHeader Icon={Bell} title="Уведомления" />

          <Toggle
            Icon={Smartphone}
            label="Push-уведомления"
            description="Сообщим о запросах врача и обновлениях плана"
            value={pushOn}
            onChange={setPushOn}
          />
          <div className="border-t border-slate-100" />
          <Toggle
            Icon={Mail}
            label="Email-уведомления"
            description="Дублируем важные события на почту"
            value={emailOn}
            onChange={setEmailOn}
          />
          <div className="border-t border-slate-100" />
          <Toggle
            Icon={Bell}
            label="Напоминания о подготовке"
            description="Заранее напомним, что осталось загрузить"
            value={reminderOn}
            onChange={setReminderOn}
          />
        </div>

        {/* 4b · Marketing & info channels — mirrors onboarding consent */}
        <div className="rounded-2xl bg-surface p-5">
          <SectionHeader
            Icon={Megaphone}
            title="Информационные и рекламные рассылки"
          />
          <p className="text-caption text-ink-muted leading-snug mb-2">
            Новости Эндокор, советы по подготовке и предложения. Не относится к
            уведомлениям о приёме и плане — их вы получаете всегда.
          </p>

          <Toggle
            Icon={Mail}
            label="Email"
            value={!marketingWithdrawn && marketingChannels.includes('email')}
            onChange={(v) => setMarketingChannel('email', v)}
          />
          <div className="border-t border-slate-100" />
          <Toggle
            Icon={MessageSquare}
            label="SMS"
            value={!marketingWithdrawn && marketingChannels.includes('sms')}
            onChange={(v) => setMarketingChannel('sms', v)}
          />
          <div className="border-t border-slate-100" />
          <Toggle
            Icon={Smartphone}
            label="Push-уведомления"
            value={!marketingWithdrawn && marketingChannels.includes('push')}
            onChange={(v) => setMarketingChannel('push', v)}
          />
        </div>

        {/* 5 · Privacy & data — consents, data inventory, history, delete */}
        <div className="rounded-2xl bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lock size={18} className="text-cyan-500" strokeWidth={2} />
            <p className="text-[15px] font-bold text-ink-strong">
              Приватность и данные
            </p>
          </div>

          <div className="flex flex-col divide-y divide-slate-100 -mx-1">
            <button
              type="button"
              onClick={() => setConsentsOpen(true)}
              className="flex items-center gap-3 px-1 py-3 text-left hover:bg-slate-50 transition-colors rounded-xl"
            >
              <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
                <FileText size={18} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-bold text-ink-strong">
                    Согласия и документы
                  </p>
                  {consentNeedsAttention && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                      Требует внимания
                    </span>
                  )}
                </div>
                <p className="text-caption text-ink-muted leading-snug mt-0.5">
                  Перечитать, переподписать или отозвать согласия
                </p>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setMyDataOpen(true)}
              className="flex items-center gap-3 px-1 py-3 text-left hover:bg-slate-50 transition-colors rounded-xl"
            >
              <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
                <Database size={18} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-ink-strong">
                  Какие данные о вас хранятся
                </p>
                <p className="text-caption text-ink-muted leading-snug mt-0.5">
                  Прозрачный список: что, зачем и как долго
                </p>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => nav('/patient/history')}
              className="flex items-center gap-3 px-1 py-3 text-left hover:bg-slate-50 transition-colors rounded-xl"
            >
              <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
                <HistoryIcon size={18} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-ink-strong">
                  История действий
                </p>
                <p className="text-caption text-ink-muted leading-snug mt-0.5">
                  Что и когда происходило с вашими данными
                </p>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-3 px-1 py-3 text-left hover:bg-rose-50/40 transition-colors rounded-xl"
            >
              <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-rose-600">
                  Удалить аккаунт
                </p>
                <p className="text-caption text-ink-muted leading-snug mt-0.5">
                  Право на забвение — необратимое удаление данных
                </p>
              </div>
              <ChevronRight size={18} className="text-rose-300" />
            </button>
          </div>
        </div>

        {/* 6 · System zone — visually recessed, dev tooling */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col items-center gap-2">
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption font-bold text-ink-muted hover:text-ink-strong transition-colors"
          >
            <LogOut size={14} strokeWidth={2.4} />
            {DEMO_MODE ? 'Сбросить демо-профиль' : 'Выйти'}
          </button>
          {DEMO_MODE && (
            <p className="text-[11px] text-ink-muted leading-relaxed text-center px-4">
              Это демо-режим. Реальные данные не передаются.
            </p>
          )}
        </div>
      </div>

      <RevokeAccessSheet
        open={revokeOpen}
        clinicName="Эндокор"
        onClose={() => setRevokeOpen(false)}
        onConfirm={confirmRevoke}
      />
      {patient && (
        <>
          <EditIdentitySheet
            open={identityOpen}
            patient={patient}
            onClose={() => setIdentityOpen(false)}
          />
          <EditBaselineSheet
            open={baselineOpen}
            patient={patient}
            onClose={() => setBaselineOpen(false)}
          />
        </>
      )}
      <ConsentsSheet
        open={consentsOpen}
        onClose={() => setConsentsOpen(false)}
      />
      <MyDataSheet
        open={myDataOpen}
        onClose={() => setMyDataOpen(false)}
        onDeleteAccount={() => {
          setMyDataOpen(false)
          setDeleteOpen(true)
        }}
      />
      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
      <TabBar />
    </PhoneFrame>
  )
}
