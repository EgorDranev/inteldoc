import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import PhoneFrame from '../../../components/patient/PhoneFrame'
import OnboardingChrome from '../../../components/patient/OnboardingChrome'
import Button from '../../../components/primitives/Button'
import PhoneInput, {
  DEFAULT_COUNTRY,
  parseNational,
  type PhoneCountry,
} from '../../../components/primitives/PhoneInput'
import { auth as apiAuth, ApiError } from '../../../api/client'
import { BACKEND_MODE, DEMO_MODE } from '../../../api/config'
import { enterPatientDemo, loginPatientFromBackend } from '../../../store/actions'
import { track } from '../../../lib/analytics'

const RESEND_SECONDS = 30
const DEMO_CODE = '0000'

/**
 * S00 · Returning-patient login (ENG-09).
 *
 * The «боевой вход пациента» the app was missing: a patient who already onboarded
 * signs back in with their phone + a real SMS one-time code. In BACKEND_MODE the
 * code is verified by the API (a wrong code or unknown phone is rejected server
 * side); the pure-mock demo accepts the fixed «0000». First-time users are routed
 * to onboarding instead.
 */
export default function Login() {
  const nav = useNavigate()
  const [stage, setStage] = useState<'phone' | 'otp'>('phone')
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const [otp, setOtp] = useState<string[]>(['', '', '', ''])
  const [otpError, setOtpError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(RESEND_SECONDS)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    track({ name: 'patient_login_viewed' })
  }, [])

  const national = parseNational(country, phone)
  const phoneError = useMemo(() => {
    if (national.length === 0) return 'Укажите номер телефона'
    if (national.length !== country.nationalLen) {
      return `Нужно ${country.nationalLen} цифр после ${country.dial}`
    }
    return null
  }, [national, country])

  const maskedPhone = useMemo(() => {
    const last2 = national.slice(-2)
    return last2 ? `${country.dial} ··· ··· ·· ${last2}` : country.dial
  }, [country, national])

  // Resend countdown on the OTP stage.
  useEffect(() => {
    if (stage !== 'otp' || resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [stage, resendIn])

  // Focus the first OTP cell when the stage opens.
  useEffect(() => {
    if (stage !== 'otp') return
    const t = window.setTimeout(() => inputRefs.current[0]?.focus(), 120)
    return () => window.clearTimeout(t)
  }, [stage])

  async function requestCode() {
    if (phoneError || busy) {
      setPhoneTouched(true)
      return
    }
    setBusy(true)
    try {
      if (BACKEND_MODE) await apiAuth.requestOtp(phone)
      track({ name: 'patient_login_code_requested' })
      setOtp(['', '', '', ''])
      setOtpError(null)
      setResendIn(RESEND_SECONDS)
      setStage('otp')
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 429
          ? 'Код уже отправлен. Подождите немного и попробуйте снова.'
          : 'Не удалось отправить код. Попробуйте ещё раз.'
      setOtpError(null)
      setPhoneTouched(true)
      // Surface as a transient toast-like error on the phone stage.
      window.setTimeout(() => alert(msg), 0)
    } finally {
      setBusy(false)
    }
  }

  function setOtpDigit(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    setOtp((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    setOtpError(null)
    if (digit && index < 3) inputRefs.current[index + 1]?.focus()
  }

  function handleOtpKey(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handleOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!text) return
    e.preventDefault()
    const next = ['', '', '', '']
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setOtp(next)
    setOtpError(null)
    inputRefs.current[Math.min(text.length, 3)]?.focus()
  }

  async function verify() {
    const code = otp.join('')
    if (code.length < 4 || busy) return
    setBusy(true)
    try {
      if (BACKEND_MODE) {
        await loginPatientFromBackend(phone, code)
      } else if (DEMO_MODE) {
        // Pure-mock demo only: accept the fixed code and enter the seeded persona.
        // Reachable solely in a demo build — config.ts forbids !DEMO_MODE && !BACKEND_MODE.
        if (code !== DEMO_CODE) throw new ApiError(401, 'invalid code')
        enterPatientDemo()
      } else {
        throw new ApiError(401, 'login unavailable')
      }
      track({ name: 'patient_login_success' })
      nav('/patient/home')
    } catch (e) {
      const unknownOrWrong = e instanceof ApiError && e.status === 401
      setOtpError(
        unknownOrWrong
          ? 'Неверный код или аккаунт не найден.'
          : 'Не удалось войти. Попробуйте ещё раз.',
      )
      setOtp(['', '', '', ''])
      inputRefs.current[0]?.focus()
      track({ name: 'patient_login_failed' })
    } finally {
      setBusy(false)
    }
  }

  function resend() {
    if (resendIn > 0) return
    void requestCode()
  }

  const otpComplete = otp.every((d) => d.length === 1)

  return (
    <PhoneFrame>
      <OnboardingChrome
        showBack
        onBack={() => (stage === 'otp' ? setStage('phone') : nav('/patient/entry/welcome'))}
        progressLabel="Вход в приложение"
      />

      {stage === 'phone' ? (
        <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-6">
          <div>
            <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">Вход</h1>
            <p className="text-caption text-ink-muted leading-relaxed mt-2">
              Войдите по номеру телефона — пришлём код подтверждения в СМС.
            </p>
          </div>

          <PhoneInput
            label="ТЕЛЕФОН"
            required
            value={phone}
            country={country}
            onCountryChange={setCountry}
            onValueChange={setPhone}
            onBlur={() => setPhoneTouched(true)}
            error={phoneTouched ? phoneError ?? undefined : undefined}
            helper="Тот же номер, что вы указали при регистрации."
          />

          <div className="mt-auto flex flex-col gap-3">
            <Button full onClick={requestCode} disabled={busy || !!phoneError}>
              Получить код
            </Button>
            <button
              type="button"
              onClick={() => nav('/patient/entry/welcome')}
              className="text-caption font-bold text-cyan-600 hover:text-cyan-700 transition-colors"
            >
              Впервые здесь? Зарегистрироваться
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-5">
          <div className="rounded-2xl bg-navy-900 text-white p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} strokeWidth={2} />
            </div>
            <p className="text-caption text-slate-200 leading-relaxed">
              Мы отправили код на{' '}
              <span className="font-bold text-white">{maskedPhone}</span>.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="login-otp-1" className="text-caption text-ink-muted">
              Код из СМС
            </label>
            <div className="flex items-center justify-between gap-3">
              {[0, 1, 2, 3].map((i) => (
                <input
                  key={i}
                  id={`login-otp-${i + 1}`}
                  ref={(el) => {
                    inputRefs.current[i] = el
                  }}
                  value={otp[i]}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setOtpDigit(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKey(i, e)}
                  onPaste={i === 0 ? handleOtpPaste : undefined}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  aria-label={`Цифра ${i + 1} из 4`}
                  className={`h-14 w-14 rounded-2xl text-center text-[22px] font-bold text-ink-strong bg-surface-sunken transition-colors focus:outline-none focus:ring-2 ${
                    otpError ? 'ring-2 ring-rose-400' : 'focus:ring-cyan-500'
                  }`}
                />
              ))}
            </div>
            {otpError ? (
              <p role="alert" className="text-caption text-rose-600 leading-snug">
                {otpError}
              </p>
            ) : (
              DEMO_MODE && (
                <p className="text-caption text-ink-muted leading-snug">
                  Код для демо: <span className="font-bold">{DEMO_CODE}</span>
                </p>
              )
            )}
          </div>

          <button
            type="button"
            onClick={resend}
            disabled={resendIn > 0}
            className={`self-start text-caption font-bold transition-colors ${
              resendIn > 0 ? 'text-ink-muted cursor-default' : 'text-cyan-600 hover:text-cyan-700'
            }`}
          >
            {resendIn > 0 ? `Отправить повторно через ${resendIn} с` : 'Отправить повторно'}
          </button>

          <div className="mt-auto">
            <Button full onClick={verify} disabled={!otpComplete || busy}>
              Войти
            </Button>
          </div>
        </div>
      )}
    </PhoneFrame>
  )
}
