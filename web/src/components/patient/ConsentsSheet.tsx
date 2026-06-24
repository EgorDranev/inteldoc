import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, FileText } from 'lucide-react'
import BottomSheet from '../primitives/BottomSheet'
import ConsentReaderSheet from './ConsentReaderSheet'
import { CONSENT_BLOCKS, type ConsentSpec } from '../../lib/consent-text'
import { useInteldoc } from '../../store/store'
import { reSignConsent, withdrawConsent } from '../../store/actions'
import { formatDateShort } from '../../lib/formatters'
import type { ConsentId, ConsentRecord } from '../../store/types'

interface ConsentsSheetProps {
  open: boolean
  onClose: () => void
}

interface Row {
  spec: ConsentSpec
  record?: ConsentRecord
  status: 'active' | 'outdated' | 'withdrawn' | 'declined' | 'missing'
}

function statusToChip(status: Row['status']): {
  label: string
  tone: 'ok' | 'warn' | 'danger' | 'neutral'
} {
  switch (status) {
    case 'active':
      return { label: 'Действует', tone: 'ok' }
    case 'outdated':
      return { label: 'Новая версия', tone: 'warn' }
    case 'withdrawn':
      return { label: 'Отозвано', tone: 'danger' }
    case 'declined':
      return { label: 'Не подписано', tone: 'neutral' }
    case 'missing':
      return { label: 'Нет данных', tone: 'neutral' }
  }
}

const TONE: Record<'ok' | 'warn' | 'danger' | 'neutral', string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  neutral: 'bg-slate-100 text-ink-muted',
}

export default function ConsentsSheet({ open, onClose }: ConsentsSheetProps) {
  const [activeConsentId, setActiveConsentId] = useState<ConsentId | null>(null)

  const bundle = useInteldoc((s) =>
    s.consentBundles.find((b) => b.userId === s.currentPatientId),
  )

  const rows: Row[] = useMemo(() => {
    return CONSENT_BLOCKS.map((spec) => {
      const record = bundle?.consents.find((c) => c.id === spec.id)
      let status: Row['status']
      if (!record) status = 'missing'
      else if (record.withdrawnAt) status = 'withdrawn'
      else if (!record.accepted) status = 'declined'
      else if (record.version !== spec.version) status = 'outdated'
      else status = 'active'
      return { spec, record, status }
    })
  }, [bundle])

  const activeSpec = activeConsentId
    ? CONSENT_BLOCKS.find((s) => s.id === activeConsentId) ?? null
    : null
  const activeRecord = activeConsentId
    ? bundle?.consents.find((c) => c.id === activeConsentId)
    : undefined

  function handleWithdraw() {
    if (!activeConsentId) return
    withdrawConsent(activeConsentId)
    setActiveConsentId(null)
  }

  function handleReSign() {
    if (!activeSpec) return
    reSignConsent(activeSpec.id, activeSpec.version)
    setActiveConsentId(null)
  }

  return (
    <>
      <BottomSheet open={open && !activeConsentId} onClose={onClose} title="Согласия и документы">
        <p className="text-caption text-ink-muted leading-relaxed">
          Что и когда вы подписывали. Можно перечитать, переподписать обновлённую
          версию или отозвать согласие.
        </p>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {rows.map(({ spec, record, status }) => {
            const chip = statusToChip(status)
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => setActiveConsentId(spec.id)}
                className="text-left rounded-2xl bg-surface-sunken p-4 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white text-cyan-500 flex items-center justify-center flex-shrink-0">
                    <FileText size={18} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-ink-strong leading-tight">
                      {spec.title}
                    </p>
                    <p className="text-caption text-ink-muted mt-1 leading-snug">
                      {record
                        ? `Версия ${record.version}${
                            record.withdrawnAt
                              ? ` · отозвано ${formatDateShort(record.withdrawnAt)}`
                              : record.reSignedAt
                              ? ` · переподписано ${formatDateShort(record.reSignedAt)}`
                              : ` · подписано ${formatDateShort(
                                  bundle?.capturedAt ?? '',
                                )}`
                          }`
                        : 'Не подписано'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[chip.tone]}`}
                      >
                        {chip.tone === 'warn' && (
                          <AlertTriangle size={11} strokeWidth={2.4} />
                        )}
                        {chip.label}
                      </span>
                      {status === 'outdated' && (
                        <span className="text-[11px] text-ink-muted">
                          → {spec.version}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 mt-1.5" />
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-[11px] text-ink-muted leading-relaxed text-center px-2">
          Тексты согласий — юридические документы. Их редакция фиксирует
          версия и дата подписания.
        </p>
      </BottomSheet>

      <ConsentReaderSheet
        open={!!activeConsentId}
        spec={activeSpec}
        signedVersion={activeRecord?.version}
        withdrawn={!!activeRecord?.withdrawnAt}
        onClose={() => setActiveConsentId(null)}
        onWithdraw={
          activeRecord && !activeRecord.withdrawnAt ? handleWithdraw : undefined
        }
        onReSign={handleReSign}
      />
    </>
  )
}
