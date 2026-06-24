import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Headphones,
  Mic,
  Send,
} from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import VasilyMascot from '../../components/system/VasilyMascot'
import TabBar from '../../components/primitives/TabBar'
import { isLlmEnabled, streamVasilyReply } from '../../services/vasilyLlm'
import { useActivePatient } from '../../store/hooks'
import { firstNameFromFull } from '../../lib/formatters'

type CtaTarget = 'checklist' | 'upload' | 'plan' | 'docs' | 'home' | 'support'

interface CannedReply {
  prompt: string
  reply: string
  cta: { label: string; target: CtaTarget }
  /**
   * If present, the rendered Vasily bubble adds a dual-route confirmation card
   * (used for data-integrity / wrong-record reports — see CLAUDE.md "Support
   * model and Vasily's mediation boundary").
   */
  integrity?: boolean
}

const CTA_ROUTE: Record<CtaTarget, string> = {
  checklist: '/patient/checklist',
  upload: '/patient/upload',
  plan: '/patient/checklist',
  docs: '/patient/checklist',
  home: '/patient/home',
  support: '/patient/support',
}

const SUGGESTIONS: CannedReply[] = [
  {
    prompt: 'Что взять с собой на приём',
    reply:
      'На приём возьмите паспорт, полис ОМС, направление (если есть) и недавние результаты анализов. Все документы можно загрузить заранее — врач увидит их до визита.',
    cta: { label: 'Открыть чек-лист', target: 'checklist' },
  },
  {
    prompt: 'Как подготовиться к анализам',
    reply:
      'Большинство анализов сдают утром натощак — последний приём пищи за 8–12 часов. За день лучше не нагружать организм спортом и не пить алкоголь. Точные правила для конкретного анализа подскажет ваш врач.',
    cta: { label: 'Загрузить анализ', target: 'upload' },
  },
  {
    prompt: 'Зачем нужны документы',
    reply:
      'Документы нужны, чтобы клиника подтвердила вашу личность и оформила приём без лишних бумаг. Это разовое действие — после первой загрузки они будут доступны на каждом визите.',
    cta: { label: 'Открыть документы', target: 'docs' },
  },
  {
    prompt: 'Что будет на приёме',
    reply:
      'Врач посмотрит анализы и жалобы, задаст уточняющие вопросы и обсудит дальнейшие шаги. Если потребуются дополнительные обследования — они придут запросом в приложение.',
    cta: { label: 'Посмотреть план', target: 'plan' },
  },
  {
    prompt: 'Это не мой анализ',
    reply:
      'Спасибо, что заметили. Передам это сразу в IntelDoc (аудит и безопасность) и в регистратуру Эндокор — там разберутся со стороны клиники. Пока ответа нет, новые документы по этой записи лучше не добавлять.',
    cta: { label: 'Открыть поддержку', target: 'support' },
    integrity: true,
  },
  // The chip and the chat reply share the same string; pickReply detects
  // "не мой" → returns the integrity branch (kept in sync below).
]

interface ChatMessage {
  id: string
  role: 'patient' | 'vasily'
  text: string
  cta?: { label: string; target: CtaTarget }
  integrity?: boolean
}

function isIntegrityInput(input: string): boolean {
  const lower = input.toLowerCase()
  return (
    lower.includes('не мой') ||
    lower.includes('не моя') ||
    lower.includes('не моё') ||
    lower.includes('не мое') ||
    lower.includes('чужой') ||
    lower.includes('чужие') ||
    lower.includes('не загружал') ||
    lower.includes('не сдавал') ||
    lower.includes('странн') ||
    lower.includes('подозрит') ||
    lower.includes('взлом') ||
    lower.includes('ошибка в данн') ||
    lower.includes('ошибка в записи')
  )
}

function pickReply(input: string): CannedReply {
  const lower = input.toLowerCase()
  // Data-integrity / wrong-record escalation. CLAUDE.md requires dual-route
  // notification (IntelDoc audit + Эндокор correction). Match early so it wins
  // over softer intents like "не мой документ → документы".
  if (isIntegrityInput(input)) {
    return {
      prompt: input,
      reply:
        'Спасибо, что заметили. Передам это сразу в IntelDoc (аудит и безопасность) и в регистратуру Эндокор — там разберутся со стороны клиники. Пока ответа нет, новые документы по этой записи лучше не добавлять.',
      cta: { label: 'Открыть поддержку', target: 'support' },
      integrity: true,
    }
  }
  if (lower.includes('диагноз') || lower.includes('лечение') || lower.includes('рецепт')) {
    return {
      prompt: input,
      reply:
        'Я не ставлю диагнозы и не назначаю лечение — это работа врача. Но я могу подсказать, что взять с собой и как подготовиться, чтобы приём прошёл продуктивно.',
      cta: { label: 'Открыть чек-лист', target: 'checklist' },
    }
  }
  // "Зачем это?" — the "why bother" branch from the recommendation card.
  // Closes with a CTA back to the checklist so the loop returns to the
  // recommended action.
  if (
    lower.includes('зачем') ||
    lower.includes('почему') ||
    lower.includes('для чего')
  ) {
    return {
      prompt: input,
      reply:
        'Врач увидит ваши ответы до приёма и подготовится заранее. На самой встрече вы не будете тратить время на анкету — обсудите главное.',
      cta: { label: 'Хорошо, начну', target: 'checklist' },
    }
  }
  // "Сколько займёт?" — the "how long" branch from the recommendation card.
  if (
    lower.includes('сколько') ||
    lower.includes('займ') ||
    lower.includes('минут') ||
    lower.includes('долго')
  ) {
    return {
      prompt: input,
      reply:
        'Около 3 минут. Если устанете — можно прерваться и продолжить позже, прогресс сохранится.',
      cta: { label: 'Хорошо, начну', target: 'checklist' },
    }
  }
  if (lower.includes('взять') || lower.includes('документ') || lower.includes('паспорт')) {
    return SUGGESTIONS[0]
  }
  if (lower.includes('анализ') || lower.includes('кровь') || lower.includes('сахар')) {
    return SUGGESTIONS[1]
  }
  if (lower.includes('приём') || lower.includes('прием') || lower.includes('визит')) {
    return SUGGESTIONS[3]
  }
  // safe default
  return {
    prompt: input,
    reply:
      'Готов подсказать по подготовке к приёму, документам и анализам. Если хотите, давайте начнём с чек-листа — там видно, что осталось.',
    cta: { label: 'Открыть чек-лист', target: 'checklist' },
  }
}

let _msgSeq = 1
function nextMsgId() {
  return `m-${Date.now().toString(36)}-${(_msgSeq++).toString(36)}`
}

export default function VasilyHelper() {
  const nav = useNavigate()
  const location = useLocation()
  const patient = useActivePatient()
  const firstName = patient ? firstNameFromFull(patient.name) : 'Мария'
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'intro',
      role: 'vasily',
      text: 'Здравствуйте! Я Василий, ваш цифровой помощник. Чем могу помочь?',
    },
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [voiceStage, setVoiceStage] = useState<
    'idle' | 'recording' | 'transcribing'
  >('idle')
  const [recordingMs, setRecordingMs] = useState(0)
  const [voiceHint, setVoiceHint] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const voiceStartRef = useRef<number | null>(null)
  const voiceTickRef = useRef<number | null>(null)
  const voiceHintTimerRef = useRef<number | null>(null)
  const voiceSampleIdxRef = useRef(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, thinking])

  useEffect(() => {
    const state = location.state as
      | { mode?: 'voice'; initialPrompt?: string }
      | null
    if (state?.mode === 'voice') {
      // Auto-trigger the hold-to-record affordance from the Home voice tile.
      simulateAutoVoice()
      // Clear the state so a back/forward nav doesn't re-trigger the mic.
      nav(location.pathname, { replace: true, state: null })
    } else if (state?.initialPrompt) {
      // Patient tapped a quick-reply chip on the recommendation card —
      // pre-ask the question so the chat opens mid-conversation, not from
      // a blank state.
      ask(state.initialPrompt)
      nav(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ask(prompt: string) {
    const text = prompt.trim()
    if (!text) return
    setInput('')

    // Capture history before we append the new patient turn.
    const historyForLlm = messages
      .filter((m) => m.id !== 'intro')
      .map((m) => ({
        role: m.role === 'patient' ? ('user' as const) : ('assistant' as const),
        text: m.text,
      }))

    setMessages((prev) => [
      ...prev,
      { id: nextMsgId(), role: 'patient', text },
    ])

    // Integrity branch — deterministic safety net. Never let the LLM decide
    // the dual-route escalation copy; CLAUDE.md requires the IntelDoc audit
    // + Эндокор regs routing to be predictable.
    if (isIntegrityInput(text)) {
      setThinking(true)
      setTimeout(() => {
        const reply = pickReply(text)
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'vasily',
            text: reply.reply,
            cta: reply.cta,
            integrity: reply.integrity,
          },
        ])
        setThinking(false)
      }, 500)
      return
    }

    // No key configured → deterministic path.
    if (!isLlmEnabled()) {
      setThinking(true)
      setTimeout(() => {
        const reply = pickReply(text)
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            role: 'vasily',
            text: reply.reply,
            cta: reply.cta,
            integrity: reply.integrity,
          },
        ])
        setThinking(false)
      }, 500)
      return
    }

    // LLM streaming path. Create an empty vasily bubble immediately; tokens
    // fill it in. CTA picked locally from the user input — keeps routing
    // deterministic regardless of LLM phrasing.
    setThinking(true)
    const streamingId = nextMsgId()
    let opened = false
    try {
      const fullText = await streamVasilyReply({
        userInput: text,
        history: historyForLlm,
        onDelta: (chunk) => {
          if (!opened) {
            opened = true
            setThinking(false)
            setMessages((prev) => [
              ...prev,
              { id: streamingId, role: 'vasily', text: chunk },
            ])
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId ? { ...m, text: m.text + chunk } : m,
              ),
            )
          }
        },
      })
      // Attach CTA once stream is done. If no chunks arrived (empty reply),
      // synthesize the bubble now from the final text + fallback CTA.
      const fallback = pickReply(text)
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === streamingId)
        if (exists) {
          return prev.map((m) =>
            m.id === streamingId
              ? { ...m, text: fullText || m.text, cta: fallback.cta }
              : m,
          )
        }
        return [
          ...prev,
          {
            id: streamingId,
            role: 'vasily',
            text: fullText || fallback.reply,
            cta: fallback.cta,
          },
        ]
      })
    } catch (err) {
      // LLM failed (network, rate limit, bad key) → deterministic fallback.
      // Keep the demo viable when offline / over budget.
      console.warn('[Vasily] LLM call failed, falling back:', err)
      const reply = pickReply(text)
      setMessages((prev) => {
        const withoutEmpty = prev.filter((m) => m.id !== streamingId)
        return [
          ...withoutEmpty,
          {
            id: nextMsgId(),
            role: 'vasily',
            text: reply.reply,
            cta: reply.cta,
            integrity: reply.integrity,
          },
        ]
      })
    } finally {
      setThinking(false)
    }
  }

  // Rotating sample utterances so repeated holds produce different
  // "transcriptions" during a demo. Order is intentional — first hold pulls
  // the canonical onboarding question.
  const VOICE_SAMPLES = [
    'Что взять с собой на приём?',
    'Как подготовиться к анализам?',
    'Зачем нужны документы?',
    'Что будет на приёме?',
  ]

  function clearVoiceTimers() {
    if (voiceTickRef.current !== null) {
      window.clearInterval(voiceTickRef.current)
      voiceTickRef.current = null
    }
  }

  function showVoiceHint(text: string) {
    if (voiceHintTimerRef.current !== null) {
      window.clearTimeout(voiceHintTimerRef.current)
    }
    setVoiceHint(text)
    voiceHintTimerRef.current = window.setTimeout(() => {
      setVoiceHint(null)
      voiceHintTimerRef.current = null
    }, 2200)
  }

  function beginVoice() {
    if (voiceStage !== 'idle') return
    setVoiceError(null)
    setVoiceHint(null)
    voiceStartRef.current = performance.now()
    setRecordingMs(0)
    setVoiceStage('recording')
    voiceTickRef.current = window.setInterval(() => {
      if (voiceStartRef.current !== null) {
        setRecordingMs(performance.now() - voiceStartRef.current)
      }
    }, 100)
  }

  function endVoice(cancel = false) {
    if (voiceStage !== 'recording') return
    clearVoiceTimers()
    const heldMs =
      voiceStartRef.current !== null
        ? performance.now() - voiceStartRef.current
        : 0
    voiceStartRef.current = null
    setRecordingMs(0)

    if (cancel) {
      setVoiceStage('idle')
      return
    }
    if (heldMs < 350) {
      // Treat short taps as a discoverability moment, not a recording.
      setVoiceStage('idle')
      showVoiceHint('Удерживайте кнопку, чтобы говорить')
      return
    }

    // Simulate transcription delay → pick the next sample → send through the
    // normal chat path so canned/LLM routing stays consistent.
    setVoiceStage('transcribing')
    window.setTimeout(() => {
      const sample =
        VOICE_SAMPLES[voiceSampleIdxRef.current % VOICE_SAMPLES.length]
      voiceSampleIdxRef.current += 1
      setVoiceStage('idle')
      ask(sample)
    }, 650)
  }

  function simulateAutoVoice() {
    // Entry from the Home voice tile — no real hold gesture available, so
    // play the recording state for a moment then transcribe.
    if (voiceStage !== 'idle') return
    setVoiceError(null)
    voiceStartRef.current = performance.now()
    setRecordingMs(0)
    setVoiceStage('recording')
    voiceTickRef.current = window.setInterval(() => {
      if (voiceStartRef.current !== null) {
        setRecordingMs(performance.now() - voiceStartRef.current)
      }
    }, 100)
    window.setTimeout(() => endVoice(false), 1600)
  }

  useEffect(() => {
    return () => {
      clearVoiceTimers()
      if (voiceHintTimerRef.current !== null) {
        window.clearTimeout(voiceHintTimerRef.current)
      }
    }
  }, [])

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
        <p className="text-[15px] font-bold text-ink-strong">Василий</p>
        <div className="h-9 w-9" />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pb-3 flex flex-col gap-3"
      >
        <div className="flex flex-col gap-3 pt-2 pb-4">
          <div className="flex items-center gap-3">
            <VasilyMascot size={108} halo className="flex-shrink-0" />
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <p className="text-h1-ui font-bold text-ink-strong leading-tight">
                Здравствуйте, {firstName}
              </p>
              <p className="text-body text-ink-muted leading-snug">
                Я Василий, ваш цифровой помощник. Чем могу помочь?
              </p>
            </div>
          </div>
          {messages.length === 1 && (
            <p className="text-caption text-ink-subtle leading-snug">
              Это информационная подсказка. Решения принимает ваш врач.
            </p>
          )}
        </div>

        {messages.map((m) =>
          m.id === 'intro' ? null : m.role === 'vasily' ? (
            <div
              key={m.id}
              className="rounded-2xl bg-white px-4 py-3 max-w-[300px] self-start flex flex-col gap-2"
            >
              <p className="text-body text-ink-strong leading-relaxed">{m.text}</p>
              {m.integrity && (
                <div className="mt-1 rounded-xl bg-[#FFF8E6] px-3 py-2.5 flex flex-col gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-caps text-amber-700">
                    Куда ушло
                  </p>
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-600" />
                    <p className="text-caption text-ink-strong leading-snug">
                      <b>IntelDoc · аудит</b> — ответ в течение 1 рабочего дня
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-600" />
                    <p className="text-caption text-ink-strong leading-snug">
                      <b>Эндокор · регистратура</b> — ответ в течение рабочего дня
                    </p>
                  </div>
                </div>
              )}
              {m.cta && (
                <button
                  onClick={() =>
                    m.integrity && m.cta!.target === 'support'
                      ? nav(CTA_ROUTE[m.cta!.target], {
                          state: { mode: 'integrity-sent' },
                        })
                      : nav(CTA_ROUTE[m.cta!.target])
                  }
                  className="self-start mt-1 inline-flex items-center gap-1.5 rounded-full bg-cyan-50 text-cyan-600 px-3 py-1.5 text-[12px] font-bold tracking-caps uppercase"
                >
                  {m.cta.label}
                  <ChevronRight size={14} strokeWidth={2.5} />
                </button>
              )}
              {m.integrity && (
                <p className="text-caption text-ink-muted leading-snug border-t border-slate-200 pt-2 mt-1">
                  Если нужно решить вопрос быстрее — позвоните в регистратуру Эндокор.
                </p>
              )}
            </div>
          ) : (
            <div
              key={m.id}
              className="self-end max-w-[280px] rounded-2xl bg-cyan-500 text-white px-4 py-3"
            >
              <p className="text-body leading-relaxed">{m.text}</p>
            </div>
          ),
        )}

        <AnimatePresence>
          {thinking && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="self-start rounded-2xl bg-white px-4 py-3"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-cyan-500"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 0.9,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggestion chips — only on the very first turn for guided start.
            Help-intent chips render together; the integrity chip is split out
            below with a warning treatment so its safety semantics aren't
            visually equated with help questions. */}
        {messages.length <= 2 && (
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.filter((s) => !s.integrity).map((s) => (
                <button
                  key={s.prompt}
                  onClick={() => ask(s.prompt)}
                  className="rounded-full bg-white px-3.5 py-2 text-[12px] font-bold tracking-caps text-cyan-600 shadow-[inset_0_0_0_1.5px_var(--blue-200)] hover:bg-cyan-50"
                >
                  {s.prompt}
                </button>
              ))}
            </div>
            {SUGGESTIONS.filter((s) => s.integrity).map((s) => (
              <button
                key={s.prompt}
                onClick={() => ask(s.prompt)}
                className="self-start inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-2 text-[12px] font-bold tracking-caps text-amber-700 shadow-[inset_0_0_0_1.5px_rgba(217,119,6,0.35)] hover:bg-amber-100"
              >
                <AlertTriangle size={13} strokeWidth={2.4} />
                Сообщить: {s.prompt.toLowerCase()}
              </button>
            ))}
          </div>
        )}

        {voiceError && (
          <div className="rounded-2xl bg-danger-bg px-4 py-3 text-rose-700 text-caption leading-relaxed">
            {voiceError}
            <button
              onClick={() => setVoiceError(null)}
              className="ml-2 inline-flex items-center text-[12px] font-bold tracking-caps uppercase text-rose-700"
            >
              Понятно
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-3 bg-white/85 backdrop-blur border-t border-slate-200 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.08)] mb-[89px] relative">
        <button
          onClick={() => nav('/patient/support')}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-[12px] font-bold tracking-caps uppercase text-ink-muted hover:bg-slate-100 hover:text-cyan-600 transition-colors"
        >
          <Headphones size={13} strokeWidth={2.4} />
          Связаться с поддержкой
          <ChevronRight size={13} strokeWidth={2.4} className="-mr-1" />
        </button>

        <AnimatePresence>
          {voiceHint && (
            <motion.div
              key="voice-hint"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-2 mx-1 rounded-xl bg-slate-900/90 px-3 py-2 text-[12px] font-medium text-white text-center"
            >
              {voiceHint}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            {voiceStage === 'recording' ? (
              <VoiceRecordingPill elapsedMs={recordingMs} />
            ) : voiceStage === 'transcribing' ? (
              <VoiceTranscribingPill />
            ) : (
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ask(input)
                }}
                placeholder="Спросите Василия…"
                className="w-full rounded-full bg-surface-sunken px-4 py-3 text-body text-ink-strong placeholder:text-ink-subtle outline-none focus:shadow-[inset_0_0_0_1.5px_var(--blue-600)]"
              />
            )}
          </div>
          <button
            onPointerDown={(e) => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
              beginVoice()
            }}
            onPointerUp={() => endVoice(false)}
            onPointerCancel={() => endVoice(true)}
            onPointerLeave={() => {
              if (voiceStage === 'recording') endVoice(true)
            }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={voiceStage === 'transcribing'}
            aria-label="Голосовой ввод — удерживайте, чтобы говорить"
            className={`h-12 w-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all select-none touch-none ${
              voiceStage === 'recording'
                ? 'bg-rose-500 text-white scale-110 shadow-[0_0_0_6px_rgba(244,63,94,0.18)]'
                : voiceStage === 'transcribing'
                  ? 'bg-cyan-500 text-white'
                  : input.trim()
                    ? 'bg-white text-cyan-500 shadow-[inset_0_0_0_1.5px_var(--blue-200)]'
                    : 'bg-cyan-500 text-white shadow-[0_4px_12px_-2px_rgba(8,145,178,0.35)]'
            }`}
          >
            <Mic size={20} strokeWidth={2} />
          </button>
          <button
            onClick={() => ask(input)}
            disabled={!input.trim() || voiceStage !== 'idle'}
            aria-label="Отправить"
            className={`h-12 w-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${
              input.trim() && voiceStage === 'idle'
                ? 'bg-cyan-500 text-white shadow-[0_4px_12px_-2px_rgba(8,145,178,0.35)]'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <Send size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <TabBar />
    </PhoneFrame>
  )
}

function formatVoiceTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function VoiceRecordingPill({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="w-full rounded-full bg-rose-50 px-4 py-3 flex items-center gap-3">
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
      </span>
      <div className="flex flex-1 items-center gap-[3px]">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
          <motion.span
            key={i}
            className="block w-[3px] rounded-full bg-rose-500"
            animate={{ height: [6, 14 + (i % 3) * 4, 6] }}
            transition={{
              duration: 0.7 + (i % 4) * 0.1,
              repeat: Infinity,
              delay: i * 0.05,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <span className="text-[12px] font-bold tabular-nums text-rose-600 flex-shrink-0">
        {formatVoiceTime(elapsedMs)}
      </span>
    </div>
  )
}

function VoiceTranscribingPill() {
  return (
    <div className="w-full rounded-full bg-cyan-50 px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-cyan-500"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <p className="text-[13px] font-medium text-cyan-700">Распознаём речь…</p>
    </div>
  )
}

