import type { Analysis, AnalysisType, PlanItem } from '../store/types'

const FRESHNESS_DAYS: Record<AnalysisType, number> = {
  HbA1c: 180,
  glucose: 30,
  creatinine: 365,
  cholesterol: 365,
  other: 365,
}

function daysBetween(iso: string, now: number): number | null {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)))
}

/**
 * Returns the most recent analysis whose type matches the plan item and whose
 * date is within the freshness window for that type. Used to suggest reusing
 * an existing result instead of re-uploading.
 */
export function findMatchingAnalysis(
  item: PlanItem,
  analyses: Analysis[],
  now: Date = new Date(),
): Analysis | null {
  if (item.status !== 'assigned') return null
  const window = FRESHNESS_DAYS[item.analysisType] ?? 365
  const cutoff = now.getTime() - window * 24 * 60 * 60 * 1000
  const matches = analyses
    .filter((a) => a.type === item.analysisType)
    .filter((a) => {
      const ref = a.date || a.uploadedAt
      const t = new Date(ref).getTime()
      return !Number.isNaN(t) && t >= cutoff
    })
    .sort((a, b) => {
      const da = new Date(a.date || a.uploadedAt).getTime()
      const db = new Date(b.date || b.uploadedAt).getTime()
      return db - da
    })
  return matches[0] ?? null
}

export type Freshness = 'fresh' | 'aging' | 'stale'

/**
 * Coarse freshness signal for an existing analysis given its type. Drives a
 * subtle chip on history rows so the patient can tell at a glance whether a
 * value is likely still useful for the visit.
 */
export function freshnessFor(
  analysis: Analysis,
  now: Date = new Date(),
): Freshness {
  const window = FRESHNESS_DAYS[analysis.type] ?? 365
  const ref = analysis.date || analysis.uploadedAt
  const age = daysBetween(ref, now.getTime())
  if (age == null) return 'fresh'
  if (age <= window * 0.75) return 'fresh'
  if (age <= window) return 'aging'
  return 'stale'
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'Свежий',
  aging: 'Устаревает',
  stale: 'Устарел',
}
