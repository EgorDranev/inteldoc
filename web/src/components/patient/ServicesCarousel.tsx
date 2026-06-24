import { useNavigate } from 'react-router-dom'
import {
  GraduationCap,
  Pill,
  TestTube,
  Sparkles,
  Shield,
  type LucideIcon,
} from 'lucide-react'

interface Service {
  slug: string
  title: string
  body: string
  Icon: LucideIcon
  tint: string
  fg: string
}

const SERVICES: Service[] = [
  {
    slug: 'diabetes-school',
    title: 'Школа диабета',
    body: 'Материалы и программы для жизни с диабетом',
    Icon: GraduationCap,
    tint: 'bg-[#EDE9FE]',
    fg: 'text-violet-600',
  },
  {
    slug: 'meds',
    title: 'Лекарства и расходники',
    body: 'Подбор нужных товаров и расходников',
    Icon: Pill,
    tint: 'bg-cyan-50',
    fg: 'text-cyan-500',
  },
  {
    slug: 'analyses',
    title: 'Анализы',
    body: 'Запись и сервисы по анализам',
    Icon: TestTube,
    tint: 'bg-success-bg',
    fg: 'text-emerald-600',
  },
  {
    slug: 'extras',
    title: 'Полезные сервисы',
    body: 'Дополнительные предложения в вашем контексте',
    Icon: Sparkles,
    tint: 'bg-warning-bg',
    fg: 'text-amber-600',
  },
  {
    slug: 'insurance',
    title: 'Страхование',
    body: 'ДМС и смежные программы',
    Icon: Shield,
    tint: 'bg-[#FFEDD5]',
    fg: 'text-orange-700',
  },
]

export default function ServicesCarousel() {
  const nav = useNavigate()
  return (
    <div className="-mx-5 px-5">
      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {SERVICES.map(({ slug, title, body, Icon, tint, fg }) => (
          <button
            key={slug}
            onClick={() => nav(`/patient/service/${slug}`)}
            className="flex-shrink-0 w-[200px] rounded-2xl bg-white p-4 text-left active:scale-[0.99] transition-transform"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div
              className={`h-11 w-11 rounded-xl ${tint} ${fg} flex items-center justify-center mb-3`}
            >
              <Icon size={22} strokeWidth={2} />
            </div>
            <p className="text-body-lg font-bold text-ink-strong leading-snug mb-1">
              {title}
            </p>
            <p className="text-caption text-ink-muted leading-snug">{body}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
