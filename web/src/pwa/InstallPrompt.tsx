import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useIsStandalone } from './standalone'

/**
 * Patient-only install affordance.
 *
 * The manifest scope ('/patient/') cannot, on its own, stop a /doctor or /admin
 * tab from offering install, so the gating lives here in app code: we only ever
 * surface the hint when the current path is under /patient.
 *
 * Behaviour:
 *  - Chrome / Edge / Android: capture (and defer) the browser's
 *    `beforeinstallprompt` event, then offer a calm «Установить» button that
 *    fires the native prompt on tap.
 *  - iOS Safari has no `beforeinstallprompt`, so we instead show a short
 *    how-to («Поделиться → На экран „Домой"»), the only way to install there.
 *  - NEVER auto-prompt on cold load; only the patient surface ever shows a hint.
 *  - Once installed (standalone) or dismissed, the hint stays hidden.
 *
 * No Web Push / notifications are involved here by design.
 */

const DISMISS_KEY = 'inteldoc-pwa-install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * iOS (iPhone/iPad/iPod). iPadOS 13+ masquerades as desktop Safari, so we also
 * treat a touch-capable "MacIntel" as iOS. Good enough for a prototype hint —
 * the worst case is showing the Safari how-to on a device that can't act on it.
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadOS
}

export default function InstallPrompt() {
  const { pathname } = useLocation()
  const standalone = useIsStandalone()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stop Chrome's default mini-infobar; we present our own calm hint.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => undefined)
    // The event can only be used once; drop it and hide the hint either way.
    setDeferred(null)
  }, [deferred])

  const onPatient = pathname.startsWith('/patient')
  if (standalone || dismissed || !onPatient) return null

  // iOS Safari: no native prompt — show the manual «Поделиться → На экран Домой».
  if (!deferred && isIOS()) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-[366px]">
        <div className="flex items-start gap-3 rounded-2xl bg-navy-900 px-4 py-3 text-white shadow-lg">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-500/15">
            <Download size={18} strokeWidth={2.2} className="text-cyan-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-tight">Установить приложение</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] leading-snug text-white/70">
              <span>Нажмите</span>
              <Share size={14} strokeWidth={2.2} className="inline text-cyan-300" />
              <span className="font-semibold text-white/90">Поделиться</span>
              <span>→</span>
              <SquarePlus size={14} strokeWidth={2.2} className="inline text-cyan-300" />
              <span className="font-semibold text-white/90">На экран «Домой»</span>
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Скрыть"
            className="flex-shrink-0 rounded-full p-1 text-white/50 hover:text-white/80"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    )
  }

  if (!deferred) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-[366px]">
      <div className="flex items-center gap-3 rounded-2xl bg-navy-900 px-4 py-3 text-white shadow-lg">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-500/15">
          <Download size={18} strokeWidth={2.2} className="text-cyan-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight">Установить приложение</p>
          <p className="text-[12px] leading-snug text-white/70">
            Быстрый доступ к подготовке и анализам
          </p>
        </div>
        <button
          type="button"
          onClick={install}
          className="flex-shrink-0 rounded-full bg-cyan-500 px-3.5 py-1.5 text-[12px] font-bold text-white"
        >
          Установить
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрыть"
          className="flex-shrink-0 rounded-full p-1 text-white/50 hover:text-white/80"
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
