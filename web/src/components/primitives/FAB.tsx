import { Plus } from 'lucide-react'

interface FABProps {
  onClick?: () => void
  ariaLabel?: string
}

export default function FAB({ onClick, ariaLabel = 'Добавить' }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="absolute left-1/2 -translate-x-1/2 bottom-[44px] z-20 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg transition-transform duration-200 ease-out active:scale-95"
    >
      <Plus size={28} strokeWidth={2.5} />
    </button>
  )
}
