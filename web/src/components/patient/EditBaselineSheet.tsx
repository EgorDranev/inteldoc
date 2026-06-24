import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'
import Input from '../primitives/Input'
import type { Patient } from '../../store/types'
import { updatePatientBaseline } from '../../store/actions'

interface EditBaselineSheetProps {
  open: boolean
  patient: Patient
  onClose: () => void
}

function ChipList({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string
  placeholder: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (values.includes(trimmed)) {
      setDraft('')
      return
    }
    onChange([...values, trimmed])
    setDraft('')
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-caps text-ink-muted">
        {label}
      </span>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-cyan-50 text-cyan-700 pl-3 pr-1.5 py-1 text-caption font-bold"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(i)}
                className="h-5 w-5 rounded-full hover:bg-cyan-100 flex items-center justify-center"
                aria-label={`Удалить ${v}`}
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl bg-white px-4 py-3 text-body text-ink-strong placeholder:text-ink-subtle outline-none shadow-[inset_0_0_0_1.5px_var(--slate-200)] focus:shadow-[inset_0_0_0_1.5px_var(--blue-600)]"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="h-12 w-12 flex-shrink-0 rounded-xl bg-cyan-500 text-white flex items-center justify-center disabled:bg-slate-200 disabled:text-slate-400"
          aria-label="Добавить"
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}

export default function EditBaselineSheet({
  open,
  patient,
  onClose,
}: EditBaselineSheetProps) {
  const [height, setHeight] = useState(
    patient.heightCm ? String(patient.heightCm) : '',
  )
  const [weight, setWeight] = useState(
    patient.weightKg ? String(patient.weightKg) : '',
  )
  const [conditions, setConditions] = useState<string[]>(
    patient.chronicConditions ?? [],
  )
  const [allergies, setAllergies] = useState<string[]>(patient.allergies ?? [])

  useEffect(() => {
    if (!open) return
    setHeight(patient.heightCm ? String(patient.heightCm) : '')
    setWeight(patient.weightKg ? String(patient.weightKg) : '')
    setConditions(patient.chronicConditions ?? [])
    setAllergies(patient.allergies ?? [])
  }, [open, patient])

  function save() {
    const hNum = Number(height)
    const wNum = Number(weight)
    updatePatientBaseline({
      heightCm: Number.isFinite(hNum) && hNum > 0 ? hNum : undefined,
      weightKg: Number.isFinite(wNum) && wNum > 0 ? wNum : undefined,
      chronicConditions: conditions,
      allergies,
    })
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Базовые данные">
      <p className="text-caption text-ink-muted leading-relaxed">
        Эти данные видит ваш врач в Эндокор. Они помогают точнее планировать
        обследование и подготовку.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Рост, см"
          inputMode="numeric"
          value={height}
          onChange={(e) => setHeight(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <Input
          label="Вес, кг"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
        />
      </div>

      <ChipList
        label="Хронические состояния"
        placeholder="Например, Гипертония"
        values={conditions}
        onChange={setConditions}
      />

      <ChipList
        label="Аллергии"
        placeholder="Например, Пенициллин"
        values={allergies}
        onChange={setAllergies}
      />

      <div className="flex flex-col gap-2">
        <Button variant="primary" full onClick={save}>
          Сохранить
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          Отменить
        </Button>
      </div>
    </BottomSheet>
  )
}
