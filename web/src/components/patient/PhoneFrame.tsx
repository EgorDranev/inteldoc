import type { ReactNode } from 'react'

interface PhoneFrameProps {
  children: ReactNode
  /** When true the inner background is dark navy. Otherwise slate-050. */
  dark?: boolean
}

/**
 * Mobile shell for the patient app.
 * - On real mobile viewports (<640px) fills the screen edge-to-edge — the
 *   layout fluidly adapts from ~320px up through 480px+ phones with no
 *   horizontal scroll and no fixed-pixel panel width.
 * - On wider viewports (≥640px) renders a centered 390×844 phone-style card
 *   anchored at the iPhone-class design width.
 */
export default function PhoneFrame({ children, dark = false }: PhoneFrameProps) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-200 p-0 sm:p-4">
      <div
        className={`relative w-full sm:max-w-[390px] min-h-[100dvh] sm:min-h-0 sm:h-[844px] sm:rounded-[40px] overflow-hidden shadow-md flex flex-col ${
          dark ? 'bg-navy-900' : 'bg-page-bg'
        }`}
        style={{ minHeight: '100dvh' }}
      >
        {children}
      </div>
    </div>
  )
}
