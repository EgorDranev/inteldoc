import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ClipboardCheck, MessageCircle, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import PhoneFrame from '../../../components/patient/PhoneFrame'
import OnboardingChrome from '../../../components/patient/OnboardingChrome'
import VasilyMascot from '../../../components/system/VasilyMascot'
import Button from '../../../components/primitives/Button'
import { track } from '../../../lib/analytics'

// Entrance choreography for S01.
// Hero card settles in first (scale + fade). Three value-prop cards then
// fade-up in tree order, 60ms apart. Bottom CTA fades in fast so it's
// tappable immediately — never gated by the sequence.
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

const HERO_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.36, ease: EASE_OUT } },
}

const ITEM_BASE_DELAY = 0.18
const ITEM_STAGGER = 0.06

function itemVariants(index: number): Variants {
  return {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.28,
        ease: 'easeOut',
        delay: ITEM_BASE_DELAY + index * ITEM_STAGGER,
      },
    },
  }
}

const CTA_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
}

interface OnboardingPoint {
  Icon: LucideIcon
  title: string
  body: string
}

const POINTS: OnboardingPoint[] = [
  {
    Icon: ClipboardCheck,
    title: 'Соберу подготовку в один список',
    body: 'Анализы, документы и вопросы к врачу будут лежать рядом, без поиска по чатам и файлам.',
  },
  {
    Icon: MessageCircle,
    title: 'Можно писать простыми словами',
    body: 'Если не знаете, куда добавить симптом или выписку, просто спросите меня.',
  },
  {
    Icon: ShieldCheck,
    title: 'Решения остаются за врачом',
    body: 'Я помогаю подготовиться и ничего не назначаю вместо специалиста.',
  },
]

/**
 * S01 — first patient screen. Vasily-led greeting that explains what the app
 * does for the patient before the profile/access/consent steps.
 */
export default function Welcome() {
  const nav = useNavigate()
  const enteredAt = useRef(performance.now())
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    track({ name: 'welcome_viewed' })
  }, [])

  function next() {
    const dwellMs = Math.round(performance.now() - enteredAt.current)
    track({ name: 'welcome_cta_tapped', dwellMs })
    nav('/patient/entry/account')
  }

  const initial = reduceMotion ? 'show' : 'hidden'

  return (
    <PhoneFrame>
      <OnboardingChrome />

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
        <motion.section
          initial={initial}
          animate="show"
          variants={HERO_VARIANTS}
          className="relative overflow-hidden rounded-2xl bg-navy-900 px-6 py-6 text-white"
          style={{ willChange: reduceMotion ? undefined : 'transform, opacity' }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.08),transparent_65%)]"
          />
          <div className="relative flex flex-col items-center justify-center gap-4 text-center">
            <VasilyMascot size={120} halo className="flex-shrink-0" />
            <div>
              <h1 className="text-h2-ui font-bold">
                Здравствуйте, я Василий{' '}— ваш личный ассистент
              </h1>
            </div>
          </div>
        </motion.section>

        <div className="flex flex-col gap-4">
          {POINTS.map(({ Icon, title, body }, i) => (
            <motion.article
              key={title}
              initial={initial}
              animate="show"
              variants={itemVariants(i)}
              className="rounded-2xl bg-surface-sunken px-4 py-4 flex items-start gap-3"
            >
              <div className="h-11 w-11 rounded-lg bg-cyan-50 text-cyan-500 flex items-center justify-center flex-shrink-0">
                <Icon size={22} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-body-lg font-bold text-ink-strong leading-snug">
                  {title}
                </p>
                <p className="text-body text-ink-muted leading-relaxed mt-1">
                  {body}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>

      <motion.div
        initial={initial}
        animate="show"
        variants={CTA_VARIANTS}
        className="px-5 pb-8 pt-4 bg-white/85 backdrop-blur shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.08)]"
      >
        <p className="mb-3 text-caption text-ink-muted text-center leading-relaxed">
          Создадим профиль, подтвердим доступ Эндокор и согласия{' '}— займёт пару минут.
        </p>
        <Button full onClick={next}>
          Начать
        </Button>
      </motion.div>
    </PhoneFrame>
  )
}
