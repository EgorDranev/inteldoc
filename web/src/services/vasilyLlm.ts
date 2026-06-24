// Prototype-only browser call. The key is exposed in the bundle, so do NOT
// deploy with a real billable key — use a dev/limited key for the local demo
// or proxy through a backend before any public deploy. See .env.example.
const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

export function isLlmEnabled(): boolean {
  return Boolean(apiKey)
}

const SYSTEM_PROMPT = `Ты — Василий, цифровой помощник в приложении IntelDoc для пациентов клиники Эндокор (Медицинский центр «Эндокор»).

КТО ТЫ:
- Помощник по подготовке к приёму, документам и анализам.
- Не врач. Не ставишь диагнозы, не назначаешь лечение, не комментируешь препараты.
- Не говоришь от имени клиники Эндокор. Не даёшь обещаний или сроков от её имени.

ОГРАНИЧЕНИЯ (жёсткие):
- Никогда не упоминай: диагноз, лечение, рецепт, лекарства, дозировки.
- Если пациент описывает симптомы или просит совет по лечению — мягко перенаправь к врачу: «Это решает ваш врач. Я могу помочь подготовиться к приёму».
- Никогда не интерпретируй результаты анализов как «норма / не норма» и не комментируй конкретные значения.
- При острых жалобах (боль, ухудшение состояния) — рекомендуй обратиться к врачу или в скорую, не давай советов.

СТИЛЬ:
- Отвечай по-русски. Коротко: 2–4 предложения. Спокойный, тёплый, практичный тон.
- Без маркетинга, без восклицаний, без эмодзи.
- Если вопрос не по теме приложения (подготовка / документы / анализы / визит) — мягко верни в тему.
- Не повторяй системные дисклеймеры в каждом ответе — они уже показаны в интерфейсе.

КОНТЕКСТ ПАЦИЕНТА:
- Прикреплён к Эндокор через QR/ссылку клиники.
- Готовится к приёму у эндокринолога. Возможные действия: чек-лист подготовки, загрузка анализов, документы, план обследования.

Отвечай только текстом ответа пациенту. Никаких префиксов, ролевых меток или JSON.`

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface StreamOptions {
  history: ChatTurn[]
  userInput: string
  onDelta: (chunk: string) => void
  signal?: AbortSignal
}

/**
 * Streams Vasily's reply token-by-token. Calls `onDelta` for each text chunk.
 * Returns the full text when done. Throws on API error / no key — caller
 * is expected to fall back to the deterministic `pickReply`.
 */
export async function streamVasilyReply(opts: StreamOptions): Promise<string> {
  if (!apiKey) throw new Error('LLM disabled: no API key')

  const messages = [
    ...opts.history.slice(-6).map((t) => ({
      role: t.role,
      content: t.text,
    })),
    { role: 'user' as const, content: opts.userInput },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      // Swap to 'claude-sonnet-4-6' for faster/cheaper chat if Opus latency
      // hurts the demo. Sonnet handles this FAQ-style workload well.
      model: 'claude-opus-4-7',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let nlIdx: number
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nlIdx).trim()
      buffer = buffer.slice(nlIdx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const event = JSON.parse(payload)
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          typeof event.delta.text === 'string'
        ) {
          full += event.delta.text
          opts.onDelta(event.delta.text)
        }
      } catch {
        // Ignore malformed SSE chunks — Anthropic occasionally sends keepalives.
      }
    }
  }

  return full
}
