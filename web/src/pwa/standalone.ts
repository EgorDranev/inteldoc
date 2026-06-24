import { useEffect, useState } from 'react'

/**
 * True when the app is running as an installed PWA (standalone display mode)
 * rather than in a normal browser tab. Used to:
 *  - hide the dev DemoToolbar inside the installed patient app (so it can't
 *    teleport out of the manifest's /patient/ scope to /doctor or /admin), and
 *  - suppress the install affordance once already installed.
 *
 * Covers the standard `display-mode: standalone` media query plus the
 * iOS Safari `navigator.standalone` fallback.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mql = window.matchMedia?.('(display-mode: standalone)')
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return Boolean(mql?.matches) || iosStandalone
}

/** React hook variant — re-evaluates if the display mode changes at runtime. */
export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState<boolean>(() => isStandalone())

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(display-mode: standalone)')
    const update = () => setStandalone(isStandalone())
    update()
    // Safari < 14 uses addListener/removeListener.
    if (mql.addEventListener) mql.addEventListener('change', update)
    else mql.addListener(update)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', update)
      else mql.removeListener(update)
    }
  }, [])

  return standalone
}
