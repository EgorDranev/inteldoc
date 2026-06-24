import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bell, CalendarDays, ChevronRight, ShieldCheck } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import VasilyMascot from '../../components/system/VasilyMascot'
import Button from '../../components/primitives/Button'
import TabBar from '../../components/primitives/TabBar'

const TITLES: Record<string, string> = {
  'diabetes-school': 'Школа диабета',
  meds: 'Лекарства и расходники',
  analyses: 'Анализы',
  extras: 'Полезные сервисы',
  insurance: 'Страхование',
}

export default function ServicePlaceholder() {
  const nav = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const title = (slug && TITLES[slug]) ?? 'Сервис'
  return (
    <PhoneFrame>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={() => nav(-1)}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-ink" strokeWidth={2} />
        </button>
        <p className="text-[15px] font-bold text-ink-strong truncate max-w-[60%]">{title}</p>
        <div className="h-9 w-9" />
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-[110px] flex flex-col gap-4">
        <section className="rounded-2xl bg-navy-900 px-5 py-6 text-white">
          <div className="mb-4 flex items-center gap-3">
            <VasilyMascot size={72} halo />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-400">
                Скоро в IntelDoc
              </p>
              <h1 className="text-h1-ui font-bold leading-tight">{title}</h1>
            </div>
          </div>
          <p className="text-body text-slate-300 leading-relaxed">
            Готовим раздел вместе с Эндокор, чтобы он был полезен именно в контексте
            подготовки к визиту.
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <InfoCard
            icon={<ShieldCheck size={19} strokeWidth={2.2} />}
            title="С учётом Эндокор"
            body="Не общий каталог, а контент под ваш маршрут"
          />
          <InfoCard
            icon={<Bell size={19} strokeWidth={2.2} />}
            title="Сообщим"
            body="Появится в приложении без новых настроек"
          />
        </div>

        <section className="rounded-2xl bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-2">
            Пока раздел готовится
          </p>
          <button
            onClick={() => nav('/patient/checklist')}
            className="flex w-full items-center gap-3 rounded-xl bg-surface-sunken px-3 py-3 text-left hover:bg-cyan-50 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500">
              <CalendarDays size={19} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-ink-strong">
                Продолжить подготовку
              </p>
              <p className="text-caption text-ink-muted">
                Вернитесь к чек-листу перед приёмом
              </p>
            </div>
            <ChevronRight size={17} className="text-ink-muted" strokeWidth={2} />
          </button>
        </section>

        <Button onClick={() => nav('/patient/home')} full>
          Вернуться на главную
        </Button>
      </div>

      <TabBar />
    </PhoneFrame>
  )
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500">
        {icon}
      </div>
      <p className="text-[14px] font-bold text-ink-strong leading-tight">{title}</p>
      <p className="mt-1 text-caption text-ink-muted leading-snug">{body}</p>
    </div>
  )
}
