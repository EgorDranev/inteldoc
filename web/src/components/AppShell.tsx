import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  dark?: boolean
}

export default function AppShell({ children, dark = false }: AppShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200 p-0 sm:p-4">
      <div
        className={`relative w-full max-w-sm min-h-screen sm:min-h-0 sm:rounded-3xl overflow-hidden shadow-md flex flex-col ${
          dark ? 'bg-navy-900' : 'bg-slate-50'
        }`}
        style={{ minHeight: '100dvh' }}
      >
        {children}
      </div>
    </div>
  )
}
