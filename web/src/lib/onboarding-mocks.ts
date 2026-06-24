// Mock/stub boundary for backend calls referenced by the onboarding flow.
// Centralised so the cutover to a real backend touches one file.
//
// All functions are async to mirror the real-call shape. Latency is bounded
// per spec §Transition state (min 1500 ms, max 4000 ms).

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Hash the access-grant document text together with the recipient/user so the
 * audit record refers to exactly what was signed. SubtleCrypto is async; we
 * return a hex digest. Falls back to a non-crypto digest if SubtleCrypto is
 * unavailable (e.g. file:// previews).
 */
export async function hashSignedDocument(input: string): Promise<string> {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined'
  ) {
    const buf = new TextEncoder().encode(input)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Lightweight fallback — sufficient for prototype uniqueness.
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8)
}

/**
 * Submit the access grant to the backend. In production this would persist
 * the e-signature record server-side and return a grant ID. Here we just
 * simulate latency.
 */
export async function submitAccessGrant(): Promise<{ ok: true }> {
  await sleep(450)
  return { ok: true }
}

/**
 * Submit the consent bundle to the backend. Returns silently in the
 * prototype; real implementation would persist immutably.
 */
export async function submitConsentBundle(): Promise<{ ok: true }> {
  await sleep(450)
  return { ok: true }
}

/**
 * Bootstrap the user's prep home — fetch initial data, warm caches, etc.
 * The transition screen waits for this before forwarding to /patient/home.
 *
 * Spec §Transition state: min 1500 ms display, max 4000 ms before forced
 * advance with a silent log event.
 */
export async function bootstrapPrepHome(): Promise<{ ok: true }> {
  await sleep(1700)
  return { ok: true }
}
