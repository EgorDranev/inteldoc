import { ChevronRight } from 'lucide-react'
import VasilyMascot from '../system/VasilyMascot'

interface QuickReply {
  /** Chip label shown to the patient. Short, sentence-case. */
  label: string
  /** Prompt sent to Vasily as if the patient typed it. */
  prompt: string
}

interface VasilyRecoCardProps {
  /** Main recommendation line — Vasily's actionable suggestion. */
  reco: string
  /** Meta line — single muted caption with time estimate and scope/progress. */
  meta?: string
  /** Primary action chip — answers "where do I start". */
  primary?: { label: string; onClick: () => void }
  /** Question chips — open the chat with the prompt pre-asked. */
  quickReplies?: QuickReply[]
  /** Called when a quick reply chip is tapped. */
  onAsk?: (prompt: string) => void
}

/**
 * Vasily delivering an actionable recommendation with optional follow-ups.
 *
 * JTBDs carried in one card:
 *  - Where to start — primary chip points at the next section.
 *  - How long / how much — meta line gives a rough time + scope estimate.
 *  - Where am I — meta also shows "N из M" so re-entry isn't blank-slate.
 *  - Why bother — "Зачем это?" quick reply opens chat with prompt pre-asked.
 *
 * Vasily voice rules (CLAUDE.md):
 *  - He speaks in his own voice on the patient surface.
 *  - He never speaks as Эндокор and never makes clinic-side commitments.
 *  - Advice only — no diagnosis / treatment / prescription language.
 */
export default function VasilyRecoCard({
  reco,
  meta,
  primary,
  quickReplies,
  onAsk,
}: VasilyRecoCardProps) {
  const hasChips = Boolean(primary) || (quickReplies && quickReplies.length > 0)
  return (
    <div className="rounded-2xl bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {/* Fixed slot for the mascot — needed because the inline-flex wrapper
            inside VasilyMascot can collapse to 0 width when the sibling text
            column is short. flex-none + explicit size locks it. 64px keeps
            Vasily present without eating coaching real estate. */}
        <div
          className="flex-none flex items-center justify-center"
          style={{ width: 108, height: 108 }}
        >
          <VasilyMascot size={108} />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <p className="text-[15px] font-bold text-ink-strong leading-snug">
            {reco}
          </p>
          {meta && (
            <p className="text-caption text-ink-muted leading-snug">{meta}</p>
          )}
        </div>
      </div>
      {hasChips && (
        <div className="flex flex-wrap gap-2">
          {primary && (
            <button
              type="button"
              onClick={primary.onClick}
              className="inline-flex items-center gap-1 rounded-full bg-cyan-500 px-3.5 py-2 text-[12px] font-bold uppercase tracking-caps text-white active:bg-cyan-600"
            >
              {primary.label}
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          )}
          {quickReplies?.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => onAsk?.(q.prompt)}
              className="rounded-full bg-white px-3.5 py-2 text-[12px] font-bold uppercase tracking-caps text-cyan-600 shadow-[inset_0_0_0_1.5px_var(--blue-200)] hover:bg-cyan-50"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
