import type { ReactNode } from 'react'

interface SecondaryButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  fullWidth?: boolean
}

export default function SecondaryButton({
  children,
  onClick,
  disabled = false,
  fullWidth = true,
}: SecondaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${fullWidth ? 'w-full' : ''} inline-flex items-center justify-center gap-2 rounded-xl bg-white h-12 px-5 text-body-lg font-bold tracking-ui transition-all duration-200 ease-out active:scale-[0.98] ${
        disabled
          ? 'text-slate-400 shadow-[inset_0_0_0_1.5px_rgb(226_232_240)] cursor-not-allowed'
          : 'text-cyan-500 shadow-[inset_0_0_0_1.5px_currentColor] hover:bg-cyan-50'
      }`}
    >
      {children}
    </button>
  )
}
