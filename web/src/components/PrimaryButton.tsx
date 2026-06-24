import type { ReactNode } from 'react'

interface PrimaryButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  fullWidth?: boolean
  type?: 'button' | 'submit'
}

export default function PrimaryButton({
  children,
  onClick,
  disabled = false,
  fullWidth = true,
  type = 'button',
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${fullWidth ? 'w-full' : ''} inline-flex items-center justify-center gap-2 rounded-xl h-12 px-5 text-body-lg font-bold tracking-ui transition-all duration-200 ease-out active:scale-[0.98] ${
        disabled
          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
          : 'bg-cyan-500 text-white hover:bg-cyan-600 active:bg-cyan-700'
      }`}
    >
      {children}
    </button>
  )
}
