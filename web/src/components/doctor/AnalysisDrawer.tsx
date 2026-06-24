import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  FileText,
  Link2,
  RotateCcw,
  Send,
  ShieldOff,
  X,
} from 'lucide-react'
import Button from '../primitives/Button'
import StatusBadge from '../primitives/StatusBadge'
import AccessLogFootnote from './AccessLogFootnote'
import { LowConfidenceDot } from './MetricCard'
import {
  rejectAnalysisAsWrongUpload,
  requestAnalysisResend,
  verifyOcrField,
} from '../../store/actions'
import { formatDateShort, formatDateTime } from '../../lib/formatters'
import type {
  Analysis,
  AnalysisRejectionReason,
  AnalysisResendReason,
  PlanItem,
} from '../../store/types'

/**
 * Doctor's verification drawer.
 *
 * Surfaces five JTBDs in one place:
 *  1. Verify one OCR value against the source (per-field Подтвердить / Ошибка OCR).
 *  2. Read the original alongside the structured fields — source control,
 *     not just OCR control.
 *  3. Reject the whole upload as not belonging to this record («не тот
 *     анализ»). Distinct from a per-field OCR-error verdict.
 *  4. Audit stamp — every verdict shows verifier name + timestamp inline.
 *  5. Resend request — third path when the doctor can't act either way
 *     because the source itself is unusable.
 */
export default function AnalysisDrawer({
  analysis,
  linkedPlanItem,
  onClose,
}: {
  analysis: Analysis
  linkedPlanItem?: PlanItem | null
  onClose: () => void
}) {
  const isAssignedSource = !!linkedPlanItem
  const [secondaryAction, setSecondaryAction] = useState<
    null | 'reject' | 'resend'
  >(null)

  const isRejected = analysis.status === 'rejected'
  const isResendRequested = analysis.status === 'resend_requested'
  const isFinalState = isRejected || isResendRequested

  return (
    <div
      className="fixed inset-0 z-40 bg-black/30 flex justify-end"
      onClick={onClose}
      role="dialog"
      aria-label={`Анализ — ${analysis.label}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] bg-white h-full overflow-y-auto p-6 flex flex-col gap-5 shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-micro font-bold uppercase tracking-caps text-cyan-500 mb-1">
              {isAssignedSource ? 'Назначенный анализ' : 'Анализ'}
            </p>
            <h2 className="text-h2-ui font-bold text-ink-strong leading-tight">
              {analysis.label}
            </h2>
            <p className="text-caption text-ink-muted mt-1 font-data">
              {analysis.date ? formatDateShort(analysis.date) : 'без даты'}
              {' · загружено '}
              {formatDateTime(analysis.uploadedAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="h-8 w-8 flex items-center justify-center rounded-full text-ink-muted hover:bg-slate-100"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {linkedPlanItem && (
          <div className="rounded-2xl bg-cyan-50 p-4 flex items-start gap-3">
            <Link2 size={16} className="text-cyan-500 mt-0.5" strokeWidth={2.4} />
            <div className="min-w-0">
              <p className="text-micro font-bold uppercase tracking-caps text-cyan-600 mb-0.5">
                Привязан к плану
              </p>
              <p className="text-body text-ink-strong font-bold leading-tight">
                {linkedPlanItem.label}
              </p>
              {linkedPlanItem.reason && (
                <p className="text-caption text-ink mt-1 leading-snug">
                  {linkedPlanItem.reason}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-micro font-bold uppercase tracking-caps text-ink-muted mb-1.5">
              Оригинал
            </p>
            <div className="rounded-xl bg-surface-sunken p-4 h-52 flex flex-col items-center justify-center gap-2">
              <FileText size={36} className="text-cyan-500" strokeWidth={1.5} />
              <p className="text-caption text-ink-muted text-center px-2">
                {analysis.originalFileUrl
                  ? 'Файл загружен пациентом'
                  : 'Превью недоступно (демо)'}
              </p>
            </div>
            <div className="mt-2">
              <StatusBadge tone={analysis.qualityCheck === 'clear' ? 'success' : 'warning'}>
                {analysis.qualityCheck === 'clear'
                  ? 'Качество скана: пригодно'
                  : 'Качество скана: пограничное'}
              </StatusBadge>
            </div>
          </div>
          <div>
            <p className="text-micro font-bold uppercase tracking-caps text-ink-muted mb-1.5">
              Распознанные значения
            </p>
            <ul className="rounded-xl bg-surface-sunken p-3 flex flex-col gap-2.5">
              {Object.entries(analysis.ocrFields).map(([k, v]) => {
                const meta = analysis.ocrFieldMeta?.[k]
                return (
                  <li
                    key={k}
                    className="rounded-lg bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--slate-100)]"
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
                        {k}
                      </p>
                      {meta?.lowConfidence && !meta?.verification && (
                        <LowConfidenceDot inline />
                      )}
                    </div>
                    <p
                      className={`text-body-lg font-bold font-data leading-tight ${
                        meta?.verification?.decision === 'rejected'
                          ? 'text-ink-muted line-through'
                          : 'text-ink-strong'
                      }`}
                    >
                      {v}
                    </p>
                    {meta?.ref && (
                      <p className="text-caption text-ink-muted font-data leading-snug mt-0.5">
                        референс · {meta.ref}
                      </p>
                    )}
                    {meta?.lowConfidence && !isFinalState && (
                      <FieldVerificationFooter
                        analysisId={analysis.id}
                        field={k}
                        meta={meta}
                      />
                    )}
                    {meta?.verification && (
                      <FieldAuditStamp verification={meta.verification} />
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="text-caption text-ink-muted mt-2 leading-snug">
              Структурированные значения дополняют оригинал, не заменяя его.
            </p>
          </div>
        </div>

        <AnalysisStatusFooter analysis={analysis} />

        {!isFinalState && (
          <div className="rounded-2xl bg-surface-sunken p-4 flex flex-col gap-3">
            <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
              Альтернативные действия
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="md"
                icon={<RotateCcw size={14} strokeWidth={2.4} />}
                onClick={() =>
                  setSecondaryAction((s) => (s === 'resend' ? null : 'resend'))
                }
              >
                Запросить переотправку
              </Button>
              <Button
                variant="ghost"
                size="md"
                icon={<ShieldOff size={14} strokeWidth={2.4} />}
                onClick={() =>
                  setSecondaryAction((s) => (s === 'reject' ? null : 'reject'))
                }
              >
                Не тот анализ
              </Button>
            </div>
            {secondaryAction === 'resend' && (
              <ResendReasonPicker
                onCancel={() => setSecondaryAction(null)}
                onSubmit={(reason) => {
                  requestAnalysisResend(analysis.id, reason)
                  setSecondaryAction(null)
                  onClose()
                }}
              />
            )}
            {secondaryAction === 'reject' && (
              <RejectReasonPicker
                onCancel={() => setSecondaryAction(null)}
                onSubmit={(reason) => {
                  rejectAnalysisAsWrongUpload(analysis.id, reason)
                  setSecondaryAction(null)
                  onClose()
                }}
              />
            )}
          </div>
        )}

        <AccessLogFootnote />
      </div>
    </div>
  )
}

// ─── Per-field verification: inline action row + audit stamp ────────────────

function FieldVerificationFooter({
  analysisId,
  field,
  meta,
}: {
  analysisId: string
  field: string
  meta: NonNullable<Analysis['ocrFieldMeta']>[string]
}) {
  if (meta.verification) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => verifyOcrField(analysisId, field, 'confirmed')}
        className="inline-flex items-center gap-1 rounded-full bg-cyan-500 px-2.5 py-1 text-micro font-bold text-white hover:bg-cyan-600 transition-colors"
      >
        <Check size={11} strokeWidth={2.8} />
        Подтвердить значение
      </button>
      <button
        type="button"
        onClick={() => verifyOcrField(analysisId, field, 'rejected')}
        className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-micro font-bold text-amber-800 shadow-[inset_0_0_0_1px_var(--amber-300,#fcd34d)] hover:bg-amber-50 transition-colors"
      >
        <AlertTriangle size={11} strokeWidth={2.6} />
        Ошибка OCR
      </button>
    </div>
  )
}

function FieldAuditStamp({
  verification,
}: {
  verification: NonNullable<
    NonNullable<Analysis['ocrFieldMeta']>[string]['verification']
  >
}) {
  const confirmed = verification.decision === 'confirmed'
  return (
    <p
      className={`mt-2 inline-flex items-center gap-1 text-micro font-bold rounded-full px-2 py-0.5 ${
        confirmed
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-800'
      }`}
    >
      {confirmed ? (
        <Check size={10} strokeWidth={2.8} />
      ) : (
        <AlertTriangle size={10} strokeWidth={2.6} />
      )}
      {confirmed ? 'Подтверждено' : 'Отмечено как ошибка OCR'} ·{' '}
      <span className="font-normal">
        {verification.verifiedBy} · {formatDateTime(verification.verifiedAt)}
      </span>
    </p>
  )
}

// ─── Analysis-level status summary ──────────────────────────────────────────

function AnalysisStatusFooter({ analysis }: { analysis: Analysis }) {
  if (analysis.status === 'acknowledged') {
    // Summary copy must match the per-field verdicts: a reading flagged as an
    // OCR error is struck through and excluded from the visit record, so it is
    // not «доступно для использования». Tailor the body to the confirm/reject
    // mix rather than always claiming all values are usable.
    const verified = Object.values(analysis.ocrFieldMeta ?? {}).filter(
      (m) => m?.verification,
    )
    const rejected = verified.filter(
      (m) => m?.verification?.decision === 'rejected',
    ).length
    const confirmed = verified.length - rejected
    const body =
      rejected === 0
        ? 'Все значения сверены с оригиналом. Доступно для использования в записи приёма.'
        : confirmed === 0
          ? 'Значения отмечены как ошибка OCR и исключены из записи приёма.'
          : 'Подтверждённые значения доступны в записи приёма. Отмеченные как ошибка OCR — исключены.'
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-3 flex items-start gap-2">
        <Check size={14} strokeWidth={2.6} className="text-emerald-700 mt-0.5" />
        <div className="min-w-0">
          <p className="text-body font-bold text-emerald-900 leading-tight">
            Результат верифицирован
          </p>
          <p className="text-caption text-emerald-800/80 leading-snug mt-0.5">
            {body}
          </p>
        </div>
      </div>
    )
  }
  if (analysis.status === 'rejected' && analysis.rejection) {
    return (
      <div className="rounded-xl bg-rose-50 px-4 py-3 flex items-start gap-2">
        <ShieldOff size={14} strokeWidth={2.4} className="text-rose-700 mt-0.5" />
        <div className="min-w-0">
          <p className="text-body font-bold text-rose-900 leading-tight">
            Отклонено: {REJECTION_REASON_LABEL[analysis.rejection.reason]}
          </p>
          <p className="text-caption text-rose-800/80 leading-snug mt-0.5">
            {analysis.rejection.rejectedBy} ·{' '}
            {formatDateTime(analysis.rejection.rejectedAt)}
          </p>
        </div>
      </div>
    )
  }
  if (analysis.status === 'resend_requested' && analysis.resendRequest) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 flex items-start gap-2">
        <Send size={14} strokeWidth={2.4} className="text-amber-700 mt-0.5" />
        <div className="min-w-0">
          <p className="text-body font-bold text-amber-900 leading-tight">
            Ожидаем переотправку: {RESEND_REASON_LABEL[analysis.resendRequest.reason]}
          </p>
          <p className="text-caption text-amber-800/80 leading-snug mt-0.5">
            {analysis.resendRequest.requestedBy} ·{' '}
            {formatDateTime(analysis.resendRequest.requestedAt)}
          </p>
        </div>
      </div>
    )
  }
  // Default — `uploaded` status
  return (
    <div className="rounded-xl bg-surface-sunken px-4 py-3">
      <p className="text-micro font-bold uppercase tracking-caps text-ink-muted mb-1">
        Статус
      </p>
      <p className="text-body text-ink-strong font-bold">
        Ожидает верификации
      </p>
    </div>
  )
}

// ─── Reason pickers — inline expanders, no nested modals ─────────────────────

const REJECTION_REASON_LABEL: Record<AnalysisRejectionReason, string> = {
  not_my_clinic: 'результат сторонней лаборатории или клиники',
  wrong_patient: 'не тот пациент',
  wrong_panel: 'не та панель или тип исследования',
  duplicate: 'дубликат уже принятого результата',
  other: 'другая причина',
}

const REJECTION_REASON_ORDER: AnalysisRejectionReason[] = [
  'wrong_patient',
  'not_my_clinic',
  'wrong_panel',
  'duplicate',
  'other',
]

function RejectReasonPicker({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (reason: AnalysisRejectionReason) => void
}) {
  const [reason, setReason] = useState<AnalysisRejectionReason | null>(null)
  return (
    <div className="rounded-xl bg-white p-3 shadow-[inset_0_0_0_1px_var(--slate-200)] flex flex-col gap-2">
      <p className="text-caption font-bold text-ink-strong">
        Причина отклонения результата
      </p>
      <ul className="flex flex-col gap-1">
        {REJECTION_REASON_ORDER.map((r) => (
          <li key={r}>
            <button
              type="button"
              onClick={() => setReason(r)}
              className={`w-full text-left rounded-lg px-3 py-2 text-caption transition-colors ${
                reason === r
                  ? 'bg-rose-50 text-rose-900 shadow-[inset_0_0_0_1.5px_var(--rose-300,#fda4af)]'
                  : 'bg-surface-sunken text-ink hover:bg-slate-100'
              }`}
            >
              {capitalize(REJECTION_REASON_LABEL[r])}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 mt-1">
        <Button variant="ghost" size="md" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          size="md"
          icon={<ShieldOff size={13} strokeWidth={2.4} />}
          onClick={() => reason && onSubmit(reason)}
        >
          Отклонить результат
        </Button>
      </div>
    </div>
  )
}

const RESEND_REASON_LABEL: Record<AnalysisResendReason, string> = {
  poor_quality: 'снимок плохого качества',
  missing_pages: 'загружены не все страницы',
  date_unreadable: 'не читается дата исследования',
  lab_stamp_missing: 'не виден штамп лаборатории',
  other: 'другая причина',
}

const RESEND_REASON_ORDER: AnalysisResendReason[] = [
  'poor_quality',
  'missing_pages',
  'date_unreadable',
  'lab_stamp_missing',
  'other',
]

function ResendReasonPicker({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (reason: AnalysisResendReason) => void
}) {
  const [reason, setReason] = useState<AnalysisResendReason | null>(null)
  return (
    <div className="rounded-xl bg-white p-3 shadow-[inset_0_0_0_1px_var(--slate-200)] flex flex-col gap-2">
      <p className="text-caption font-bold text-ink-strong">
        Причина запроса переотправки
      </p>
      <ul className="flex flex-col gap-1">
        {RESEND_REASON_ORDER.map((r) => (
          <li key={r}>
            <button
              type="button"
              onClick={() => setReason(r)}
              className={`w-full text-left rounded-lg px-3 py-2 text-caption transition-colors ${
                reason === r
                  ? 'bg-amber-50 text-amber-900 shadow-[inset_0_0_0_1.5px_var(--amber-300,#fcd34d)]'
                  : 'bg-surface-sunken text-ink hover:bg-slate-100'
              }`}
            >
              {capitalize(RESEND_REASON_LABEL[r])}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 mt-1">
        <Button variant="ghost" size="md" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          size="md"
          icon={<Send size={13} strokeWidth={2.4} />}
          onClick={() => reason && onSubmit(reason)}
        >
          Отправить пациенту
        </Button>
      </div>
    </div>
  )
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}
