import { useState } from 'react'
import { Check, Info, Plus, ShieldCheck, UserRound, X } from 'lucide-react'
import ChecklistSection from './ChecklistSection'
import StatusChip from '../StatusChip'
import BottomSheet from '../primitives/BottomSheet'
import Button from '../primitives/Button'

type CaregiverStatus = 'active' | 'invited'

interface Caregiver {
  id: string
  name: string
  relation: string
  phone: string
  status: CaregiverStatus
  /** ISO-like display string of the last time they opened the prep view. */
  lastSeen?: string
  invitedAt?: string
}

const SEEDED_CAREGIVERS: Caregiver[] = [
  {
    id: 'cg-1',
    name: 'Иванова Анна',
    relation: 'дочь',
    phone: '+7 (916) 555-13-12',
    status: 'active',
    lastSeen: 'сегодня · 09:42',
  },
]

/**
 * «Доступ близкого человека» — patient grants a trusted person view-only
 * access to the **preparation progress** only. Scope is intentionally narrow:
 * не клинические данные, не анализы — только статус подготовки и записи
 * к приёму. Aligns with the access-transparency guardrail.
 */
export default function CaregiverAccessSection() {
  const [items, setItems] = useState<Caregiver[]>(SEEDED_CAREGIVERS)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [focus, setFocus] = useState<Caregiver | null>(null)

  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')
  const [phone, setPhone] = useState('')

  function sendInvite() {
    if (!name.trim() || !phone.trim()) return
    const next: Caregiver = {
      id: `cg-${Date.now()}`,
      name: name.trim(),
      relation: relation.trim() || 'близкий',
      phone: phone.trim(),
      status: 'invited',
      invitedAt: 'только что',
    }
    setItems((prev) => [...prev, next])
    setName('')
    setRelation('')
    setPhone('')
    setInviteOpen(false)
  }

  function revoke(id: string) {
    setItems((prev) => prev.filter((c) => c.id !== id))
    setFocus(null)
  }

  return (
    <ChecklistSection title="Доступ близкого человека">
      <p className="text-caption text-ink-muted leading-relaxed px-1">
        Пригласите того, кому доверяете, — он увидит только прогресс подготовки и дату приёма. Клинические данные не передаются.
      </p>

      <div className="rounded-2xl bg-white overflow-hidden divide-y divide-ink-100">
        {items.map((cg) => {
          const active = cg.status === 'active'
          return (
            <button
              key={cg.id}
              onClick={() => setFocus(cg)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
            >
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  active
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                <UserRound size={18} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-ink-strong leading-snug">
                  {cg.name} <span className="text-ink-muted font-normal">· {cg.relation}</span>
                </p>
                <p className="text-caption text-ink-muted leading-snug mt-0.5">
                  {active
                    ? `Видит прогресс · последний вход ${cg.lastSeen ?? '—'}`
                    : `Приглашение отправлено ${cg.invitedAt ?? ''}`}
                </p>
              </div>
              <StatusChip
                label={active ? 'Активен' : 'Ожидает'}
                variant={active ? 'success' : 'warning'}
              />
            </button>
          )
        })}

        <button
          onClick={() => setInviteOpen(true)}
          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
            <Plus size={18} strokeWidth={2} />
          </div>
          <p className="text-body font-semibold text-cyan-600 leading-snug flex-1">
            Пригласить близкого
          </p>
        </button>
      </div>

      <div className="rounded-xl bg-cyan-50 px-3 py-2 flex items-start gap-2">
        <ShieldCheck
          size={13}
          strokeWidth={2}
          className="flex-shrink-0 text-cyan-600 mt-0.5"
          aria-hidden
        />
        <p className="text-caption text-cyan-700 leading-snug">
          Доступ ограничен прогрессом подготовки. Анализы, выписки и переписку с врачом видите только вы.
        </p>
      </div>

      {/* Invite sheet */}
      <BottomSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Пригласить близкого"
      >
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-caption text-ink-muted leading-relaxed">
            Пришлём ссылку по SMS. По ней близкий увидит только прогресс подготовки.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-strong">Имя</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Анна Иванова"
              className="rounded-xl border border-ink-100 px-3 py-2.5 text-body text-ink-strong focus:outline-none focus:ring-2 focus:ring-cyan-200"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-strong">Кем приходится</span>
            <input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="например, дочь или супруг"
              className="rounded-xl border border-ink-100 px-3 py-2.5 text-body text-ink-strong focus:outline-none focus:ring-2 focus:ring-cyan-200"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-strong">Телефон</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 ___ ___-__-__"
              inputMode="tel"
              className="rounded-xl border border-ink-100 px-3 py-2.5 text-body text-ink-strong focus:outline-none focus:ring-2 focus:ring-cyan-200"
            />
          </label>

          <div className="rounded-xl bg-surface px-3 py-2 flex items-start gap-2">
            <Info
              size={13}
              strokeWidth={2}
              className="flex-shrink-0 text-ink-muted mt-0.5"
              aria-hidden
            />
            <p className="text-caption text-ink-muted leading-snug">
              Доступ можно отозвать в любой момент.
            </p>
          </div>

          <Button full onClick={sendInvite}>
            Отправить приглашение
          </Button>
        </div>
      </BottomSheet>

      {/* Details / revoke sheet */}
      <BottomSheet
        open={!!focus}
        onClose={() => setFocus(null)}
        title={focus?.name}
      >
        {focus && (
          <div className="flex flex-col gap-3 pb-2">
            <div className="rounded-2xl bg-surface p-4 flex flex-col gap-1">
              <p className="text-caption text-ink-muted">Кем приходится</p>
              <p className="text-body font-semibold text-ink-strong">
                {focus.relation}
              </p>
              <p className="text-caption text-ink-muted mt-2">Телефон</p>
              <p className="text-body font-semibold text-ink-strong font-data">
                {focus.phone}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 flex flex-col gap-2 border border-ink-100">
              <p className="text-micro font-bold uppercase tracking-caps text-ink-muted">
                Что видит
              </p>
              <Row icon="check" text="Прогресс подготовки к приёму" />
              <Row icon="check" text="Дату и время основного приёма" />
              <Row icon="cross" text="Анализы и расшифровки OCR" />
              <Row icon="cross" text="Эпикризы и план обследования" />
              <Row icon="cross" text="Переписку с врачом и Василием" />
            </div>

            <Button full variant="secondary" onClick={() => revoke(focus.id)}>
              Отозвать доступ
            </Button>
          </div>
        )}
      </BottomSheet>
    </ChecklistSection>
  )
}

function Row({ icon, text }: { icon: 'check' | 'cross'; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <div
        className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          icon === 'check'
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        {icon === 'check' ? (
          <Check size={12} strokeWidth={2.6} />
        ) : (
          <X size={12} strokeWidth={2.6} />
        )}
      </div>
      <p className="text-caption text-ink-strong leading-snug">{text}</p>
    </div>
  )
}
