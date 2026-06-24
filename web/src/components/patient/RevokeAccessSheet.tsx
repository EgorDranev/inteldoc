import { ShieldOff } from 'lucide-react'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'

interface RevokeAccessSheetProps {
  open: boolean
  clinicName: string
  onClose: () => void
  onConfirm: () => void
}

export default function RevokeAccessSheet({
  open,
  clinicName,
  onClose,
  onConfirm,
}: RevokeAccessSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Отозвать доступ?">
      <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4">
        <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-white text-rose-500 flex items-center justify-center">
          <ShieldOff size={18} strokeWidth={2} />
        </div>
        <p className="text-caption text-ink-strong leading-relaxed">
          {clinicName} больше не сможет видеть ваши анализы и историю.
          Уже сохранённые в клинике данные останутся у врача.
          Доступ можно вернуть позже.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="dark" full onClick={onConfirm}>
          Отозвать доступ
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          Оставить как есть
        </Button>
      </div>
    </BottomSheet>
  )
}
