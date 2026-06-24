import type {
  AccessGrant,
  Analysis,
  DoctorRequest,
  PlanItem,
} from '../store/types'

/**
 * Typed event surfaced by the Home banner. Two tones:
 *  - `urgent`    — P0, action required (cyan, pulse).
 *  - `attention` — P1, trust / control state change (amber, calm).
 *
 * Confirmations (P2) and soft reminders (P3) intentionally live as inline
 * chips inside the relevant card, not here.
 */
export type HomeEventTone = 'urgent' | 'attention'

export type HomeEventType =
  | 'doctor-request'
  | 'plan-overdue'
  | 'ocr-review'
  | 'access-revoked'
  | 'access-expiring'

export interface HomeEvent {
  id: string
  type: HomeEventType
  tone: HomeEventTone
  priority: number
  eyebrow: string
  title: string
  body: string
  cta: string
  to: string
  count: number
}

export interface HomeEventInputs {
  unseenRequests: DoctorRequest[]
  overduePlanItems: PlanItem[]
  analyses: Analysis[]
  accessGrants: AccessGrant[]
  now: Date
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 14) return forms[2]
  if (m10 === 1) return forms[0]
  if (m10 >= 2 && m10 <= 4) return forms[1]
  return forms[2]
}

export function buildHomeEvents(inputs: HomeEventInputs): HomeEvent[] {
  const events: HomeEvent[] = []

  if (inputs.unseenRequests.length > 0) {
    const n = inputs.unseenRequests.length
    const first = inputs.unseenRequests[0]
    events.push({
      id: `doctor-request:${first.id}`,
      type: 'doctor-request',
      tone: 'urgent',
      priority: 1,
      eyebrow: n > 1 ? 'Новые запросы' : 'Новый запрос',
      title:
        n > 1
          ? `Врач отправил ${n} ${plural(n, ['запрос', 'запроса', 'запросов'])}`
          : 'Врач отправил запрос',
      body: first.title,
      cta: 'Открыть запрос',
      to: `/patient/notification/${first.id}`,
      count: n,
    })
  }

  if (inputs.overduePlanItems.length > 0) {
    const n = inputs.overduePlanItems.length
    events.push({
      id: `plan-overdue:${inputs.overduePlanItems[0].id}`,
      type: 'plan-overdue',
      tone: 'urgent',
      priority: 2,
      eyebrow: 'План обследования',
      title:
        n > 1
          ? `${n} ${plural(n, ['пункт', 'пункта', 'пунктов'])} плана ждут вас`
          : 'Пункт плана ждёт вас',
      body: 'Откройте план и отметьте, что уже сделано.',
      cta: 'Открыть план',
      to: '/patient/checklist',
      count: n,
    })
  }

  const ocrReview = inputs.analyses.filter(
    (a) =>
      a.status === 'uploaded' &&
      a.ocrFieldMeta !== undefined &&
      Object.values(a.ocrFieldMeta).some((m) => m?.lowConfidence),
  )
  if (ocrReview.length > 0) {
    const n = ocrReview.length
    const first = ocrReview[0]
    events.push({
      id: `ocr-review:${first.id}`,
      type: 'ocr-review',
      tone: 'urgent',
      priority: 3,
      eyebrow: 'Нужна проверка',
      title:
        n > 1
          ? `Проверьте распознанные данные в ${n} ${plural(n, ['анализе', 'анализах', 'анализах'])}`
          : 'Проверьте распознанные данные',
      body:
        n > 1
          ? 'Некоторые цифры стоит проверить вручную.'
          : first.label,
      cta: 'Открыть анализ',
      to: `/patient/history/${first.id}`,
      count: n,
    })
  }

  // Admin-initiated revoke — a trust-state change the patient must see. Stays
  // until the patient re-grants (which clears `revokedAt`), so it doubles as
  // the acknowledgement. Patient self-revokes are intentionally silent here.
  const adminRevoked = inputs.accessGrants.find(
    (g) => g.revokedAt && g.revokedBy === 'admin',
  )
  if (adminRevoked) {
    events.push({
      id: `access-revoked:${adminRevoked.id}`,
      type: 'access-revoked',
      tone: 'attention',
      priority: 2.5,
      eyebrow: 'Доступ Эндокор',
      title: 'Эндокор отозвал доступ к вашим данным',
      body: 'Клиника больше не видит ваши анализы. Вы можете выдать доступ снова.',
      cta: 'Открыть доступ',
      to: '/patient/profile',
      count: 1,
    })
  }

  const nowMs = inputs.now.getTime()
  const expiringSoon = inputs.accessGrants
    .filter((g) => !g.revokedAt && g.expiresAt !== undefined)
    .map((g) => ({ grant: g, t: new Date(g.expiresAt!).getTime() }))
    .filter(({ t }) => t > nowMs && t - nowMs <= SEVEN_DAYS_MS)
    .sort((a, b) => a.t - b.t)
  if (expiringSoon.length > 0) {
    const { grant, t } = expiringSoon[0]
    const days = Math.max(1, Math.ceil((t - nowMs) / ONE_DAY_MS))
    events.push({
      id: `access-expiring:${grant.id}`,
      type: 'access-expiring',
      tone: 'attention',
      priority: 4,
      eyebrow: 'Доступ Эндокор',
      title:
        days === 1
          ? 'Доступ Эндокор истекает завтра'
          : `Доступ Эндокор истекает через ${days} ${plural(days, ['день', 'дня', 'дней'])}`,
      body: 'Продлите, чтобы врач сохранил доступ к вашим данным.',
      cta: 'Открыть доступ',
      to: '/patient/profile',
      count: expiringSoon.length,
    })
  }

  return events.sort((a, b) => a.priority - b.priority)
}
