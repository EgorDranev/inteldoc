import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ShieldCheck, ChevronRight } from 'lucide-react'
import PhoneFrame from '../../../components/patient/PhoneFrame'
import OnboardingChrome from '../../../components/patient/OnboardingChrome'
import Button from '../../../components/primitives/Button'
import BottomSheet from '../../../components/primitives/BottomSheet'
import ConsentModal from '../../../components/patient/ConsentModal'
import AccessConsentModal from '../../../components/patient/AccessConsentModal'
import { CONSENT_BLOCKS } from '../../../lib/consent-text'
import type { AckMechanism, ConsentId, ConsentRecord } from '../../../store/types'
import {
  finalizeOnboarding,
  saveConsentDraft,
  signAccessGrant,
} from '../../../store/actions'
import { useInteldoc } from '../../../store/store'
import { track } from '../../../lib/analytics'

type Channel = 'email' | 'sms' | 'push'

interface BlockState {
  accepted: boolean
  ackMechanism: AckMechanism | null
  channels: Channel[] // marketing only
  smsConfirmed: boolean
  smsConfirmedAt: string | null
}

type BlockStateMap = Record<ConsentId, BlockState>

const EMPTY: BlockState = {
  accepted: false,
  ackMechanism: null,
  channels: [],
  smsConfirmed: false,
  smsConfirmedAt: null,
}

const INITIAL: BlockStateMap = {
  clinic_access: { ...EMPTY },
  pdn_general: { ...EMPTY },
  pdn_special: { ...EMPTY },
  cross_border: { ...EMPTY }, // omitted from UI
  tos: { ...EMPTY },
  marketing: {
    ...EMPTY,
    accepted: true,
    ackMechanism: 'direct_tick',
    channels: ['email', 'sms', 'push'],
  },
}

function maskPhoneRu(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 4) return undefined
  const last2 = digits.slice(-2)
  return `+7 *** *** **${last2}`
}

export default function Consents() {
  const nav = useNavigate()
  const phoneRaw = useInteldoc((s) => s.accountDraft?.phone ?? null)
  const maskedPhone = useMemo(() => maskPhoneRu(phoneRaw), [phoneRaw])
  const accessSigned = useInteldoc((s) => s.accessSigned)

  const [blocks, setBlocks] = useState<BlockStateMap>(INITIAL)
  const [openConsentId, setOpenConsentId] = useState<ConsentId | null>(null)
  const [accessModalOpen, setAccessModalOpen] = useState(false)
  const [marketingSheetOpen, setMarketingSheetOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    track({ name: 'consents_viewed' })
  }, [])

  useEffect(() => {
    if (!phoneRaw) nav('/patient/entry/account', { replace: true })
  }, [phoneRaw, nav])

  // Mirror store-side accessSigned into the block state so the card flips to
  // «Подписано» if the user signs and re-opens the modal later.
  useEffect(() => {
    if (!accessSigned) return
    setBlocks((b) =>
      b.clinic_access.accepted
        ? b
        : {
            ...b,
            clinic_access: {
              ...b.clinic_access,
              accepted: true,
              ackMechanism: 'scroll_to_end',
            },
          },
    )
  }, [accessSigned])

  const requiredAllAccepted = useMemo(() => {
    return CONSENT_BLOCKS.filter((b) => b.required).every((b) => {
      const s = blocks[b.id]
      if (b.isAccessGrant) return accessSigned
      if (!s.accepted) return false
      if (b.requiresSmsConfirmation && !s.smsConfirmed) return false
      return true
    })
  }, [blocks, accessSigned])

  const smsPendingOnly = useMemo(() => {
    // Submit is blocked specifically because pdn_special tick is in but SMS isn't done.
    const allReadDone = CONSENT_BLOCKS.filter(
      (b) => b.required && !b.isAccessGrant,
    ).every((b) => blocks[b.id].accepted)
    const smsMissing =
      blocks.pdn_special.accepted && !blocks.pdn_special.smsConfirmed
    return allReadDone && accessSigned && smsMissing
  }, [blocks, accessSigned])

  const accessPendingOnly = useMemo(() => {
    // Submit is blocked specifically because everything else is done but the
    // access grant hasn't been signed yet.
    const allOthersDone = CONSENT_BLOCKS.filter(
      (b) => b.required && !b.isAccessGrant,
    ).every((b) => {
      const s = blocks[b.id]
      if (!s.accepted) return false
      if (b.requiresSmsConfirmation && !s.smsConfirmed) return false
      return true
    })
    return allOthersDone && !accessSigned
  }, [blocks, accessSigned])

  function tapBlock(id: ConsentId) {
    track({ name: 'consent_block_tapped', consentId: id })
    const spec = CONSENT_BLOCKS.find((b) => b.id === id)!
    if (spec.isAccessGrant) {
      setAccessModalOpen(true)
      return
    }
    if (spec.directTick) {
      // Marketing — open detail sheet for channel selection.
      setMarketingSheetOpen(true)
    } else {
      setOpenConsentId(id)
    }
  }

  async function handleAccessSign() {
    await signAccessGrant()
    track({ name: 'access_grant_signed', esignId: 'session' })
  }

  function acknowledgeAccessGrant() {
    setBlocks((b) => ({
      ...b,
      clinic_access: {
        ...b.clinic_access,
        accepted: true,
        ackMechanism: 'scroll_to_end',
      },
    }))
    const spec = CONSENT_BLOCKS.find((s) => s.id === 'clinic_access')!
    track({
      name: 'consent_acknowledged',
      consentId: 'clinic_access',
      versionId: spec.version,
      ackMechanism: 'scroll_to_end',
    })
    setAccessModalOpen(false)
  }

  function acknowledgeRequired(
    id: ConsentId,
    mech: AckMechanism,
    opts?: { smsConfirmedAt?: string },
  ) {
    const spec = CONSENT_BLOCKS.find((b) => b.id === id)!
    setBlocks((b) => ({
      ...b,
      [id]: {
        ...b[id],
        accepted: true,
        ackMechanism: mech,
        smsConfirmed: opts?.smsConfirmedAt ? true : b[id].smsConfirmed,
        smsConfirmedAt: opts?.smsConfirmedAt ?? b[id].smsConfirmedAt,
      },
    }))
    track({
      name: 'consent_acknowledged',
      consentId: id,
      versionId: spec.version,
      ackMechanism: mech,
    })
    setOpenConsentId(null)
  }

  function toggleMarketing() {
    setBlocks((b) => {
      const cur = b.marketing
      const nextAccepted = !cur.accepted
      const nextChannels: Channel[] = nextAccepted ? cur.channels : []
      return {
        ...b,
        marketing: {
          ...cur,
          accepted: nextAccepted,
          ackMechanism: nextAccepted ? 'direct_tick' : null,
          channels: nextChannels,
        },
      }
    })
    const next = !blocks.marketing.accepted
    if (next) {
      const spec = CONSENT_BLOCKS.find((b) => b.id === 'marketing')!
      track({
        name: 'consent_acknowledged',
        consentId: 'marketing',
        versionId: spec.version,
        ackMechanism: 'direct_tick',
      })
    }
  }

  function setChannel(channel: Channel, on: boolean) {
    setBlocks((b) => {
      const cur = b.marketing
      const channels = on
        ? Array.from(new Set([...cur.channels, channel]))
        : cur.channels.filter((c) => c !== channel)
      const accepted = channels.length > 0
      return {
        ...b,
        marketing: {
          ...cur,
          accepted,
          ackMechanism: accepted ? cur.ackMechanism ?? 'direct_tick' : null,
          channels,
        },
      }
    })
    track({
      name: 'consent_opt_in_toggled',
      consentId: 'marketing',
      channels: on
        ? Array.from(new Set([...blocks.marketing.channels, channel]))
        : blocks.marketing.channels.filter((c) => c !== channel),
    })
  }

  async function submit() {
    if (!requiredAllAccepted || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const records: ConsentRecord[] = CONSENT_BLOCKS.map((spec) => {
        const s = blocks[spec.id]
        const base: ConsentRecord = {
          id: spec.id,
          version: spec.version,
          accepted: s.accepted,
          ackMechanism:
            s.ackMechanism ?? (spec.required ? 'scroll_to_end' : 'not_applicable'),
        }
        if (spec.id === 'marketing' && s.channels.length > 0) {
          base.channels = s.channels
        }
        if (spec.requiresSmsConfirmation && s.smsConfirmed) {
          base.smsConfirmed = true
          if (s.smsConfirmedAt) base.smsConfirmedAt = s.smsConfirmedAt
        }
        return base
      })
      saveConsentDraft(records)
      // clinic_access is signed inside its modal (signAccessGrant) — by the
      // time submit runs the e-sign + AccessGrant + Patient records already
      // exist in the store. Submit just commits the consent bundle linked to
      // that e-sign and flips hasCompletedOnboarding.
      await finalizeOnboarding()
      nav('/patient/entry/setup')
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Не удалось сохранить согласия. Попробуйте ещё раз.',
      )
      setSubmitting(false)
    }
  }

  function statusLabel(spec: (typeof CONSENT_BLOCKS)[number]) {
    const s = blocks[spec.id]
    if (spec.isAccessGrant) {
      return accessSigned ? 'Подписано' : 'Не подписано'
    }
    if (spec.id === 'marketing') {
      return s.accepted ? 'Включено' : null
    }
    if (spec.requiresSmsConfirmation) {
      if (s.smsConfirmed) return 'Подтверждено'
      if (s.accepted) return 'Нужен код из СМС'
      return 'Не прочитано'
    }
    return s.accepted ? 'Принято' : 'Не прочитано'
  }

  function statusTone(spec: (typeof CONSENT_BLOCKS)[number]):
    | 'done'
    | 'pending'
    | 'unread' {
    const s = blocks[spec.id]
    if (spec.isAccessGrant) return accessSigned ? 'done' : 'unread'
    if (spec.id === 'marketing') return s.accepted ? 'done' : 'unread'
    if (spec.requiresSmsConfirmation) {
      if (s.smsConfirmed) return 'done'
      if (s.accepted) return 'pending'
      return 'unread'
    }
    return s.accepted ? 'done' : 'unread'
  }

  return (
    <PhoneFrame>
      <OnboardingChrome
        showBack
        onBack={() => nav('/patient/entry/account')}
        progressLabel="Согласия · Шаг 2 из 2"
        step={2}
        totalSteps={2}
      />

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
        <div>
          <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
            Согласия
          </h1>
          <p className="text-body text-ink-muted leading-relaxed mt-2">
            На каждое разрешение — отдельное согласие. Нажмите на блок, чтобы
            прочитать полный текст. Доступ для Эндокор вы подтвердите электронной
            подписью, а медицинские данные — кодом из СМС.
          </p>
        </div>

        <section className="rounded-2xl bg-cyan-100 ring-1 ring-cyan-200 p-5 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-600 text-white flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} strokeWidth={2} />
          </div>
          <p className="text-body text-cyan-900 leading-relaxed">
            Каждое согласие — отдельное и обратимое. Вы решаете, что разрешить,
            и можете отозвать согласие в любой момент.
          </p>
        </section>

        <div className="flex flex-col gap-3">
          {CONSENT_BLOCKS.map((spec) => {
            const tone = statusTone(spec)
            const label = statusLabel(spec)
            const isMarketing = spec.id === 'marketing'
            const checked = tone === 'done'

            const cardBg =
              tone === 'done'
                ? 'bg-success-bg ring-1 ring-emerald-200'
                : tone === 'pending'
                ? 'bg-amber-50 ring-1 ring-amber-200'
                : 'bg-slate-50 ring-1 ring-slate-200'

            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => tapBlock(spec.id)}
                className={`rounded-2xl p-4 text-left transition-colors ${cardBg}`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox visual */}
                  <span
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
                      checked
                        ? 'bg-emerald-500'
                        : tone === 'pending'
                        ? 'bg-amber-400'
                        : isMarketing
                        ? 'bg-white shadow-[inset_0_0_0_1.5px_var(--slate-300)]'
                        : 'bg-slate-200'
                    }`}
                    aria-hidden
                  >
                    {checked && (
                      <Check size={14} strokeWidth={2.5} className="text-white" />
                    )}
                    {tone === 'pending' && (
                      <Check size={14} strokeWidth={2.5} className="text-white" />
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-[17px] font-bold text-ink-strong leading-snug">
                        {spec.title}
                      </p>
                      {spec.required && (
                        <span className="text-[11px] font-bold uppercase tracking-caps text-rose-600">
                          Обязательно
                        </span>
                      )}
                      {!spec.required && (
                        <span className="text-[11px] font-bold uppercase tracking-caps text-ink-muted">
                          Необязательно
                        </span>
                      )}
                      {spec.requiresSmsConfirmation && (
                        <span className="text-[11px] font-bold uppercase tracking-caps text-cyan-600">
                          Код из СМС
                        </span>
                      )}
                      {spec.isAccessGrant && (
                        <span className="text-[11px] font-bold uppercase tracking-caps text-cyan-600">
                          Электронная подпись
                        </span>
                      )}
                    </div>
                    <p className="text-body text-ink leading-relaxed">
                      {spec.summary}
                    </p>
                    {label && (
                      <p
                        className={`text-[11px] font-bold uppercase tracking-caps mt-2 ${
                          tone === 'done'
                            ? 'text-emerald-700'
                            : tone === 'pending'
                            ? 'text-amber-700'
                            : 'text-ink-muted'
                        }`}
                      >
                        {label}
                      </p>
                    )}
                  </div>

                  <ChevronRight size={18} className="text-slate-400 flex-shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 text-center px-1">
          <p className="text-body text-ink-muted leading-relaxed">
            Любое согласие можно отозвать в разделе «Настройки → Согласия».
            Пользовательское соглашение принимается один раз при регистрации.
          </p>
          <p className="text-body text-ink leading-relaxed">
            Если отзовёте обязательное согласие, сервис перестанет работать.
            Мы предупредим заранее.
          </p>
        </div>
        {submitError && (
          <p className="text-caption text-rose-600 leading-snug text-center">{submitError}</p>
        )}
      </div>

      <div className="px-5 pb-8 pt-3 border-t border-slate-100 bg-white/85 backdrop-blur">
        {accessPendingOnly && (
          <p className="text-caption text-ink-muted text-center mb-3 leading-snug">
            Подпишите согласие на доступ Эндокор, чтобы продолжить.
          </p>
        )}
        {smsPendingOnly && (
          <p className="text-caption text-ink-muted text-center mb-3 leading-snug">
            Подтвердите согласие на медицинские данные по СМС, чтобы продолжить.
          </p>
        )}
        <Button full onClick={submit} disabled={!requiredAllAccepted || submitting}>
          {submitting ? 'Сохраняем…' : 'Принять и продолжить'}
        </Button>
      </div>

      {/* Required-consent modals (one at a time) */}
      {openConsentId && (
        <ConsentModal
          open
          spec={CONSENT_BLOCKS.find((b) => b.id === openConsentId)!}
          maskedPhone={maskedPhone}
          onClose={() => setOpenConsentId(null)}
          onAcknowledge={(mech, opts) =>
            acknowledgeRequired(openConsentId, mech, opts)
          }
        />
      )}

      {/* Clinic access-grant modal — richer card-based variant. */}
      <AccessConsentModal
        open={accessModalOpen}
        spec={CONSENT_BLOCKS.find((b) => b.id === 'clinic_access')!}
        signed={accessSigned}
        onSign={handleAccessSign}
        onClose={() => setAccessModalOpen(false)}
        onAcknowledge={acknowledgeAccessGrant}
      />

      {/* Marketing detail sheet (channel toggles) */}
      <BottomSheet
        open={marketingSheetOpen}
        onClose={() => setMarketingSheetOpen(false)}
        title="Информационные и рекламные рассылки"
      >
        <p className="text-caption text-ink-muted leading-relaxed text-center">
          Каналы включены по умолчанию. Отключите ненужные — настройки можно
          изменить в любой момент.
        </p>
        <div className="flex flex-col gap-2">
          {(
            [
              { key: 'email' as const, label: 'Email' },
              { key: 'sms' as const, label: 'SMS' },
              { key: 'push' as const, label: 'Push-уведомления' },
            ]
          ).map(({ key, label }) => {
            const on = blocks.marketing.channels.includes(key)
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-2xl bg-surface-sunken px-4 py-3.5"
              >
                <span className="min-w-0 text-body font-bold text-ink-strong">
                  {label}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${label}: ${on ? 'включено' : 'выключено'}`}
                  onClick={() => setChannel(key, !on)}
                  className={`relative h-8 w-[52px] flex-shrink-0 rounded-full p-1 transition-colors ${
                    on ? 'bg-cyan-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                      on ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
        <Button
          variant="secondary"
          full
          onClick={() => setMarketingSheetOpen(false)}
        >
          Сохранить
        </Button>
      </BottomSheet>
    </PhoneFrame>
  )
}
