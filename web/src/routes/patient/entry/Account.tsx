import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PhoneFrame from '../../../components/patient/PhoneFrame'
import OnboardingChrome from '../../../components/patient/OnboardingChrome'
import Button from '../../../components/primitives/Button'
import Input from '../../../components/primitives/Input'
import PhoneInput, {
  PHONE_COUNTRIES,
  DEFAULT_COUNTRY,
  parseNational,
  type PhoneCountry,
} from '../../../components/primitives/PhoneInput'
import { useInteldoc } from '../../../store/store'
import { saveAccountDraft } from '../../../store/actions'
import type { AccountDraft, Gender } from '../../../store/types'
import { track } from '../../../lib/analytics'

const FIELD_LABELS: Record<keyof AccountDraft, string> = {
  name: 'ПОЛНОЕ ИМЯ',
  dob: 'ДАТА РОЖДЕНИЯ',
  gender: 'ПОЛ',
  phone: 'ТЕЛЕФОН',
  email: 'EMAIL (НЕОБЯЗАТЕЛЬНО)',
}

// ─── Validators ─────────────────────────────────────────────────────────────
function validName(v: string): true | string {
  const trimmed = v.trim()
  if (trimmed.length < 3) return 'Укажите имя и фамилию'
  if (!/^[А-Яа-яЁё\s\-]+$/.test(trimmed)) return 'Только кириллица, пробелы и дефисы'
  if (trimmed.split(/\s+/).filter(Boolean).length < 2) return 'Имя и фамилия — минимум два слова'
  return true
}
function validDob(v: string): true | string {
  if (!v) return 'Укажите дату рождения'
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return 'Формат: дд.мм.гггг'
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12) return 'Неверный месяц'
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return 'Неверная дата'
  }
  const now = new Date()
  if (d.getTime() > now.getTime()) return 'Дата не может быть в будущем'
  let age = now.getFullYear() - year
  const monthDiff = now.getMonth() - (month - 1)
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) age--
  if (age < 14) return 'Должно быть не меньше 14 лет'
  if (age > 120) return 'Проверьте дату'
  return true
}

// Auto-insert dots while the user types digits.
function formatDobInput(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8)
  if (digits.length >= 5) return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
  if (digits.length >= 3) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return digits
}

// Convert any legacy ISO draft (yyyy-mm-dd) to the new dotted form so the
// field renders correctly when the screen is reopened from a saved draft.
function normalizeDobDraft(v: string): string {
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : v
}
function validPhone(v: string, country: PhoneCountry): true | string {
  const national = parseNational(country, v)
  if (national.length === 0) return 'Укажите номер телефона'
  if (national.length !== country.nationalLen) {
    return `Нужно ${country.nationalLen} цифр после ${country.dial}`
  }
  return true
}

// Pick the country whose dial code matches a stored phone string. Falls back to default.
function detectCountry(stored: string): PhoneCountry {
  if (!stored) return DEFAULT_COUNTRY
  // Try the longest dial code first to avoid +7 swallowing +375.
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  const found = sorted.find((c) => stored.replace(/\s/g, '').startsWith(c.dial))
  return found ?? DEFAULT_COUNTRY
}
function validEmail(v: string): true | string {
  if (!v.trim()) return true // optional
  // Light RFC-5322ish check; sufficient for prototype.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Неверный формат email'
  return true
}

// ─── Account screen ─────────────────────────────────────────────────────────
export default function Account() {
  const nav = useNavigate()
  const existing = useInteldoc((s) => s.accountDraft)
  const [draft, setDraft] = useState<AccountDraft>(
    () =>
      existing
        ? { ...existing, dob: normalizeDobDraft(existing.dob) }
        : {
            name: '',
            dob: '',
            gender: null,
            phone: '',
            email: '',
          },
  )
  const [touched, setTouched] = useState<Partial<Record<keyof AccountDraft, boolean>>>({})
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(() =>
    detectCountry(existing?.phone ?? ''),
  )

  useEffect(() => {
    track({ name: 'account_viewed' })
  }, [])

  const errors = useMemo(() => {
    const e: Partial<Record<keyof AccountDraft, string>> = {}
    const n = validName(draft.name)
    if (n !== true) e.name = n
    const d = validDob(draft.dob)
    if (d !== true) e.dob = d
    if (!draft.gender) e.gender = 'Выберите пол'
    const p = validPhone(draft.phone, phoneCountry)
    if (p !== true) e.phone = p
    const em = validEmail(draft.email)
    if (em !== true) e.email = em
    return e
  }, [draft, phoneCountry])

  const allValid = Object.keys(errors).length === 0

  function update<K extends keyof AccountDraft>(key: K, val: AccountDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }))
  }

  function blur<K extends keyof AccountDraft>(key: K) {
    setTouched((t) => ({ ...t, [key]: true }))
    const isValid = !errors[key]
    track({
      name: 'account_field_blurred',
      field: key,
      valid: isValid,
    })
  }

  function submit() {
    if (!allValid) {
      // Surface all field errors at once.
      setTouched({
        name: true,
        dob: true,
        gender: true,
        phone: true,
        email: true,
      })
      track({
        name: 'account_validation_error',
        fields: Object.keys(errors),
      })
      return
    }
    saveAccountDraft(draft)
    track({ name: 'account_submitted' })
    nav('/patient/entry/consents')
  }

  return (
    <PhoneFrame>
      <OnboardingChrome
        showBack
        onBack={() => nav('/patient/entry/welcome')}
        progressLabel="Профиль · Шаг 1 из 2"
        step={1}
        totalSteps={2}
      />

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
        <div>
          <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
            Аккаунт
          </h1>
          <p className="text-caption text-ink-muted leading-relaxed mt-2">
            Только необходимое. Медицинские данные заполним на следующем шаге.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Input
            label={FIELD_LABELS.name}
            required
            placeholder="Иванова Мария"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            onBlur={() => blur('name')}
            error={touched.name ? errors.name : undefined}
          />
          <Input
            label={FIELD_LABELS.dob}
            required
            type="text"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="дд.мм.гггг"
            maxLength={10}
            value={draft.dob}
            onChange={(e) => update('dob', formatDobInput(e.target.value))}
            onBlur={() => blur('dob')}
            error={touched.dob ? errors.dob : undefined}
          />

          {/* Gender — segmented toggle */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-caps text-ink-muted">
              {FIELD_LABELS.gender}
              <span className="text-rose-600 ml-1">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(['female', 'male'] as Gender[]).map((g) => {
                const active = draft.gender === g
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      update('gender', g)
                      blur('gender')
                    }}
                    className={`rounded-xl h-12 px-4 text-body-lg font-bold tracking-ui transition-all duration-200 ease-out ${
                      active
                        ? 'bg-cyan-500 text-white'
                        : 'bg-white text-ink-strong shadow-[inset_0_0_0_1.5px_var(--slate-200)] hover:bg-cyan-50'
                    }`}
                    aria-pressed={active}
                  >
                    {g === 'female' ? 'Женский' : 'Мужской'}
                  </button>
                )
              })}
            </div>
            {touched.gender && errors.gender && (
              <span className="text-caption text-rose-600 leading-snug">
                {errors.gender}
              </span>
            )}
          </div>

          <PhoneInput
            label={FIELD_LABELS.phone}
            required
            value={draft.phone}
            country={phoneCountry}
            onCountryChange={setPhoneCountry}
            onValueChange={(v) => update('phone', v)}
            onBlur={() => blur('phone')}
            error={touched.phone ? errors.phone : undefined}
            helper="Понадобится для связи и подтверждения юридически значимых действий."
          />
          <Input
            label={FIELD_LABELS.email}
            type="email"
            inputMode="email"
            placeholder="example@mail.ru"
            value={draft.email}
            onChange={(e) => update('email', e.target.value)}
            onBlur={() => blur('email')}
            error={touched.email ? errors.email : undefined}
          />
        </div>
      </div>

      <div className="px-5 pb-8 pt-3 border-t border-slate-100 bg-white/85 backdrop-blur">
        <Button full onClick={submit} disabled={!allValid}>
          Далее
        </Button>
      </div>
    </PhoneFrame>
  )
}
