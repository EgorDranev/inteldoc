// Russian date / number formatting helpers.

const RU_MONTHS_SHORT = [
  'янв.',
  'февр.',
  'март',
  'апр.',
  'май',
  'июнь',
  'июль',
  'авг.',
  'сент.',
  'окт.',
  'нояб.',
  'дек.',
]
const RU_MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

function parseDate(input: string): Date | null {
  // Accepts ISO yyyy-mm-dd[*] or dd.mm.yyyy
  if (!input) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) return new Date(input)
  const m = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return null
}

/** "12 апреля" — uses genitive month, no year. */
export function formatDateShort(input: string): string {
  const d = parseDate(input)
  if (!d) return input
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`
}

/** "12.03.1968" — Russian dotted form for DOB, passport-style dates. */
export function formatDateDotted(input: string): string {
  const d = parseDate(input)
  if (!d) return input
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

/** "12 апреля 2026" — with year. */
export function formatDateFull(input: string): string {
  const d = parseDate(input)
  if (!d) return input
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * "Сегодня" / "Завтра" / "Через 5 дней" / "5 дней назад" — relative day lead.
 * Used as the appointment-date headline strip on Home.
 */
export function formatAppointmentLead(input: string, now: Date = new Date()): string {
  const d = parseDate(input)
  if (!d) return input
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000)
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Завтра'
  if (days === -1) return 'Вчера'
  const abs = Math.abs(days)
  const mod10 = abs % 10
  const mod100 = abs % 100
  let suffix: string
  if (mod100 >= 11 && mod100 <= 14) suffix = 'дней'
  else if (mod10 === 1) suffix = 'день'
  else if (mod10 >= 2 && mod10 <= 4) suffix = 'дня'
  else suffix = 'дней'
  return days > 0 ? `Через ${abs} ${suffix}` : `${abs} ${suffix} назад`
}

/** "12 апр." compact form. */
export function formatDateCompact(input: string): string {
  const d = parseDate(input)
  if (!d) return input
  return `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]}`
}

/**
 * "только что" / "5 мин назад" / "сегодня в 14:23" / "вчера в 09:10" /
 * "12 мая в 10:15" — reassurance line for the «Сохранено» indicator.
 */
export function formatRelativeSaved(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000))
  if (diffSec < 60) return 'только что'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    const mod10 = diffMin % 10
    const mod100 = diffMin % 100
    let suffix: string
    if (mod100 >= 11 && mod100 <= 14) suffix = 'минут'
    else if (mod10 === 1) suffix = 'минуту'
    else if (mod10 >= 2 && mod10 <= 4) suffix = 'минуты'
    else suffix = 'минут'
    return `${diffMin} ${suffix} назад`
  }
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}`
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days === 0) return `сегодня в ${time}`
  if (days === 1) return `вчера в ${time}`
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} в ${time}`
}

/** "12 апреля, 14:42" — date + time. */
export function formatDateTime(input: string): string {
  const d = parseDate(input)
  if (!d) return input
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}, ${hh}:${mm}`
}

/**
 * "54 года" — Russian age with correct pluralization.
 * 1 год · 2–4 года · 5–20 лет · 21 год · 22–24 года · 25 лет · …
 */
export function formatAge(dob: string, today: Date = new Date()): string {
  const d = parseDate(dob)
  if (!d) return ''
  let years = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) years--
  if (years < 0) return ''
  const mod10 = years % 10
  const mod100 = years % 100
  let suffix: string
  if (mod100 >= 11 && mod100 <= 14) suffix = 'лет'
  else if (mod10 === 1) suffix = 'год'
  else if (mod10 >= 2 && mod10 <= 4) suffix = 'года'
  else suffix = 'лет'
  return `${years} ${suffix}`
}

/**
 * Mask a full Russian name to first-initial + last name for admin views,
 * e.g. «Иванова Мария Сергеевна» → «М. Иванова». Admin surfaces never show
 * full patient identifiers (CLAUDE.md admin guardrail). The clinic stores
 * names as «Фамилия Имя Отчество», so the surname is the first token and the
 * given name supplies the initial.
 */
export function maskName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const [surname, given] = parts
  return `${given.charAt(0).toUpperCase()}. ${surname}`
}

/**
 * Given name from a «Фамилия Имя Отчество» full name (surname-first — the clinic
 * convention used across patient, doctor, and admin surfaces), e.g.
 * «Иванова Мария Сергеевна» → «Мария». Falls back to the single token for
 * one-word names. Used for the patient greeting, which needs the first name,
 * not the surname that `split(' ')[0]` would yield on a surname-first name.
 */
export function firstNameFromFull(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return parts.length >= 2 ? parts[1] : parts[0]
}

/**
 * Russian plural form picker.
 * `forms` = [«1 объект», «2-4 объекта», «5+ объектов»]:
 * `pluralRu(1, ['анализ', 'анализа', 'анализов'])` → «анализ»
 * `pluralRu(3, [...])` → «анализа»
 * `pluralRu(7, [...])` → «анализов»
 */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}
