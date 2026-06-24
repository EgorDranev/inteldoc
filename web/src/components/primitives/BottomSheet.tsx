import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
}

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  // Lock body scroll while the sheet is up.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="absolute inset-0 z-30 flex items-end bg-[rgba(15,16,20,0.35)]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white rounded-t-[20px] flex flex-col gap-4 px-5 pb-8 pt-4 shadow-md"
        style={{ animation: 'ds-slide-up 320ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        <div className="self-center w-12 h-1 rounded-full bg-slate-200" />
        {title && (
          <div className="text-center text-h3-ui font-bold leading-tight text-ink-strong">
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
