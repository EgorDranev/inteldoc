import type { ReactNode } from 'react'

interface BottomCTAProps {
  children: ReactNode
  note?: string
}

export default function BottomCTA({ children, note }: BottomCTAProps) {
  return (
    <div className="mt-auto bg-white/80 px-4 pb-8 pt-3 backdrop-blur-xl border-t border-slate-100">
      {note && (
        <p className="text-caption text-slate-500 text-center mb-3 leading-relaxed">
          {note}
        </p>
      )}
      {children}
    </div>
  )
}
