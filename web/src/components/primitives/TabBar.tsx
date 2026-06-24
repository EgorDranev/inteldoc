import type { ReactNode } from 'react'
import { Home, MessageCircle, ListChecks, FileText } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

interface Tab {
  id: string
  to: string
  label: string
  icon: ReactNode
}

const TABS: Tab[] = [
  { id: 'home', to: '/patient/home', label: 'Главная', icon: <Home size={22} strokeWidth={2} /> },
  { id: 'vasily', to: '/patient/vasily', label: 'Василий', icon: <MessageCircle size={22} strokeWidth={2} /> },
  { id: 'prep', to: '/patient/checklist', label: 'Подготовка', icon: <ListChecks size={22} strokeWidth={2} /> },
  { id: 'history', to: '/patient/history', label: 'История', icon: <FileText size={22} strokeWidth={2} /> },
]

export default function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex h-[89px] items-center justify-around px-4 pt-2 pb-8"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderTop: '1px solid var(--slate-100)',
      }}
    >
      {TABS.map((t) => {
        const active = pathname === t.to || pathname.startsWith(t.to + '/')
        return (
          <button
            key={t.id}
            onClick={() => nav(t.to)}
            className={`flex flex-col items-center justify-center gap-0.5 w-16 transition-colors duration-200 ease-out ${
              active ? 'text-cyan-500' : 'text-slate-400'
            }`}
          >
            <span style={{ opacity: active ? 1 : 0.85 }}>{t.icon}</span>
            <span
              className={`text-micro tracking-ui ${
                active ? 'font-bold' : 'font-semibold'
              }`}
            >
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
