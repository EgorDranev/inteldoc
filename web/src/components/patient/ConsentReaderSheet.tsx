import { useEffect } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import Button from '../primitives/Button'
import { track } from '../../lib/analytics'
import type { ConsentSpec } from '../../lib/consent-text'

interface ConsentReaderSheetProps {
  open: boolean
  spec: ConsentSpec | null
  /** Latest signed version. Drives the «переподписать» CTA when older than spec.version. */
  signedVersion?: string
  /** Whether the consent is currently withdrawn — gates which CTA shows. */
  withdrawn?: boolean
  onClose: () => void
  onWithdraw?: () => void
  onReSign?: () => void
}

/**
 * Full-height reader for an already-signed consent. Does not re-collect a
 * signature — that pattern lives in ConsentModal (onboarding). This sheet
 * surfaces «перечитать», «отозвать», «переподписать» actions on Profile.
 */
export default function ConsentReaderSheet({
  open,
  spec,
  signedVersion,
  withdrawn,
  onClose,
  onWithdraw,
  onReSign,
}: ConsentReaderSheetProps) {
  useEffect(() => {
    if (!open || !spec) return
    track({ name: 'consent_text_reread', consentId: spec.id })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, spec])

  if (!open || !spec) return null

  const newVersionAvailable =
    signedVersion !== undefined && signedVersion !== spec.version

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
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <button
            type="button"
            onClick={onClose}
            aria-label="Назад"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100 -ml-1"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500">
              Согласие · блок {spec.block}
            </p>
            <p className="text-[16px] font-bold text-ink-strong leading-snug mt-1">
              {spec.title}
            </p>
            <p className="text-caption text-ink-muted mt-0.5">
              Подписана версия {signedVersion ?? '—'}
              {newVersionAvailable && (
                <> · действует {spec.version}</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-slate-100"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {newVersionAvailable && !withdrawn && (
          <div className="px-5 pt-3">
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-caption text-amber-800 leading-relaxed">
              Условия обновились. Перечитайте текст и подпишите новую версию,
              чтобы пользоваться обновлёнными возможностями.
            </div>
          </div>
        )}

        {withdrawn && (
          <div className="px-5 pt-3">
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-caption text-rose-800 leading-relaxed">
              Согласие отозвано. Чтобы продолжить пользоваться соответствующей
              функцией сервиса, подпишите согласие заново.
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 text-body text-ink-strong leading-relaxed whitespace-pre-line">
          {spec.fullText}
        </div>

        <div className="px-5 pb-7 pt-3 border-t border-slate-100 flex flex-col gap-2">
          {(newVersionAvailable || withdrawn) && onReSign && (
            <Button full onClick={onReSign}>
              {withdrawn ? 'Подписать заново' : 'Подписать новую версию'}
            </Button>
          )}
          {!withdrawn && onWithdraw && (
            <Button variant="ghost" full onClick={onWithdraw}>
              Отозвать согласие
            </Button>
          )}
          <Button variant="ghost" full onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  )
}
