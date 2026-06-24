import { useEffect, useState } from 'react'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'
import Input from '../primitives/Input'
import type { Gender, Patient } from '../../store/types'
import { updatePatientIdentity } from '../../store/actions'

interface EditIdentitySheetProps {
  open: boolean
  patient: Patient
  onClose: () => void
}

const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: 'female', label: 'Женский' },
  { value: 'male', label: 'Мужской' },
]

function formatDobInput(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8)
  if (digits.length >= 5) return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
  if (digits.length >= 3) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return digits
}

function toDotted(v: string): string {
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : v
}

export default function EditIdentitySheet({
  open,
  patient,
  onClose,
}: EditIdentitySheetProps) {
  const [name, setName] = useState(patient.name)
  const [dob, setDob] = useState(toDotted(patient.dob))
  const [gender, setGender] = useState<Gender>(patient.gender)
  const [oms, setOms] = useState(patient.identifiers.oms ?? '')

  useEffect(() => {
    if (!open) return
    setName(patient.name)
    setDob(toDotted(patient.dob))
    setGender(patient.gender)
    setOms(patient.identifiers.oms ?? '')
  }, [open, patient])

  const dirty =
    name.trim() !== patient.name ||
    dob !== toDotted(patient.dob) ||
    gender !== patient.gender ||
    oms.trim() !== (patient.identifiers.oms ?? '')

  function save() {
    updatePatientIdentity({
      name: name.trim(),
      dob,
      gender,
      oms: oms.trim(),
    })
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Личные данные">
      <p className="text-caption text-ink-muted leading-relaxed">
        Эти данные передаются в Эндокор. После изменений клинике потребуется
        подтвердить совпадение.
      </p>

      <div className="flex flex-col gap-3">
        <Input
          label="ФИО"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Дата рождения"
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="дд.мм.гггг"
          maxLength={10}
          value={dob}
          onChange={(e) => setDob(formatDobInput(e.target.value))}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-caps text-ink-muted">
            Пол
          </span>
          <div className="grid grid-cols-2 gap-2">
            {GENDER_OPTIONS.map((opt) => {
              const active = gender === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGender(opt.value)}
                  className={`rounded-xl py-3 text-body font-bold transition-all ${
                    active
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white text-ink-strong shadow-[inset_0_0_0_1.5px_var(--slate-200)]'
                  }`}
                  aria-pressed={active}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <Input
          label="Полис ОМС"
          inputMode="numeric"
          value={oms}
          onChange={(e) => setOms(e.target.value)}
          helper="16 цифр. Используется только для сопоставления с картой в Эндокор."
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="primary" full onClick={save} disabled={!dirty}>
          Сохранить
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          Отменить
        </Button>
      </div>
    </BottomSheet>
  )
}
