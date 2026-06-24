import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../primitives/Avatar'
import CoBrandLockup from '../system/CoBrandLockup'
import { useActivePatient } from '../../store/hooks'
import { useHistoryEvents } from '../../lib/historyEvents'

interface TopHeaderProps {
  /** Show IntelDoc × partner co-brand lockup. */
  showPartner?: boolean
  title?: string
}

export default function TopHeader({ showPartner = true, title }: TopHeaderProps) {
  const nav = useNavigate()
  const patient = useActivePatient()
  const unread = useHistoryEvents().filter((e) => e.unread).length

  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex items-center gap-2 min-w-0">
        {showPartner && !title && <CoBrandLockup variant="plain" size="md" />}
        {title && (
          <div className="min-w-0">
            <span className="block truncate text-h3-ui font-bold text-ink-strong">
              {title}
            </span>
            {showPartner && (
              <div className="mt-1">
                <CoBrandLockup variant="plain" size="sm" />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          aria-label="Уведомления"
          onClick={() => nav('/patient/notifications')}
          className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <Bell size={22} className="text-ink" strokeWidth={2} />
          {unread > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500" />
          )}
        </button>
        <button
          onClick={() => nav('/patient/profile')}
          aria-label="Профиль"
          className="rounded-2xl"
        >
          <Avatar name={patient?.name ?? 'А П'} size={36} />
        </button>
      </div>
    </div>
  )
}
