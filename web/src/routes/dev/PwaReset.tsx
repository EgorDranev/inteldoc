import { useEffect, useState } from 'react'
import { unregisterServiceWorkers } from '../../pwa/reset'

/**
 * Dev-only recovery page: /dev/pwa-reset
 *
 * A tester device stuck on a stale service worker can open this URL to
 * unregister all SWs and clear caches, then hard-reload onto a fresh build.
 * Isolated from the demo flow (lives under /dev, like /dev/api-check).
 */
export default function PwaReset() {
  const [status, setStatus] = useState<string>('Очистка кеша и сервис-воркеров…')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    unregisterServiceWorkers().then((res) => {
      if (cancelled) return
      setStatus(
        `Готово. Снято сервис-воркеров: ${res.workers}, очищено кешей: ${res.caches}.`,
      )
      setDone(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm text-center">
        <p className="text-[15px] font-bold text-navy-900 mb-2">Сброс PWA</p>
        <p className="text-[13px] text-slate-600 leading-relaxed mb-5">{status}</p>
        <button
          type="button"
          disabled={!done}
          onClick={() => {
            // Full reload bypassing the (now removed) SW to fetch a fresh build.
            window.location.replace('/patient/home')
          }}
          className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          Открыть свежую версию
        </button>
        <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
          Если приложение установлено, удалите его с домашнего экрана и установите заново.
        </p>
      </div>
    </div>
  )
}
