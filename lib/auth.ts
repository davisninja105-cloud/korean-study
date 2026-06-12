// Shared auth helpers for the single-password gate. Uses Web Crypto (HMAC)
// so it runs in both the Edge middleware and Node route handlers.

export const AUTH_COOKIE = 'ks_auth'
const MESSAGE = 'korean-study-authenticated'

// Deterministic session token = HMAC-SHA256(AUTH_SECRET, MESSAGE). The cookie
// stores this; middleware recomputes and compares. Without AUTH_SECRET the
// token can't be forged.
export async function computeAuthToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(MESSAGE))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
