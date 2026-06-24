import { Stethoscope, GitBranch, Layers } from 'lucide-react'

type DiagnosisEntry = {
  code: string
  label: string
  note?: string
}

type DiagnosisGroup = {
  kind: 'differential' | 'comorbid'
  title: string
  hint: string
  Icon: typeof Stethoscope
  items: DiagnosisEntry[]
}

const MOCK_GROUPS: DiagnosisGroup[] = [
  {
    kind: 'differential',
    title: 'Дифференциальные',
    hint: 'Что обсуждалось на прошлом приёме как возможные направления.',
    Icon: GitBranch,
    items: [
      {
        code: 'E11.9',
        label: 'Сахарный диабет 2 типа без осложнений',
        note: 'Основной маршрут наблюдения',
      },
      {
        code: 'E78.5',
        label: 'Гиперлипидемия неуточнённая',
        note: 'Уточнить по новой липидограмме',
      },
    ],
  },
  {
    kind: 'comorbid',
    title: 'Коморбидные',
    hint: 'Состояния, заявленные пациентом или подтверждённые ранее.',
    Icon: Layers,
    items: [
      {
        code: 'I10',
        label: 'Эссенциальная (первичная) гипертензия',
        note: 'Наблюдается у терапевта по месту жительства',
      },
      {
        code: 'E66.9',
        label: 'Ожирение неуточнённое',
      },
    ],
  },
]

export default function DiagnosesSection() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-h2-ui font-bold text-ink-strong leading-tight">
          Диагнозы
        </h2>
        <p className="text-caption text-ink-muted mt-1">
          Дифференциальные направления и коморбидные состояния — справочный
          контекст к приёму.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {MOCK_GROUPS.map((g) => (
          <section
            key={g.kind}
            className="rounded-2xl bg-surface-sunken p-5 flex flex-col gap-3"
          >
            <header className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-cyan-600 shadow-[inset_0_0_0_1.5px_var(--slate-200)]">
                <g.Icon size={17} strokeWidth={2.2} />
              </span>
              <div>
                <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
                  {g.kind === 'differential' ? 'Диф. диагнозы' : 'Коморбидность'}
                </p>
                <p className="text-body-lg font-bold text-ink-strong">{g.title}</p>
                <p className="text-caption text-ink-muted mt-1 leading-relaxed">
                  {g.hint}
                </p>
              </div>
            </header>

            <ul className="flex flex-col gap-2">
              {g.items.map((d) => (
                <li
                  key={d.code}
                  className="rounded-xl bg-white p-3 flex items-start gap-3 shadow-[inset_0_0_0_1.5px_var(--slate-200)]"
                >
                  <span className="font-data text-caption font-bold text-cyan-600 mt-0.5 shrink-0">
                    {d.code}
                  </span>
                  <div className="flex-1">
                    <p className="text-body text-ink-strong leading-snug">
                      {d.label}
                    </p>
                    {d.note && (
                      <p className="text-caption text-ink-muted mt-0.5">
                        {d.note}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-caption text-ink-muted leading-relaxed flex items-start gap-2">
        <Stethoscope size={13} strokeWidth={2.2} className="mt-0.5 shrink-0" />
        Это справочные направления для подготовки к приёму, не диагноз и не
        назначение.
      </p>
    </div>
  )
}
