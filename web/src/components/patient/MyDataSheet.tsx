import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Activity,
  Bell,
  FileText,
  Heart,
  IdCard,
  MessageSquare,
  Phone,
  ShieldCheck,
} from 'lucide-react'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'
import { useInteldoc } from '../../store/store'
import { track } from '../../lib/analytics'
import type { LucideIcon } from 'lucide-react'

interface MyDataSheetProps {
  open: boolean
  onClose: () => void
  onDeleteAccount: () => void
}

interface Row {
  Icon: LucideIcon
  title: string
  count?: number
  reason: string
  retention: string
}

export default function MyDataSheet({
  open,
  onClose,
  onDeleteAccount,
}: MyDataSheetProps) {
  useEffect(() => {
    if (open) track({ name: 'my_data_viewed' })
  }, [open])

  const counts = useInteldoc(useShallow((s) => {
    const pid = s.currentPatientId
    if (!pid) {
      return {
        analyses: 0,
        documents: 0,
        complaints: 0,
        plan: 0,
        grants: 0,
        consents: 0,
      }
    }

    const bundle = s.consentBundles.find((b) => b.userId === pid)
    return {
      analyses: s.analyses.filter((a) => a.patientId === pid).length,
      documents: s.documents.filter((d) => d.patientId === pid).length,
      complaints: s.complaints.filter((c) => c.patientId === pid).length,
      plan: s.planItems.filter((p) => p.patientId === pid).length,
      grants: s.accessGrants.filter((g) => g.patientId === pid).length,
      consents: bundle?.consents.length ?? 0,
    }
  }))

  const rows = useMemo<Row[]>(() => {
    return [
      {
        Icon: IdCard,
        title: 'Профиль и идентификация',
        reason: 'ФИО, дата рождения, пол, полис ОМС. Нужны клинике, чтобы сопоставить вас с картой пациента.',
        retention: 'Хранится, пока активен аккаунт.',
      },
      {
        Icon: Phone,
        title: 'Контакты',
        reason: 'Телефон и email. По ним приходят уведомления о визите, плане, доступах.',
        retention: 'Хранится, пока активен аккаунт.',
      },
      {
        Icon: Heart,
        title: 'Базовые данные о здоровье',
        reason: 'Рост, вес, хронические состояния, аллергии. Помогают точнее планировать подготовку и обследование.',
        retention: 'Хранится, пока активен аккаунт.',
      },
      {
        Icon: Activity,
        title: 'Анализы',
        count: counts.analyses,
        reason: 'Загруженные результаты и распознанные показатели. Используются для подготовки сводки к приёму.',
        retention: 'Хранятся, пока активно согласие на обработку медицинских данных.',
      },
      {
        Icon: FileText,
        title: 'Документы',
        count: counts.documents,
        reason: 'Паспорт, ОМС, направления. Прикрепляются к карте на стороне клиники.',
        retention: 'Хранятся, пока активен доступ ЛПУ.',
      },
      {
        Icon: MessageSquare,
        title: 'Жалобы и план обследования',
        count: counts.complaints + counts.plan,
        reason: 'То, что вы отметили перед визитом, и пункты плана, выданные врачом.',
        retention: 'Хранится, пока активен аккаунт.',
      },
      {
        Icon: ShieldCheck,
        title: 'Согласия и доступы',
        count: counts.consents + counts.grants,
        reason: 'Подписанные документы и история выдачи / отзыва доступа клиникам. Юридически значимы.',
        retention: 'Хранятся 3 года после отзыва — требование 152-ФЗ.',
      },
      {
        Icon: Bell,
        title: 'Действия в приложении',
        reason: 'История событий: что и когда происходило с вашими данными (вход, загрузка, изменения).',
        retention: 'Хранится 12 месяцев в обезличенной форме.',
      },
    ]
  }, [counts])

  const totalLine = useMemo(() => {
    const known = rows.filter((r) => typeof r.count === 'number')
    if (known.length === 0) return null
    const sum = known.reduce((a, r) => a + (r.count ?? 0), 0)
    return sum
  }, [rows])

  return (
    <BottomSheet open={open} onClose={onClose} title="Какие данные о вас хранятся">
      <p className="text-caption text-ink-muted leading-relaxed">
        Прозрачный список — что приложение знает о вас, зачем и как долго хранит.
        {totalLine !== null && (
          <> Сейчас всего {totalLine} записей по медицинским и плановым данным.</>
        )}
      </p>

      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {rows.map(({ Icon, title, count, reason, retention }) => (
          <div
            key={title}
            className="rounded-2xl bg-surface-sunken p-4 flex items-start gap-3"
          >
            <div className="h-9 w-9 rounded-xl bg-white text-cyan-500 flex items-center justify-center flex-shrink-0">
              <Icon size={18} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-bold text-ink-strong leading-tight">
                  {title}
                </p>
                {typeof count === 'number' && (
                  <span className="text-caption font-bold text-ink-strong font-data">
                    {count}
                  </span>
                )}
              </div>
              <p className="text-caption text-ink-muted mt-1 leading-snug">
                {reason}
              </p>
              <p className="text-[11px] text-ink-muted mt-1.5 leading-snug">
                {retention}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
        <Button variant="secondary" full disabled>
          Скачать выгрузку (PDF)
        </Button>
        <Button variant="ghost" full onClick={onDeleteAccount}>
          Удалить аккаунт и данные
        </Button>
      </div>
      <p className="text-[11px] text-ink-muted leading-relaxed text-center px-2">
        Выгрузка появится позже. Удаление — необратимо: восстановить аккаунт
        нельзя.
      </p>
    </BottomSheet>
  )
}
