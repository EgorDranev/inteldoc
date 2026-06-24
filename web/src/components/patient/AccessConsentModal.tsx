import { useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  FileText,
  Lock,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Button from '../primitives/Button'
import type { ConsentSpec } from '../../lib/consent-text'
import { track } from '../../lib/analytics'

interface AccessConsentModalProps {
  open: boolean
  spec: ConsentSpec
  /** Whether the access grant has already been e-signed in this session. */
  signed: boolean
  /** Called when the user taps the sign button. Performs the signAccessGrant. */
  onSign: () => Promise<void>
  onClose: () => void
  /**
   * Called once the user has signed and tapped «Готово» to dismiss. The
   * Consents screen uses this to record the clinic_access acknowledgement.
   */
  onAcknowledge: () => void
}

const SCOPE_ICON: Record<string, LucideIcon> = {
  file: FileText,
  sparkles: Sparkles,
  paperclip: Paperclip,
  user: User,
}

const CONTROL_ICON: Record<string, LucideIcon> = {
  rotate: RotateCcw,
  lock: Lock,
  shield: ShieldCheck,
}

/**
 * Full-height bottom-sheet modal for the clinic access-grant consent block on
 * the «Согласия» screen. Shows the partner identity card, the scope of access,
 * the patient-controlled safeguards, and a ПЭП sign affordance. Acknowledgement
 * happens only after the user signs.
 */
export default function AccessConsentModal({
  open,
  spec,
  signed,
  onSign,
  onClose,
  onAcknowledge,
}: AccessConsentModalProps) {
  const [confirmed, setConfirmed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [legalOpen, setLegalOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setConfirmed(false)
      setSigning(false)
      setError(null)
      setLegalOpen(false)
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open, spec.id])

  if (!open) return null

  const partner = spec.partner
  const scopeItems = spec.scopeItems ?? []
  const controlItems = spec.controlItems ?? []

  function toggleConfirm() {
    if (signed) return
    const next = !confirmed
    setConfirmed(next)
    if (next) track({ name: 'access_grant_confirm_checked' })
  }

  async function sign() {
    if (!confirmed || signing || signed) return
    setSigning(true)
    setError(null)
    try {
      await onSign()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось подписать. Попробуйте ещё раз.',
      )
    } finally {
      setSigning(false)
    }
  }

  function finish() {
    if (!signed) return
    onAcknowledge()
  }

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
          <div className="min-w-0 pt-1">
            <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500">
              Согласие · доступ для Эндокор
            </p>
            <p className="text-[16px] font-bold text-ink-strong leading-snug mt-1">
              {spec.title}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100 transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {/* Intro */}
          <p className="text-[15px] text-ink-muted leading-relaxed">
            Разрешите Эндокор видеть ваши анализы и подготовку в IntelDoc. Доступ
            можно отозвать в любой момент.
          </p>

          {/* Recipient card */}
          {partner && (
            <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-navy-900 text-white text-[22px] font-extrabold flex items-center justify-center flex-shrink-0 ring-4 ring-cyan-100">
                  {partner.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-bold text-ink-strong leading-tight">
                    {partner.fullName}
                  </p>
                  <p className="text-[13px] text-ink-muted leading-snug mt-1">
                    {partner.role}
                  </p>
                </div>
              </div>
              <p className="text-[14px] text-ink leading-relaxed mt-4 pt-4 border-t border-slate-100">
                {partner.note}
              </p>
            </section>
          )}

          {/* Scope */}
          {scopeItems.length > 0 && (
            <section className="rounded-2xl bg-surface-sunken p-5">
              <p className="text-[11px] font-bold uppercase tracking-caps text-ink-muted mb-3">
                Что увидит клиника
              </p>
              <ul className="flex flex-col gap-3">
                {scopeItems.map(({ iconId, text }) => {
                  const Icon = SCOPE_ICON[iconId] ?? FileText
                  return (
                    <li
                      key={text}
                      className="flex items-start gap-3 text-[15px] text-ink-strong leading-relaxed"
                    >
                      <Icon
                        size={18}
                        className="text-cyan-600 flex-shrink-0 mt-0.5"
                        strokeWidth={2}
                      />
                      {text}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Control */}
          {controlItems.length > 0 && (
            <section className="rounded-2xl bg-emerald-50/70 border border-emerald-100 p-5">
              <p className="text-[11px] font-bold uppercase tracking-caps text-emerald-800 mb-3">
                Что останется под вашим контролем
              </p>
              <ul className="flex flex-col gap-3">
                {controlItems.map(({ iconId, text }) => {
                  const Icon = CONTROL_ICON[iconId] ?? ShieldCheck
                  return (
                    <li
                      key={text}
                      className="flex items-start gap-3 text-[15px] text-ink-strong leading-relaxed"
                    >
                      <Icon
                        size={18}
                        className="text-emerald-600 flex-shrink-0 mt-0.5"
                        strokeWidth={2}
                      />
                      {text}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Legal text — collapsible */}
          <section className="flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-caps text-ink-muted">
              Текст согласия
            </p>
            <button
              type="button"
              onClick={() => setLegalOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-cyan-700 hover:text-cyan-800 self-start"
              aria-expanded={legalOpen}
            >
              <ChevronDown
                size={16}
                className={`transition-transform ${legalOpen ? '' : '-rotate-90'}`}
                strokeWidth={2.4}
              />
              {legalOpen ? 'Скрыть полный текст' : 'Полный текст согласия'}
            </button>
            {legalOpen && (
              <p className="pt-3 border-t border-slate-200 text-[13px] text-ink-muted leading-relaxed whitespace-pre-line">
                {spec.fullText}
              </p>
            )}
          </section>

          {/* Confirmation checkbox */}
          <label className="flex cursor-pointer items-start gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={confirmed || signed}
              onClick={toggleConfirm}
              disabled={signed}
              className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
                confirmed || signed
                  ? 'bg-cyan-500'
                  : 'bg-white shadow-[inset_0_0_0_1.5px_var(--slate-300)]'
              } ${signed ? 'opacity-80 cursor-default' : ''}`}
            >
              {(confirmed || signed) && (
                <Check size={14} strokeWidth={2.5} className="text-white" />
              )}
            </button>
            <span className="text-[15px] text-ink-strong leading-relaxed">
              Я подтверждаю выдачу доступа клинике Эндокор.
            </span>
          </label>

          {/* Signature card */}
          <div
            className={`rounded-2xl p-4 transition-colors ${
              signed
                ? 'bg-success-bg'
                : confirmed
                ? 'bg-cyan-50'
                : 'bg-slate-100 opacity-70'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  signed ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-white'
                }`}
              >
                {signed ? (
                  <Check size={20} strokeWidth={2.4} />
                ) : (
                  <ShieldCheck size={20} strokeWidth={2} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-ink-strong leading-snug">
                  {signed ? 'Подписано' : 'Подпишите согласие'}
                </p>
                <p className="text-[13px] text-ink-muted leading-relaxed mt-0.5">
                  {signed
                    ? 'Подпись сохранена. Доступ для Эндокор выдан.'
                    : 'Простая электронная подпись (ПЭП) подтверждает, что вы выдали доступ.'}
                </p>
                {!signed && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={sign}
                    disabled={!confirmed || signing}
                    className="mt-3"
                  >
                    {signing ? 'Подписываем…' : 'Подписать'}
                  </Button>
                )}
                {error && (
                  <p className="text-[13px] text-rose-600 mt-2 leading-snug">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-7 pt-3 border-t border-slate-100">
          {!signed && (
            <p className="text-[12px] text-ink-muted text-center mb-3 leading-snug">
              Подпишите согласие, чтобы выдать доступ Эндокор.
            </p>
          )}
          <Button full onClick={finish} disabled={!signed}>
            Готово
          </Button>
        </div>
      </div>
    </div>
  )
}
