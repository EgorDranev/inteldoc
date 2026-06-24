import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  full?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  children?: ReactNode
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-cyan-500 text-white hover:bg-cyan-600 active:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400',
  secondary:
    'bg-white text-cyan-500 shadow-[inset_0_0_0_1.5px_currentColor] hover:bg-cyan-50 disabled:text-slate-400 disabled:shadow-[inset_0_0_0_1.5px_rgb(226_232_240)]',
  ghost:
    'bg-transparent text-cyan-500 hover:bg-cyan-50 disabled:text-slate-400',
  dark:
    'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950 disabled:bg-slate-200 disabled:text-slate-400',
}

// 4-step height scale: 32 / 40 / 48 / 56. Buttons use 40 (sm), 40 (md) and
// 48 (lg). Inputs use 48 — so an lg button aligns visually with an input.
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-caption',
  md: 'h-10 px-4 text-body',
  lg: 'h-12 px-5 text-body-lg',
}

export default function Button({
  variant = 'primary',
  size = 'lg',
  full,
  icon,
  iconRight,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold tracking-ui transition-all duration-200 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${
        full ? 'w-full' : ''
      } ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
}
