import { ShieldCheck } from 'lucide-react'
import { formatDateTime } from '../../lib/formatters'

/**
 * Subtle footer rendered inside drawers / modals that show patient
 * documents or analyses. Reinforces the access-control transparency
 * loop (CLAUDE.md guardrail #4) by making it visible from the doctor
 * side that opens count toward the patient's access log.
 *
 * The prototype does not persist a separate doctor-side log — the
 * patient surface already exposes the per-patient access journal — so
 * the timestamp shown here is the current moment of viewing.
 */
export default function AccessLogFootnote({
  viewedAt,
}: {
  viewedAt?: string
}) {
  const ts = viewedAt ?? new Date().toISOString()
  return (
    <p className="flex items-center gap-2 text-caption text-ink-muted leading-snug pt-3 border-t border-slate-100">
      <ShieldCheck size={12} strokeWidth={2} className="text-emerald-600" />
      <span>
        Просмотр зарегистрирован в журнале доступа пациента ·{' '}
        <span className="font-data">{formatDateTime(ts)}</span>
      </span>
    </p>
  )
}
