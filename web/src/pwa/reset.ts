/**
 * Escape hatch for a tester device that got pinned to an old service worker.
 *
 * Unregisters every service worker and deletes all Cache Storage entries, so
 * the next load fetches a fresh build. Used by the /dev/pwa-reset route.
 *
 * Safe to call in any environment — it no-ops where the APIs are unavailable.
 */
export async function unregisterServiceWorkers(): Promise<{
  workers: number
  caches: number
}> {
  let workers = 0
  let caches = 0

  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const reg of regs) {
        const ok = await reg.unregister()
        if (ok) workers += 1
      }
    } catch {
      /* ignore */
    }
  }

  if ('caches' in window) {
    try {
      const keys = await window.caches.keys()
      for (const key of keys) {
        const ok = await window.caches.delete(key)
        if (ok) caches += 1
      }
    } catch {
      /* ignore */
    }
  }

  return { workers, caches }
}
