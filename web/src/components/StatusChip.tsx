import type { ChipVariant } from '../types'

interface StatusChipProps {
  label: string
  variant: ChipVariant
  size?: 'sm' | 'md'
}

const variantClasses: Record<ChipVariant, string> = {
  // Soft semantic palette per design system: pastel bg + saturated fg
  success: 'bg-success-bg text-emerald-700',
  warning: 'bg-warning-bg text-amber-700',
  error: 'bg-danger-bg text-rose-700',
  info: 'bg-cyan-50 text-cyan-600',
  neutral: 'bg-slate-100 text-slate-600',
}

export default function StatusChip({ label, variant, size = 'sm' }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold tracking-caps uppercase ${
        size === 'sm' ? 'px-2.5 py-1 text-micro' : 'px-3 py-1.5 text-caption'
      } ${variantClasses[variant]}`}
    >
      {label}
    </span>
  )
}
