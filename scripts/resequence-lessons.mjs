/**
 * One-time fix: reassigns Lesson.orderIndex to 1..N in document order.
 * Fetches the doc to get the canonical lesson sequence, then updates Turso.
 */
import { createClient } from '@libsql/client'
import { GoogleAuth } from 'google-auth-library'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
function parseEnv(f) {
  const v = {}
  try { for (const l of readFileSync(resolve(__dir, '..', f), 'utf8').split('\n')) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/); if (m) v[m[1]] = m[2] } } catch {}
  return v
}
const env = { ...parseEnv('.env'), ...parseEnv('.env.local') }

const db = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN })
const KEY    = env.GOOGLE_SERVICE_ACCOUNT_KEY
const DOC_ID = env.NEXT_PUBLIC_GOOGLE_DOC_ID

// Fetch the doc in document order (same logic as google-docs.ts)
const auth = new GoogleAuth({ credentials: JSON.parse(KEY), scopes: ['https://www.googleapis.com/auth/documents.readonly'] })
const client = await auth.getClient()
const { token } = await client.getAccessToken()

const res = await fetch(`https://docs.googleapis.com/v1/documents/${DOC_ID}?includeTabsContent=true`, { headers: { Authorization: `Bearer ${token}` } })
const doc = await res.json()

function findTab(tabs, title) {
  for (const t of tabs) {
    if (t.tabProperties?.title?.trim() === title) return t
    const c = findTab(t.childTabs ?? [], title)
    if (c) return c
  }
}
function paragraphText(p) {
  let text = ''
  for (const el of p.elements ?? []) { if (el.textRun?.content) text += el.textRun.content }
  return text.endsWith('\n') ? text : text + '\n'
}
function tableText(table) {
  let text = ''
  for (const row of table.tableRows ?? []) {
    const cells = (row.tableCells ?? []).map(cell =>
      (cell.content ?? []).map(el => el.paragraph ? paragraphText(el.paragraph).trim() : '').join(' ').trim()
    )
    text += cells.join('\t') + '\n'
  }
  return text
}
function normalize(text) { return text.replace(/\n{3,}/g, '\n\n').trim() }

const tab = findTab(doc.tabs ?? [], '수업 노트')
const content = tab.documentTab?.body?.content ?? []

const lessons = []
let current = ''
for (const element of content) {
  if (element.paragraph) {
    if ((element.paragraph.elements ?? []).some(e => e.horizontalRule !== undefined)) {
      lessons.push(current); current = ''; continue
    }
    current += paragraphText(element.paragraph)
  } else if (element.table) {
    current += tableText(element.table)
  }
}
lessons.push(current)

const docLessons = lessons.map(normalize).filter(s => s.length > 0)
console.log(`Doc has ${docLessons.length} lessons in order.`)

// Fetch all DB lessons
const { rows } = await db.execute(`SELECT id, orderIndex, contentHash FROM "Lesson" ORDER BY orderIndex`)
console.log(`DB has ${rows.length} lessons.`)

// Match by content hash and assign correct orderIndex
let updated = 0
let unmatched = 0
for (let i = 0; i < docLessons.length; i++) {
  const hash = createHash('sha256').update(docLessons[i]).digest('hex')
  const dbRow = rows.find(r => (r[2] ?? r.contentHash) === hash)
  if (!dbRow) {
    console.warn(`  Lesson ${i + 1}: no matching DB row (not yet synced?)`)
    unmatched++
    continue
  }
  const currentIdx = Number(dbRow[1] ?? dbRow.orderIndex)
  const correctIdx = i + 1
  if (currentIdx !== correctIdx) {
    await db.execute({ sql: `UPDATE "Lesson" SET "orderIndex" = ? WHERE id = ?`, args: [correctIdx, dbRow[0] ?? dbRow.id] })
    console.log(`  Lesson ${correctIdx}: was ${currentIdx} → updated`)
  } else {
    console.log(`  Lesson ${correctIdx}: already correct`)
  }
  updated++
}

if (unmatched > 0) console.warn(`\n⚠ ${unmatched} doc lesson(s) had no DB match — run sync to add them.`)
console.log(`\nDone. ${updated} lessons resequenced.`)
