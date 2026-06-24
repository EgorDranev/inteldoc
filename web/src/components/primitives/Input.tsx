import type { InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helper?: ReactNode
  required?: boolean
  error?: string
}

export default function Input({
  label,
  helper,
  required,
  error,
  className = '',
  ...rest
}: InputProps) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-micro font-bold uppercase tracking-caps text-ink-muted">
          {label}
          {required && <span className="text-rose-600 ml-1">*</span>}
        </span>
      )}
      <input
        {...rest}
        className={`w-full h-12 rounded-xl bg-white px-4 text-body-lg text-ink-strong placeholder:text-ink-subtle outline-none shadow-[inset_0_0_0_1.5px_var(--slate-200)] transition-shadow duration-200 ease-out focus:shadow-[inset_0_0_0_1.5px_var(--blue-600)] ${
          error ? 'shadow-[inset_0_0_0_1.5px_var(--error)]' : ''
        } ${className}`}
      />
      {helper && !error && (
        <span className="text-caption text-ink-muted leading-snug">{helper}</span>
      )}
      {error && (
        <span className="text-caption text-rose-600 leading-snug">{error}</span>
      )}
    </label>
  )
}
