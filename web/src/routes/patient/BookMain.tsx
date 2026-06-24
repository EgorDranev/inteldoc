import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Calendar, Check, MapPin, Phone } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import Button from '../../components/primitives/Button'
import Avatar from '../../components/primitives/Avatar'
import TabBar from '../../components/primitives/TabBar'
import { useInteldoc } from '../../store/store'
import { bookMainAppointment } from '../../store/actions'

const SLOTS = [
  { iso: '2026-04-29T10:00:00', label: '29 апреля · 10:00' },
  { iso: '2026-04-29T12:30:00', label: '29 апреля · 12:30' },
  { iso: '2026-05-04T09:30:00', label: '4 мая · 09:30' },
  { iso: '2026-05-04T15:00:00', label: '4 мая · 15:00' },
  { iso: '2026-05-06T11:00:00', label: '6 мая · 11:00' },
]

export default function BookMain() {
  const nav = useNavigate()
  const [selected, setSelected] = useState(SLOTS[0].iso)
  const [confirmed, setConfirmed] = useState(false)
  const doctor = useInteldoc((s) => s.doctors.find((d) => d.id === s.currentDoctorId))

  function book() {
    bookMainAppointment({ date: selected })
    setConfirmed(true)
  }

  if (confirmed) {
    return (
      <PhoneFrame>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button
            onClick={() => nav('/patient/home', { replace: true })}
            aria-label="Назад"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={20} className="text-ink" strokeWidth={2} />
          </button>
          <p className="text-[15px] font-bold text-ink-strong">Запись подтверждена</p>
          <div className="h-9 w-9" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          <section className="rounded-2xl bg-cyan-500 p-6 text-center text-white">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-white/20 flex items-center justify-center">
              <Check size={40} className="text-white" strokeWidth={2.6} />
            </div>
            <p className="text-h2-ui font-bold">Приём запланирован</p>
            <p className="mt-2 text-caption text-white/85 leading-relaxed">
              Напомним за день. Если что-то изменится — сообщим первыми.
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <SuccessInfo
              icon={<Calendar size={18} strokeWidth={2.2} />}
              title="Дата"
              body={SLOTS.find((s) => s.iso === selected)?.label ?? 'выбранный слот'}
            />
            <SuccessInfo
              icon={<MapPin size={18} strokeWidth={2.2} />}
              title="Место"
              body="Эндокор · диабетология"
            />
          </div>

          <div className="rounded-2xl bg-white p-4 flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-success-bg text-emerald-700">
              <Bell size={19} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[14px] font-bold text-ink-strong">Что дальше</p>
              <p className="text-caption text-ink-muted leading-relaxed mt-0.5">
                Все загруженные материалы останутся в подготовке к этому визиту.
              </p>
            </div>
          </div>

          <a
            href="tel:+74950000000"
            className="rounded-2xl bg-white p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500">
              <Phone size={19} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-ink-strong">Связаться с ресепшен Эндокор</p>
              <p className="text-caption text-ink-muted leading-snug mt-0.5">
                +7 (495) 000-00-00 · перенести или уточнить визит
              </p>
            </div>
          </a>
        </div>

        <div className="px-5 pb-3 pt-3 bg-white/85 backdrop-blur border-t border-slate-100 mb-[89px]">
          <Button full onClick={() => nav('/patient/home', { replace: true })}>
            На главный экран
          </Button>
        </div>

        <TabBar />
      </PhoneFrame>
    )
  }

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
        <p className="text-[15px] font-bold text-ink-strong">Запись к врачу</p>
        <div className="h-9 w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500 mb-2">
            Запись к основному врачу
          </p>
          <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
            Выберите удобное время
          </h1>
          <p className="text-caption text-ink-muted leading-relaxed mt-2">
            Подготовка завершена — остаётся только выбрать день. Все слоты доступны в клинике Эндокор.
          </p>
        </div>

        {doctor && (
          <div className="rounded-2xl bg-surface p-5 flex items-center gap-3">
            <Avatar name={doctor.name} size={56} />
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-ink-strong leading-tight">
                {doctor.name}
              </p>
              <p className="text-caption text-ink-muted">{doctor.specialty}</p>
              <p className="text-caption text-ink-muted">Эндокор · Отделение диабетологии</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted px-1">
            Доступные слоты
          </p>
          {SLOTS.map((s) => {
            const active = selected === s.iso
            return (
              <button
                key={s.iso}
                onClick={() => setSelected(s.iso)}
                className={`flex items-center gap-3 rounded-2xl p-4 text-left transition-colors ${
                  active
                    ? 'bg-cyan-500 text-white'
                    : 'bg-surface text-ink-strong hover:bg-cyan-50'
                }`}
              >
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    active ? 'bg-white/20 text-white' : 'bg-cyan-50 text-cyan-500'
                  }`}
                >
                  <Calendar size={20} strokeWidth={2} />
                </div>
                <p
                  className={`flex-1 text-[15px] font-bold font-data ${
                    active ? 'text-white' : 'text-ink-strong'
                  }`}
                >
                  {s.label}
                </p>
                {active && <Check size={20} strokeWidth={2.4} className="text-white" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-5 pb-3 pt-3 bg-white/85 backdrop-blur border-t border-slate-100 mb-[89px]">
        <Button full onClick={book}>
          Записаться
        </Button>
      </div>

      <TabBar />
    </PhoneFrame>
  )
}

function SuccessInfo({
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
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500">
        {icon}
      </div>
      <p className="text-[13px] font-bold text-ink-strong">{title}</p>
      <p className="mt-1 text-caption text-ink-muted leading-snug">{body}</p>
    </div>
  )
}
