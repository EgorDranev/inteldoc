import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Mail,
  Phone,
  ShieldAlert,
} from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import TabBar from '../../components/primitives/TabBar'
import Button from '../../components/primitives/Button'

type Mode = 'hub' | 'integrity-sent'

interface DestinationProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  sla: string
  href?: string
  onClick?: () => void
}

function DestinationCard({ icon, title, subtitle, sla, href, onClick }: DestinationProps) {
  const inner = (
    <>
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-ink-strong leading-tight">{title}</p>
        <p className="text-caption text-ink-muted leading-snug mt-0.5">{subtitle}</p>
        <p className="text-[11px] font-bold uppercase tracking-caps text-cyan-600 mt-1.5">
          {sla}
        </p>
      </div>
      <ChevronRight size={17} className="text-ink-muted" strokeWidth={2} />
    </>
  )
  const cls =
    'rounded-2xl bg-white p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors w-full text-left'
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    )
  }
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

export default function Support() {
  const nav = useNavigate()
  const location = useLocation()
  const initialMode: Mode =
    (location.state as { mode?: Mode } | null)?.mode === 'integrity-sent'
      ? 'integrity-sent'
      : 'hub'
  const [mode, setMode] = useState<Mode>(initialMode)

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
        <p className="text-[15px] font-bold text-ink-strong">Поддержка</p>
        <div className="h-9 w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[110px] flex flex-col gap-4">
        {mode === 'integrity-sent' && (
          <section className="rounded-2xl bg-success-bg p-4 flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600">
              <CheckCircle2 size={20} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-emerald-900 leading-tight">
                Сообщение отправлено
              </p>
              <p className="text-caption text-emerald-900/80 leading-relaxed mt-1">
                Ушло сразу в две стороны:
              </p>
              <ul className="mt-2 flex flex-col gap-1.5 text-caption text-emerald-900/90">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-600" />
                  <span>
                    <b>IntelDoc · аудит и безопасность</b> — проверит активность по вашей
                    записи. Ответ в течение 1 рабочего дня.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-600" />
                  <span>
                    <b>Эндокор · регистратура</b> — разберётся со стороны клиники. Ответ в
                    течение рабочего дня.
                  </span>
                </li>
              </ul>
            </div>
          </section>
        )}

        <section>
          <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-2 px-1">
            Связаться с человеком
          </p>
          <div className="flex flex-col gap-2">
            <DestinationCard
              icon={<Phone size={19} strokeWidth={2.2} />}
              title="Регистратура Эндокор"
              subtitle="Перенос визита и вопросы по записи. +7 (495) 124-44-00"
              sla="Ответ в течение рабочего дня"
              href="tel:+74951244400"
            />
            <DestinationCard
              icon={<Mail size={19} strokeWidth={2.2} />}
              title="Поддержка IntelDoc"
              subtitle="Приложение, загрузка, распознавание. support@inteldoc.ru"
              sla="Ответ в течение 1 рабочего дня"
              href="mailto:support@inteldoc.ru"
            />
            <DestinationCard
              icon={<Mail size={19} strokeWidth={2.2} />}
              title="Администратор Эндокор"
              subtitle="Вопросы по доступам и согласиям. admin@endocrincentr.ru"
              sla="Ответ в течение 1–2 рабочих дней"
              href="mailto:admin@endocrincentr.ru"
            />
          </div>
        </section>

        {mode === 'hub' && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-2 px-1">
              Сообщить о проблеме с данными
            </p>
            <button
              onClick={() => setMode('integrity-sent')}
              className="rounded-2xl bg-white p-4 flex items-start gap-3 w-full text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <ShieldAlert size={19} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink-strong leading-tight">
                  Это не мой анализ или не моя клиника
                </p>
                <p className="text-caption text-ink-muted leading-snug mt-1">
                  Уйдёт сразу в IntelDoc (аудит) и в Эндокор (регистратура).
                </p>
              </div>
              <ChevronRight size={17} className="text-ink-muted mt-1" strokeWidth={2} />
            </button>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500">
            <AlertTriangle size={19} strokeWidth={2.2} />
          </div>
          <p className="text-caption text-ink-muted leading-relaxed">
            При угрозе жизни звоните <b className="text-ink-strong">103</b> —
            приложение не для экстренных ситуаций.
          </p>
        </section>

        {mode === 'integrity-sent' && (
          <Button full onClick={() => nav('/patient/home', { replace: true })}>
            На главный экран
          </Button>
        )}
      </div>

      <TabBar />
    </PhoneFrame>
  )
}
