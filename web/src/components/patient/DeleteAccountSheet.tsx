import { useEffect, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'

interface DeleteAccountSheetProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

const CONFIRM_WORD = 'УДАЛИТЬ'

/**
 * Hard-confirm sheet for «Право на забвение» (152-ФЗ ст. 14).
 * Splits the explanation into:
 *  – what is wiped from IntelDoc (everything client-side);
 *  – what stays in the clinic's own EHR (out of IntelDoc's reach).
 * Requires the user to type «УДАЛИТЬ» to enable the destructive action.
 */
export default function DeleteAccountSheet({
  open,
  onClose,
  onConfirm,
}: DeleteAccountSheetProps) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const ready = typed.trim().toUpperCase() === CONFIRM_WORD

  return (
    <BottomSheet open={open} onClose={onClose} title="Удалить аккаунт?">
      <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4">
        <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-white text-rose-500 flex items-center justify-center">
          <AlertTriangle size={18} strokeWidth={2} />
        </div>
        <p className="text-caption text-ink-strong leading-relaxed">
          Удаление необратимо. Восстановить аккаунт и историю в IntelDoc будет
          нельзя. Пользоваться сервисом без аккаунта тоже нельзя.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-caps text-rose-600 mb-2">
            Что удалится из IntelDoc
          </p>
          <ul className="flex flex-col gap-1.5">
            {[
              'Профиль, контакты, базовые данные о здоровье',
              'Все загруженные анализы и документы',
              'Жалобы, план обследования, история действий',
              'Согласия и история доступа клиник',
            ].map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-caption text-ink-strong leading-relaxed"
              >
                <X
                  size={14}
                  strokeWidth={2.4}
                  className="text-rose-500 mt-0.5 flex-shrink-0"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-600 mb-2">
            Что остаётся в карте Эндокор
          </p>
          <ul className="flex flex-col gap-1.5">
            {[
              'Записи о приёмах и заключения врачей клиники',
              'Анализы, которые уже попали в карту пациента',
              'Юридические следы согласий (требование 152-ФЗ)',
            ].map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-caption text-ink-strong leading-relaxed"
              >
                <Check
                  size={14}
                  strokeWidth={2.4}
                  className="text-cyan-500 mt-0.5 flex-shrink-0"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-muted leading-snug mt-2">
            Эти данные хранятся у клиники по медицинскому законодательству.
            Чтобы их изменить, обратитесь в регистратуру Эндокор.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold uppercase tracking-caps text-ink-muted">
          Чтобы подтвердить, введите слово «{CONFIRM_WORD}»
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_WORD}
          autoCapitalize="characters"
          className="w-full h-12 rounded-xl bg-white px-4 text-body-lg text-ink-strong placeholder:text-ink-subtle outline-none shadow-[inset_0_0_0_1.5px_var(--slate-200)] focus:shadow-[inset_0_0_0_1.5px_var(--error)] uppercase tracking-wide"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="dark" full onClick={onConfirm} disabled={!ready}>
          Удалить аккаунт навсегда
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          Оставить как есть
        </Button>
      </div>
    </BottomSheet>
  )
}
