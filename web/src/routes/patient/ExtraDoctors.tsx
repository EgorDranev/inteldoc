import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Stethoscope } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import Button from '../../components/primitives/Button'
import TabBar from '../../components/primitives/TabBar'
import {
  ADDITIONAL_SPECIALISTS,
  type ExtraSpecialist,
} from '../../components/patient/AdditionalDoctorsSection'

interface DoctorEntry {
  id: string
  specialistSlug: string
  name: string
  clinic: string
  nextSlot: string
}

/** Mock catalogue per spec 020 — patient-visible only, no real availability. */
const DOCTOR_CATALOGUE: DoctorEntry[] = [
  {
    id: 'oph-1',
    specialistSlug: 'ophthalmologist',
    name: 'Лебедева Марина Игоревна',
    clinic: 'Эндокор · кабинет 312',
    nextSlot: '30 апреля · 11:00',
  },
  {
    id: 'oph-2',
    specialistSlug: 'ophthalmologist',
    name: 'Сорокин Алексей Юрьевич',
    clinic: 'Эндокор · кабинет 318',
    nextSlot: '5 мая · 09:30',
  },
  {
    id: 'card-1',
    specialistSlug: 'cardiologist',
    name: 'Орлова Татьяна Сергеевна',
    clinic: 'Эндокор · кабинет 204',
    nextSlot: '2 мая · 14:00',
  },
  {
    id: 'card-2',
    specialistSlug: 'cardiologist',
    name: 'Громов Павел Викторович',
    clinic: 'Эндокор · кабинет 206',
    nextSlot: '6 мая · 10:30',
  },
  {
    id: 'neuro-1',
    specialistSlug: 'neurologist',
    name: 'Зайцева Ирина Петровна',
    clinic: 'Эндокор · кабинет 410',
    nextSlot: '4 мая · 12:00',
  },
  {
    id: 'neph-1',
    specialistSlug: 'nephrologist',
    name: 'Карпов Денис Андреевич',
    clinic: 'Эндокор · кабинет 506',
    nextSlot: '7 мая · 09:00',
  },
]

export default function ExtraDoctors() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const focus = params.get('focus') ?? ADDITIONAL_SPECIALISTS[0].slug
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorEntry | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const activeSpec: ExtraSpecialist =
    ADDITIONAL_SPECIALISTS.find((s) => s.slug === focus) ??
    ADDITIONAL_SPECIALISTS[0]

  const doctorList = DOCTOR_CATALOGUE.filter(
    (d) => d.specialistSlug === activeSpec.slug,
  )

  function bookDoctor() {
    if (!selectedDoctor) return
    setConfirmed(true)
    setTimeout(() => nav('/patient/checklist', { replace: true }), 1100)
  }

  if (confirmed && selectedDoctor) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-[110px] text-center gap-4">
          <div className="h-20 w-20 rounded-full bg-cyan-500 flex items-center justify-center">
            <Stethoscope size={36} className="text-white" strokeWidth={2} />
          </div>
          <p className="text-h2-ui font-bold text-ink-strong">
            Запись оформлена
          </p>
          <p className="text-caption text-ink-muted leading-relaxed max-w-[280px]">
            {selectedDoctor.name} · {selectedDoctor.nextSlot}
            <br />
            Напомним заранее.
          </p>
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
        <p className="text-[15px] font-bold text-ink-strong">Другие врачи</p>
        <div className="h-9 w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500 mb-2">
            Специалисты Эндокор
          </p>
          <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
            Кого ещё может быть полезно посетить
          </h1>
          <p className="text-caption text-ink-muted leading-relaxed mt-2">
            Это рекомендации по подготовке. Решение остаётся за вами и вашим врачом.
          </p>
        </div>

        {/* Specialist tabs */}
        <div className="-mx-5 px-5">
          <div
            className="flex gap-2 overflow-x-auto pb-2"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {ADDITIONAL_SPECIALISTS.map((spec) => {
              const active = spec.slug === activeSpec.slug
              return (
                <button
                  key={spec.slug}
                  onClick={() => {
                    setParams({ focus: spec.slug })
                    setSelectedDoctor(null)
                  }}
                  className={`flex-shrink-0 rounded-full px-4 py-2 text-[12px] font-bold tracking-caps uppercase ${
                    active
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white text-cyan-500 shadow-[inset_0_0_0_1.5px_var(--blue-200)]'
                  }`}
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {spec.name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-cyan-50 px-4 py-3">
          <p className="text-caption text-cyan-700 leading-relaxed">
            <span className="font-bold">{activeSpec.name}.</span>{' '}
            {activeSpec.reason}.
          </p>
        </div>

        {doctorList.length === 0 ? (
          <div className="rounded-2xl bg-surface-sunken p-5 text-center">
            <p className="text-body text-ink-strong">
              Свободных слотов пока нет
            </p>
            <p className="text-caption text-ink-muted mt-1 leading-relaxed">
              Зайдите позже — расписание обновляется ежедневно.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted px-1">
              Выберите врача
            </p>
            {doctorList.map((d) => {
              const active = selectedDoctor?.id === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDoctor(d)}
                  className={`rounded-2xl p-4 flex items-center gap-3 text-left transition-colors ${
                    active
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white text-ink-strong hover:bg-cyan-50'
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      active ? 'bg-white/20 text-white' : 'bg-cyan-50 text-cyan-500'
                    }`}
                  >
                    <Stethoscope size={20} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[15px] font-bold leading-snug ${
                        active ? 'text-white' : 'text-ink-strong'
                      }`}
                    >
                      {d.name}
                    </p>
                    <p
                      className={`text-caption leading-snug ${
                        active ? 'text-white/85' : 'text-ink-muted'
                      }`}
                    >
                      {d.clinic} · ближайший слот {d.nextSlot}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    className={active ? 'text-white' : 'text-slate-400'}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-5 pb-3 pt-3 bg-white/85 backdrop-blur border-t border-slate-100 mb-[89px]">
        <Button full onClick={bookDoctor} disabled={!selectedDoctor}>
          Записаться
        </Button>
      </div>

      <TabBar />
    </PhoneFrame>
  )
}
