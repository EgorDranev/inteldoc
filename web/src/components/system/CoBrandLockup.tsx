import { useInteldoc } from '../../store/store'
import { useActivePatient } from '../../store/hooks'

type Size = 'sm' | 'md' | 'lg'
type Variant = 'pill' | 'plain'

interface CoBrandLockupProps {
  /**
   * Visual treatment.
   * - `pill`  — both brands in soft rounded pills, used in onboarding chrome and
   *   anywhere the lockup needs to feel like a standalone block.
   * - `plain` — flush text with brand marks, used inside dense headers and
   *   sidebar shells where extra chrome would feel heavy.
   */
  variant?: Variant
  /** Dark surface variant — adjusts contrast for navy backgrounds. */
  dark?: boolean
  size?: Size
  /** Override partner short name (defaults to active patient's partner clinic). */
  partnerShortName?: string | null
}

/**
 * Shared IntelDoc × Partner co-branding lockup.
 *
 * Used across all three surfaces (patient mobile, doctor desktop sidebar,
 * admin desktop sidebar) so the partner-first brand signal is identical
 * everywhere — the same pattern introduced on the Vasily onboarding screen.
 */
export default function CoBrandLockup({
  variant = 'pill',
  dark = false,
  size = 'md',
  partnerShortName,
}: CoBrandLockupProps) {
  const patient = useActivePatient()
  const fallbackPartner = useInteldoc((s) => {
    const id = patient?.partnerClinic
    if (id) {
      const fromPatient = s.clinics.find((c) => c.id === id)?.shortName
      if (fromPatient) return fromPatient
    }
    return s.clinics[0]?.shortName ?? null
  })
  const partner = partnerShortName ?? fallbackPartner ?? 'Эндокор'

  const dims = {
    sm: { mark: 'h-5 w-5', markText: 'text-[10px]', label: 'text-[12px]', gap: 'gap-1.5', cross: 'text-[12px]', pad: 'px-2 py-0.5' },
    md: { mark: 'h-6 w-6', markText: 'text-[11px]', label: 'text-[13px]', gap: 'gap-2', cross: 'text-[12px]', pad: 'px-2.5 py-1' },
    lg: { mark: 'h-7 w-7', markText: 'text-[12px]', label: 'text-[14px]', gap: 'gap-2.5', cross: 'text-[13px]', pad: 'px-3 py-1.5' },
  }[size]

  const partnerPill = dark ? 'bg-white/10 text-white' : 'bg-cyan-50 text-cyan-700'
  const intelPill = dark ? 'bg-white/10 text-white' : 'bg-slate-100 text-ink-strong'
  const intelMark = dark ? 'bg-cyan-400 text-navy-900' : 'bg-navy-900 text-white'
  const crossColor = dark ? 'text-slate-400' : 'text-ink-muted'
  const plainLabel = dark ? 'text-white' : 'text-ink-strong'
  const plainCross = dark ? 'text-slate-400' : 'text-ink-muted'

  if (variant === 'plain') {
    return (
      <div className={`inline-flex items-center min-w-0 ${dims.gap}`}>
        <span
          className={`inline-flex ${dims.mark} items-center justify-center rounded-full bg-cyan-500 text-white ${dims.markText} font-extrabold flex-shrink-0`}
          aria-hidden
        >
          {partner.slice(0, 1)}
        </span>
        <span className={`${dims.label} font-bold tracking-ui ${plainLabel} truncate`}>
          {partner}
        </span>
        <span className={`${dims.cross} font-bold ${plainCross}`} aria-hidden>
          ×
        </span>
        <span
          className={`inline-flex ${dims.mark} items-center justify-center rounded-md ${intelMark} ${dims.markText} font-extrabold tracking-tight flex-shrink-0`}
          aria-hidden
        >
          iD
        </span>
        <span className={`${dims.label} font-bold tracking-ui ${plainLabel} truncate`}>
          IntelDoc
        </span>
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center min-w-0 ${dims.gap}`}>
      <div className={`inline-flex items-center gap-1.5 rounded-full ${dims.pad} ${partnerPill}`}>
        <span
          className={`inline-flex ${dims.mark} items-center justify-center rounded-full bg-cyan-500 text-white ${dims.markText} font-extrabold`}
          aria-hidden
        >
          {partner.slice(0, 1)}
        </span>
        <span className={`${dims.label} font-bold tracking-ui`}>{partner}</span>
      </div>
      <span className={`${dims.cross} font-bold ${crossColor}`} aria-hidden>
        ×
      </span>
      <div className={`inline-flex items-center gap-1.5 rounded-full ${dims.pad} ${intelPill}`}>
        <span
          className={`inline-flex ${dims.mark} items-center justify-center rounded-md ${intelMark} ${dims.markText} font-extrabold tracking-tight`}
          aria-hidden
        >
          iD
        </span>
        <span className={`${dims.label} font-bold tracking-ui`}>IntelDoc</span>
      </div>
    </div>
  )
}
