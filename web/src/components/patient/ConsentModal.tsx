import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { X, Check, ArrowLeft, ShieldCheck } from 'lucide-react'
import Button from '../primitives/Button'
import type { AckMechanism } from '../../store/types'
import type { ConsentSpec } from '../../lib/consent-text'
import { track } from '../../lib/analytics'
import { DEMO_MODE } from '../../api/config'

interface ConsentModalProps {
  open: boolean
  spec: ConsentSpec
  /** Already-formatted masked phone, e.g. «+7 *** *** **89». Used only for the SMS stage. */
  maskedPhone?: string
  onClose: () => void
  /**
   * Called when the user explicitly acknowledges. For consents that require
   * an SMS code, this fires only after the code has been verified, with
   * `smsConfirmedAt` populated.
   */
  onAcknowledge: (
    mech: AckMechanism,
    opts?: { smsConfirmedAt?: string },
  ) => void
}

const SCROLL_TOLERANCE_PX = 24
const SMS_DEMO_CODE = '0000'
const SMS_RESEND_SECONDS = 30

/**
 * Full-height bottom-sheet modal for the read-and-acknowledge consent pattern.
 *
 * Stage 1 (always): scroll-to-end OR a11y tick → enables «Я прочитал(а)…».
 * Stage 2 (only if `spec.requiresSmsConfirmation`): a 4-digit SMS one-time
 * code gate. The prototype accepts only `0000` and shows the demo code below
 * the input. Non-`0000` codes trigger an inline error.
 */
export default function ConsentModal({
  open,
  spec,
  maskedPhone,
  onClose,
  onAcknowledge,
}: ConsentModalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const [a11yChecked, setA11yChecked] = useState(false)
  const [stage, setStage] = useState<'read' | 'sms'>('read')

  // ─── SMS stage state ──────────────────────────────────────────────────────
  const [otp, setOtp] = useState<string[]>(['', '', '', ''])
  const [smsError, setSmsError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(SMS_RESEND_SECONDS)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  // Reset all gating when reopened or when the spec changes.
  useEffect(() => {
    if (open) {
      setScrolledToEnd(false)
      setA11yChecked(false)
      setStage('read')
      setOtp(['', '', '', ''])
      setSmsError(null)
      setResendIn(SMS_RESEND_SECONDS)
      // Lock body scroll while modal is up.
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open, spec.id])

  // Edge case: short text → count as scrolled-to-end immediately.
  useEffect(() => {
    if (!open || stage !== 'read') return
    const el = scrollRef.current
    if (!el) return
    const checkInitial = () => {
      if (el.scrollHeight - el.clientHeight <= SCROLL_TOLERANCE_PX) {
        setScrolledToEnd(true)
      }
    }
    const r = requestAnimationFrame(checkInitial)
    return () => cancelAnimationFrame(r)
  }, [open, spec.id, stage])

  // SMS resend countdown.
  useEffect(() => {
    if (!open || stage !== 'sms') return
    if (resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [open, stage, resendIn])

  // Auto-focus the first OTP cell when the SMS stage opens.
  useEffect(() => {
    if (stage === 'sms') {
      const t = window.setTimeout(() => inputRefs.current[0]?.focus(), 120)
      return () => window.clearTimeout(t)
    }
  }, [stage])

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (scrolledToEnd) return
    const t = e.currentTarget
    const reachedBottom =
      t.scrollHeight - t.scrollTop - t.clientHeight <= SCROLL_TOLERANCE_PX
    if (reachedBottom) {
      setScrolledToEnd(true)
      track({
        name: 'consent_modal_scrolled_to_end',
        consentId: spec.id,
      })
    }
  }

  function readAck() {
    const mech: AckMechanism = scrolledToEnd
      ? 'scroll_to_end'
      : a11yChecked
      ? 'a11y_checkbox'
      : 'scroll_to_end' // never reached — button is gated
    if (spec.requiresSmsConfirmation) {
      setStage('sms')
      track({ name: 'consent_sms_sent', consentId: spec.id })
      return
    }
    onAcknowledge(mech)
  }

  function setOtpDigit(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    setOtp((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    setSmsError(null)
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }
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
    setSmsError(null)
    const focusIdx = Math.min(text.length, 3)
    inputRefs.current[focusIdx]?.focus()
  }

  function verifyOtp() {
    const code = otp.join('')
    if (code.length < 4) return
    if (code !== SMS_DEMO_CODE) {
      setSmsError('Неверный код. Попробуйте ещё раз.')
      setOtp(['', '', '', ''])
      inputRefs.current[0]?.focus()
      track({ name: 'consent_sms_failed', consentId: spec.id })
      return
    }
    track({
      name: 'consent_sms_verified',
      consentId: spec.id,
      versionId: spec.version,
    })
    onAcknowledge('scroll_to_end', { smsConfirmedAt: new Date().toISOString() })
  }

  function resendCode() {
    if (resendIn > 0) return
    setResendIn(SMS_RESEND_SECONDS)
    setOtp(['', '', '', ''])
    setSmsError(null)
    inputRefs.current[0]?.focus()
    track({ name: 'consent_sms_sent', consentId: spec.id })
  }

  const ackEnabled = scrolledToEnd || a11yChecked
  const otpComplete = useMemo(() => otp.every((d) => d.length === 1), [otp])

  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-30 flex items-end bg-[rgba(15,16,20,0.45)]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={spec.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white rounded-t-[20px] shadow-md flex flex-col"
        style={{
          height: 'calc(100% - 40px)',
          animation: 'ds-slide-up 320ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="min-w-0 pt-1 flex items-start gap-2">
            {stage === 'sms' && (
              <button
                type="button"
                onClick={() => setStage('read')}
                aria-label="Назад к тексту согласия"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100 transition-colors -ml-1"
              >
                <ArrowLeft size={18} strokeWidth={2} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500">
                {stage === 'sms'
                  ? 'Подтверждение · СМС'
                  : `Согласие · блок ${spec.block}`}
              </p>
              <p className="text-[16px] font-bold text-ink-strong leading-snug mt-1">
                {stage === 'sms' ? 'Подтверждение по СМС' : spec.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100 transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {stage === 'read' ? (
          <>
            {/* Scrollable text */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-5 py-4 text-body text-ink-strong leading-relaxed whitespace-pre-line"
            >
              {spec.fullText}

              {/* a11y "mark as read" alternative — for screen-reader users who
                  may not trigger scroll events normally. */}
              <label className="mt-6 mb-2 flex cursor-pointer items-start gap-3 rounded-2xl bg-surface-sunken p-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={a11yChecked}
                  onClick={() => setA11yChecked((v) => !v)}
                  className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
                    a11yChecked
                      ? 'bg-cyan-500'
                      : 'bg-white shadow-[inset_0_0_0_1.5px_var(--slate-300)]'
                  }`}
                >
                  {a11yChecked && (
                    <Check size={14} strokeWidth={2.5} className="text-white" />
                  )}
                </button>
                <span className="text-caption text-ink leading-relaxed">
                  Полный текст прочитан, готов подтвердить согласие.
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="px-5 pb-7 pt-3 border-t border-slate-100">
              {!ackEnabled && (
                <p className="text-[12px] text-ink-muted text-center mb-3 leading-snug">
                  Прочитайте текст до конца — или отметьте галочкой, что прочитали.
                </p>
              )}
              {ackEnabled && spec.requiresSmsConfirmation && (
                <p className="text-[12px] text-ink-muted text-center mb-3 leading-snug">
                  Дальше — код из СМС, чтобы подтвердить согласие.
                </p>
              )}
              <Button full onClick={readAck} disabled={!ackEnabled}>
                {spec.requiresSmsConfirmation ? 'Продолжить' : 'Подтверждаю'}
              </Button>
            </div>
          </>
        ) : (
          // ─── Stage 2: SMS confirmation ───────────────────────────────────
          <>
            <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-5">
              <div className="rounded-2xl bg-navy-900 text-white p-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck size={18} strokeWidth={2} />
                </div>
                <p className="text-caption text-slate-200 leading-relaxed">
                  Это согласие подтверждается кодом из СМС. Мы отправили код на{' '}
                  <span className="font-bold text-white">
                    {maskedPhone ?? 'ваш номер'}
                  </span>
                  .
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <label
                  htmlFor="consent-otp-1"
                  className="text-caption text-ink-muted"
                >
                  Код из СМС
                </label>
                <div className="flex items-center justify-between gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <input
                      key={i}
                      id={`consent-otp-${i + 1}`}
                      ref={(el) => {
                        inputRefs.current[i] = el
                      }}
                      value={otp[i]}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setOtpDigit(i, e.target.value)
                      }
                      onKeyDown={(e) => handleOtpKey(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      aria-label={`Цифра ${i + 1} из 4`}
                      className={`h-14 w-14 rounded-2xl text-center text-[22px] font-bold text-ink-strong bg-surface-sunken transition-colors focus:outline-none focus:ring-2 ${
                        smsError
                          ? 'ring-2 ring-rose-400'
                          : 'focus:ring-cyan-500'
                      }`}
                    />
                  ))}
                </div>
                {smsError ? (
                  <p
                    role="alert"
                    className="text-caption text-rose-600 leading-snug"
                  >
                    {smsError}
                  </p>
                ) : DEMO_MODE ? (
                  <p className="text-caption text-ink-muted leading-snug">
                    Код для демо: <span className="font-bold">{SMS_DEMO_CODE}</span>
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={resendCode}
                disabled={resendIn > 0}
                className={`self-start text-caption font-bold transition-colors ${
                  resendIn > 0
                    ? 'text-ink-muted cursor-default'
                    : 'text-cyan-600 hover:text-cyan-700'
                }`}
              >
                {resendIn > 0
                  ? `Отправить повторно через ${resendIn} с`
                  : 'Отправить повторно'}
              </button>
            </div>

            <div className="px-5 pb-7 pt-3 border-t border-slate-100">
              <Button full onClick={verifyOtp} disabled={!otpComplete}>
                Подтвердить согласие
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
