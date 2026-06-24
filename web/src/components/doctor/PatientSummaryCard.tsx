import Avatar from '../primitives/Avatar'
import { formatAge, formatDateShort } from '../../lib/formatters'
import type { Patient } from '../../store/types'
import type { PrepMeta } from '../../store/doctorSelectors'

/**
 * Left-rail summary card on the doctor patient record.
 *
 * Owns patient identity end-to-end: name, age, ОМС, phone, diagnosis with
 * confirmation state, and a last-update marker so the doctor can gauge how
 * fresh the upstream prep data is. The top header carries visit context
 * (date, gaps, request state) and CTA — identity is intentionally absent
 * from there to avoid the two blocks restating each other.
 */
export default function PatientSummaryCard({
  patient,
  prep,
}: {
  patient: Patient
  prep: PrepMeta
}) {
  const age = formatAge(patient.dob)
  return (
    <aside className="flex flex-col gap-4 overflow-y-auto pr-1">
      <div className="rounded-2xl bg-surface p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={patient.name} size={56} />
          <div className="min-w-0">
            <p className="text-body-lg font-bold text-ink-strong leading-tight">
              {patient.name}
            </p>
            <p className="text-caption text-ink-muted mt-0.5">
              {age && <>{age} · </>}
              <span className="font-data">{patient.dob}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-caption">
          <Row k="ОМС" v={patient.identifiers.oms ?? '—'} mono />
          <Row k="Телефон" v={patient.phone} mono />
          {patient.diagnosis && (
            <DiagnosisRow
              label={patient.diagnosis.label}
              confirmed={patient.diagnosis.confirmed}
            />
          )}
          {prep.preparedAt && (
            <Row
              k="Последнее изменение"
              v={formatDateShort(prep.preparedAt)}
              mono
            />
          )}
        </div>
      </div>
    </aside>
  )
}

function Row({
  k,
  v,
  mono,
}: {
  k: string
  v: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{k}</span>
      <span
        className={`text-ink-strong font-bold text-right ${
          mono ? 'font-data' : ''
        }`}
      >
        {v}
      </span>
    </div>
  )
}

function DiagnosisRow({
  label,
  confirmed,
}: {
  label: string
  confirmed: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-muted pt-0.5">Диагноз</span>
      <div className="flex flex-col items-end gap-1 min-w-0">
        <span className="text-ink-strong font-bold text-right">{label}</span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-caps ${
            confirmed
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          {confirmed ? 'Подтверждён' : 'Не подтверждён'}
        </span>
      </div>
    </div>
  )
}
