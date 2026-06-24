// Dev-only proof-of-life: runs the full Slice A + B round-trip against the live
// backend (BACKEND_MODE not required — this page always talks to the API). Kept
// isolated from the demo screens so it can't affect the 5–7 min walkthrough.

import { useEffect, useState } from 'react'
import { API_BASE } from '../../api/config'
import { auth, me, onboarding, uploads } from '../../api/client'

type Step = { label: string; ok: boolean | null; detail?: string }

const freshPhone = () => `+79${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`

export default function ApiCheck() {
  const [steps, setSteps] = useState<Step[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const out: Step[] = []
    const push = (s: Step) => {
      out.push(s)
      if (!cancelled) setSteps([...out])
    }

    const run = async () => {
      try {
        const ctx = await onboarding.partnerContext('enc')
        push({ label: 'GET /onboarding/partner-context', ok: true, detail: ctx.partner_name })

        const phone = freshPhone()
        const commit = await onboarding.commit({
          department_public_id: ctx.department_public_id,
          name: 'Волков Сергей Николаевич',
          dob: '1968-03-12',
          gender: 'male',
          phone,
          oms: '7700000000000002',
          consents: [
            { consent_type: 'pdn_general', legal_text_version: '2026.04.23', ack_mechanism: 'scroll_to_end', accepted: true },
            { consent_type: 'clinic_transfer', legal_text_version: '2026.05.27', ack_mechanism: 'scroll_to_end', accepted: true },
          ],
          document_hash: 'sha256:demo',
        })
        push({
          label: 'POST /onboarding/commit (атомарно)',
          ok: !!commit.patient_public_id,
          detail: `доступ: ${commit.grant?.status}`,
        })

        await auth.verifyOtp(phone, '0000')
        const session = await auth.session()
        push({ label: 'OTP → JWT → GET /auth/session', ok: session.role === 'patient', detail: session.role })

        const grants = await me.accessGrants()
        push({ label: 'GET /me/access-grants', ok: grants.length === 1, detail: `${grants.length} активный` })

        const sign = await uploads.sign('image/jpeg')
        const analysis = (await uploads.registerAnalysis({
          object_key: sign.object_key,
          analysis_type: 'glucose',
          label: 'Глюкоза',
          lab_date: '2026-03-22',
        })) as { public_id: string; status: string; fields: { field_key: string; low_confidence: boolean }[] }
        const lowConf = analysis.fields[0]?.low_confidence
        push({
          label: 'POST /analyses (OCR-заглушка)',
          ok: analysis.status === 'structured',
          detail: `поле «${analysis.fields[0]?.field_key}», low_confidence=${lowConf}`,
        })

        const edited = (await uploads.editOcrField(analysis.public_id, 'Глюкоза', '7.2')) as {
          fields: { raw_value: string; patient_transcription_state: string }[]
        }
        push({
          label: 'PATCH ocr-fields (правка → ревизия)',
          ok: edited.fields[0]?.raw_value === '7.2',
          detail: `значение=${edited.fields[0]?.raw_value}, состояние=${edited.fields[0]?.patient_transcription_state}`,
        })

        const revoked = await me.revokeGrant(grants[0].public_id)
        push({ label: 'POST revoke (одна транзакция)', ok: revoked.status === 'revoked', detail: revoked.status })
      } catch (e) {
        push({ label: 'ОШИБКА', ok: false, detail: e instanceof Error ? e.message : String(e) })
      } finally {
        if (!cancelled) setDone(true)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const allOk = done && steps.every((s) => s.ok)

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', fontFamily: 'Inter, sans-serif', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>IntelDoc API — проверка связи</h1>
      <p style={{ color: '#64748b', fontSize: 14 }}>
        Бэкенд: <code>{API_BASE}</code> · сквозной прогон Slice A + B вживую
      </p>
      <ol style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {steps.map((s, i) => (
          <li
            key={i}
            data-testid="api-step"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              padding: '10px 12px',
              borderRadius: 10,
              background: s.ok === false ? '#fef2f2' : '#f8fafc',
              marginBottom: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: 16 }}>{s.ok == null ? '⏳' : s.ok ? '✅' : '❌'}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{s.label}</div>
              {s.detail && <div style={{ fontSize: 12, color: '#64748b' }}>{s.detail}</div>}
            </span>
          </li>
        ))}
      </ol>
      {done && (
        <div
          data-testid="api-check-result"
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            fontWeight: 600,
            color: allOk ? '#065f46' : '#991b1b',
            background: allOk ? '#ecfdf5' : '#fef2f2',
          }}
        >
          {allOk ? '✅ Все шаги прошли — фронт подключён к реальному API' : '❌ Есть ошибки — смотри детали выше'}
        </div>
      )}
    </div>
  )
}
