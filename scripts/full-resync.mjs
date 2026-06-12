/**
 * Drives a full resync of the Google Doc against the production app.
 * Logs in, then repeatedly calls POST /api/sync until remaining=0.
 *
 * Usage: node scripts/full-resync.mjs
 * Run after scripts/wipe-card-data.mjs.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv(filename) {
  const vars = {}
  try {
    for (const line of readFileSync(resolve(__dir, '..', filename), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
      if (m) vars[m[1]] = m[2]
    }
  } catch { /* file may not exist */ }
  return vars
}

const env = { ...parseEnv('.env'), ...parseEnv('.env.local') }

const BASE_URL    = process.env.BASE_URL ?? 'https://korean-study-five.vercel.app'
const documentId  = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID ?? env.NEXT_PUBLIC_GOOGLE_DOC_ID
const appPassword = process.env.APP_PASSWORD               ?? env.APP_PASSWORD

if (!documentId)  { console.error('NEXT_PUBLIC_GOOGLE_DOC_ID not set'); process.exit(1) }
if (!appPassword) { console.error('APP_PASSWORD not set'); process.exit(1) }

console.log('Target:', BASE_URL)
console.log('Doc ID:', documentId)
console.log()

// 1. Log in and grab the session cookie.
console.log('Logging in…')
const loginRes = await fetch(`${BASE_URL}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: appPassword }),
})
if (!loginRes.ok) {
  console.error('Login failed:', await loginRes.text())
  process.exit(1)
}

// Extract auth cookie (name=value) from Set-Cookie header.
const setCookie = loginRes.headers.get('set-cookie') ?? ''
const authCookie = setCookie.split(';')[0].trim()
if (!authCookie.includes('=')) {
  console.error('No cookie received from login response:', setCookie)
  process.exit(1)
}
console.log('Logged in. Cookie:', authCookie.split('=')[0] + '=…')
console.log()

// 2. Sync loop — 4 lessons per batch, keep going until remaining=0.
let batch = 0
let totalLessons = 0
let totalCards = 0

while (true) {
  batch++
  process.stdout.write(`Batch ${batch}: syncing… `)

  const res = await fetch(`${BASE_URL}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': authCookie,
    },
    body: JSON.stringify({ documentId }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`\nSync failed (HTTP ${res.status}): ${text}`)
    process.exit(1)
  }

  const data = await res.json()

  if (data.error) {
    console.error('\nSync error:', data.error)
    process.exit(1)
  }

  totalLessons += data.newLessons ?? 0
  totalCards   += data.newCards   ?? 0

  const remaining = data.remaining ?? 0
  console.log(`${data.newLessons} lessons, ${data.newCards} cards. Remaining: ${remaining}${data.warnings ? ' ⚠ ' + data.warnings : ''}`)

  if (remaining === 0) break

  // Brief pause between batches so we don't hammer the serverless function.
  await new Promise(r => setTimeout(r, 3000))
}

console.log()
console.log(`Resync complete. Total: ${totalLessons} lessons, ${totalCards} cards.`)
