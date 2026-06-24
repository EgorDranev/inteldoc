// Live-backend counterpart to onboarding-mocks.ts. Used ONLY when BACKEND_MODE
// is on; the demo's default path stays entirely on the mock store + stubs.
//
// finalizeOnboarding() (store/actions.ts) calls commitOnboardingBackend() in
// BACKEND_MODE to run the real onboarding round-trip:
//   1. resolve the Эндокор partner-context              → department_public_id
//   2. POST /onboarding/commit (atomic)             → patient + access grant + consents
//   3. mint a patient session (OTP request + verify, fixed dev code)
//      so every later backend-mode screen is authenticated.
//
// All shape/format conversion between the store's onboarding model and the
// backend CommitIn contract lives here, keeping the cutover in one file.

import { auth, onboarding } from '../api/client'
import type { components } from '../api/types'
import type { ConsentId, ConsentRecord, Gender } from '../store/types'

type Schemas = components['schemas']
type CommitIn = Schemas['CommitIn']
type ConsentRecordIn = Schemas['ConsentRecordIn']
type ConsentType = Schemas['ConsentType']
type CommitOut = Schemas['CommitOut']

// Fixed dev OTP — see server config.dev_otp_code. Onboarding has no OTP screen
// (pilot decision: signature is mock_no_otp), so we mint the session silently to
// preserve the no-OTP UX while still authenticating against the real API for
// downstream screens. otp/verify only succeeds AFTER commit creates the account.
const DEV_OTP_CODE = '0000'

// Frontend ConsentId → backend ConsentType. `tos` has no backend equivalent and
// is dropped; `cross_border` never reaches the bundle (omitted from the UI).
const CONSENT_TYPE_MAP: Partial<Record<ConsentId, ConsentType>> = {
  pdn_general: 'pdn_general',
  pdn_special: 'pdn_special',
  clinic_access: 'clinic_transfer',
  marketing: 'marketing',
}

/** dd.mm.yyyy (store form) → yyyy-mm-dd (backend ISO). Backend 500s on non-ISO. */
function dobToIso(value: string): string {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return value // already ISO (legacy draft) or unknown — commit validates.
}

/** Map the captured consent records to the backend payload, dropping unmapped ids. */
function mapConsents(records: ConsentRecord[]): ConsentRecordIn[] {
  const out: ConsentRecordIn[] = []
  for (const r of records) {
    const consent_type = CONSENT_TYPE_MAP[r.id]
    if (!consent_type) continue
    out.push({
      consent_type,
      legal_text_version: r.version, // the version the patient actually acked
      ack_mechanism: r.ackMechanism, // same literal union as the backend enum
      accepted: r.accepted,
      channels: r.channels ?? null,
      sms_confirmed: r.smsConfirmed ?? null,
    })
  }
  return out
}

export interface OnboardingCommitInput {
  name: string
  dob: string // dd.mm.yyyy or ISO
  gender: Gender
  phone: string // raw; the backend normalizes to RU E.164
  email?: string
  consents: ConsentRecord[]
  documentHash: string
}

export interface OnboardingCommitResult {
  patientPublicId: string | null
  deduplicated: boolean
  grantStatus: string | null
  /** Whether the silent post-commit session mint succeeded (best-effort). */
  authed: boolean
}

/**
 * Run the live onboarding commit against the backend. Throws on a failed
 * partner-context resolve or commit (the load-bearing step) so the Consents
 * screen surfaces an error instead of completing onboarding with nothing
 * persisted server-side. The session mint is best-effort and never blocks.
 */
export async function commitOnboardingBackend(
  input: OnboardingCommitInput,
): Promise<OnboardingCommitResult> {
  const ctx = await onboarding.partnerContext('endokor')

  const body: CommitIn = {
    department_public_id: ctx.department_public_id,
    name: input.name.trim(),
    dob: dobToIso(input.dob),
    gender: input.gender,
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    oms: null, // not collected during onboarding; optional on the backend
    snils: null,
    consents: mapConsents(input.consents),
    document_hash: input.documentHash.startsWith('sha256:')
      ? input.documentHash
      : `sha256:${input.documentHash}`,
  }

  const commit: CommitOut = await onboarding.commit(body)

  // Mint a patient session so later backend-mode screens are authenticated.
  // Best-effort: a token hiccup must not block onboarding completion.
  let authed = false
  try {
    await auth.requestOtp(body.phone)
    await auth.verifyOtp(body.phone, DEV_OTP_CODE) // persists tokens via setTokens
    authed = true
  } catch {
    authed = false
  }

  return {
    patientPublicId: commit.patient_public_id ?? null,
    deduplicated: commit.deduplicated ?? false,
    grantStatus: commit.grant?.status ?? null,
    authed,
  }
}
