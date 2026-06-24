import type { ReactNode } from 'react'

interface ChipProps {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}

export default function Chip({ children, active, onClick, className = '' }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-caption font-bold uppercase tracking-caps transition-colors duration-200 ease-out ${
        active
          ? 'bg-cyan-500 text-white shadow-[inset_0_0_0_1.5px_var(--blue-600)]'
          : 'bg-cyan-50 text-cyan-500 shadow-[inset_0_0_0_1.5px_var(--blue-100)] hover:bg-cyan-100'
      } ${className}`}
    >
      {children}
    </button>
  )
}
