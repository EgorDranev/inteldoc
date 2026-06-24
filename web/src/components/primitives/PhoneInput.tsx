import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface PhoneCountry {
  code: string // ISO alpha-2, used as key
  flag: string
  name: string // Russian label
  dial: string // e.g. "+7", "+375"
  nationalLen: number // expected digits in the national part
  pattern: number[] // grouping for formatter, e.g. [3, 3, 2, 2]
  placeholder: string // full visual placeholder including dial code
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    code: 'RU',
    flag: '🇷🇺',
    name: 'Россия',
    dial: '+7',
    nationalLen: 10,
    pattern: [3, 3, 2, 2],
    placeholder: '+7 (___) ___-__-__',
  },
  {
    code: 'BY',
    flag: '🇧🇾',
    name: 'Беларусь',
    dial: '+375',
    nationalLen: 9,
    pattern: [2, 3, 2, 2],
    placeholder: '+375 (__) ___-__-__',
  },
  {
    code: 'KZ',
    flag: '🇰🇿',
    name: 'Казахстан',
    dial: '+7',
    nationalLen: 10,
    pattern: [3, 3, 2, 2],
    placeholder: '+7 (___) ___-__-__',
  },
  {
    code: 'AM',
    flag: '🇦🇲',
    name: 'Армения',
    dial: '+374',
    nationalLen: 8,
    pattern: [2, 3, 3],
    placeholder: '+374 __ ___ ___',
  },
  {
    code: 'AZ',
    flag: '🇦🇿',
    name: 'Азербайджан',
    dial: '+994',
    nationalLen: 9,
    pattern: [2, 3, 2, 2],
    placeholder: '+994 __ ___ __ __',
  },
  {
    code: 'KG',
    flag: '🇰🇬',
    name: 'Кыргызстан',
    dial: '+996',
    nationalLen: 9,
    pattern: [3, 3, 3],
    placeholder: '+996 ___ ___ ___',
  },
  {
    code: 'MD',
    flag: '🇲🇩',
    name: 'Молдова',
    dial: '+373',
    nationalLen: 8,
    pattern: [2, 3, 3],
    placeholder: '+373 __ ___ ___',
  },
  {
    code: 'TJ',
    flag: '🇹🇯',
    name: 'Таджикистан',
    dial: '+992',
    nationalLen: 9,
    pattern: [2, 3, 2, 2],
    placeholder: '+992 __ ___ __ __',
  },
  {
    code: 'TM',
    flag: '🇹🇲',
    name: 'Туркменистан',
    dial: '+993',
    nationalLen: 8,
    pattern: [2, 2, 2, 2],
    placeholder: '+993 __ __-__-__',
  },
  {
    code: 'UZ',
    flag: '🇺🇿',
    name: 'Узбекистан',
    dial: '+998',
    nationalLen: 9,
    pattern: [2, 3, 2, 2],
    placeholder: '+998 __ ___ __ __',
  },
]

export const DEFAULT_COUNTRY: PhoneCountry = PHONE_COUNTRIES[0]

// Format a digits-only national string according to a country's pattern.
// e.g. RU pattern [3,3,2,2] + "9161234567" → "(916) 123-45-67"
export function formatNational(country: PhoneCountry, digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, country.nationalLen)
  if (!d) return ''
  const groups: string[] = []
  let i = 0
  for (const size of country.pattern) {
    if (i >= d.length) break
    groups.push(d.slice(i, i + size))
    i += size
  }
  // RU/KZ/BY use bracketed first group; others use spaces.
  const useBrackets = country.code === 'RU' || country.code === 'KZ' || country.code === 'BY'
  if (useBrackets) {
    const [first, ...rest] = groups
    if (rest.length === 0) return `(${first}`
    return `(${first}) ${rest.join('-')}`
  }
  return groups.join(' ')
}

// Build the canonical stored value: "+7 (916) 123-45-67" or "+374 99 123 456".
export function buildFullValue(country: PhoneCountry, digits: string): string {
  const national = formatNational(country, digits)
  if (!national) return ''
  return `${country.dial} ${national}`
}

// Extract a digits-only national string from any stored value, given the country.
export function parseNational(country: PhoneCountry, value: string): string {
  if (!value) return ''
  // Strip the dial code from the front and keep digits.
  const dialDigits = country.dial.replace(/\D/g, '')
  const allDigits = value.replace(/\D/g, '')
  const trimmed = allDigits.startsWith(dialDigits)
    ? allDigits.slice(dialDigits.length)
    : allDigits
  return trimmed.slice(0, country.nationalLen)
}

interface PhoneInputProps {
  label?: string
  helper?: ReactNode
  required?: boolean
  error?: string
  value: string
  country: PhoneCountry
  onCountryChange: (c: PhoneCountry) => void
  onValueChange: (full: string) => void
  onBlur?: () => void
}

export default function PhoneInput({
  label,
  helper,
  required,
  error,
  value,
  country,
  onCountryChange,
  onValueChange,
  onBlur,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const national = parseNational(country, value)
  const formatted = formatNational(country, national)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function selectCountry(c: PhoneCountry) {
    setOpen(false)
    if (c.code === country.code) return
    onCountryChange(c)
    // Re-format the existing national digits under the new country's rules.
    const next = buildFullValue(c, national)
    onValueChange(next)
  }

  function handleNationalChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, country.nationalLen)
    onValueChange(buildFullValue(country, digits))
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-micro font-bold uppercase tracking-caps text-ink-muted">
          {label}
          {required && <span className="text-rose-600 ml-1">*</span>}
        </span>
      )}

      <div
        ref={wrapperRef}
        className={`relative flex items-stretch w-full h-12 rounded-xl bg-white overflow-visible transition-shadow duration-200 ease-out shadow-[inset_0_0_0_1.5px_var(--slate-200)] focus-within:shadow-[inset_0_0_0_1.5px_var(--blue-600)] ${
          error ? 'shadow-[inset_0_0_0_1.5px_var(--error)]' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Код страны: ${country.name}, ${country.dial}`}
          className="flex items-center gap-1.5 pl-3 pr-2 text-body-lg text-ink-strong hover:bg-slate-50 rounded-l-xl transition-colors"
        >
          <span className="text-base leading-none" aria-hidden>
            {country.flag}
          </span>
          <span className="font-medium tabular-nums">{country.dial}</span>
          <ChevronDown size={14} className="text-ink-muted" aria-hidden />
        </button>

        <span className="w-px self-stretch bg-slate-200 my-2" aria-hidden />

        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={country.placeholder.replace(`${country.dial} `, '')}
          value={formatted}
          onChange={(e) => handleNationalChange(e.target.value)}
          onBlur={onBlur}
          className="flex-1 min-w-0 bg-transparent px-3 text-body-lg text-ink-strong placeholder:text-ink-subtle outline-none rounded-r-xl"
        />

        {open && (
          <ul
            role="listbox"
            aria-label="Выберите страну"
            className="absolute left-0 top-[calc(100%+6px)] z-20 w-[calc(100%+0px)] max-h-72 overflow-y-auto bg-white rounded-xl shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18),0_0_0_1px_var(--slate-200)] py-1"
          >
            {PHONE_COUNTRIES.map((c) => {
              const active = c.code === country.code
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => selectCountry(c)}
                    role="option"
                    aria-selected={active}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-body-md hover:bg-cyan-50 transition-colors ${
                      active ? 'bg-cyan-50/60' : ''
                    }`}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {c.flag}
                    </span>
                    <span className="flex-1 text-ink-strong">{c.name}</span>
                    <span className="text-ink-muted tabular-nums">{c.dial}</span>
                    {active && (
                      <Check size={14} className="text-cyan-600" aria-hidden />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {helper && !error && (
        <span className="text-caption text-ink-muted leading-snug">{helper}</span>
      )}
      {error && (
        <span className="text-caption text-rose-600 leading-snug">{error}</span>
      )}
    </div>
  )
}
