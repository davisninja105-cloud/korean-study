/**
 * Manual fallback: rebuild ALL CardDependency edges from each card's stored
 * `components` JSON via the shared lib/relink-dependencies.ts helper.
 *
 * As of RELIABILITY-02 (Phase 23), runSync() in lib/sync.ts now auto-relinks
 * the whole deck after every sync that completes with no failures and at
 * least one new lesson — so forward-reference edges (a card whose component
 * names a card taught in a lesson synced LATER) resolve without any manual
 * script. This thin wrapper remains for recovery (e.g. after an auto-relink
 * failure) and ad-hoc verification. Idempotent via the pure computeMissingEdges
 * diff AND the @@unique([cardId, prerequisiteId]) constraint — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/relink-dependencies.mts
 */

// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we
// use dynamic imports below to ensure Prisma sees the right DATABASE_URL —
// same pattern as scripts/local-resync.mts, documented in CLAUDE.md).
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now that env is loaded, dynamically import the shared helper.
const { relinkAllDependencies } = await import('../lib/relink-dependencies.js')

console.log('Relinking CardDependency edges…')
const result = await relinkAllDependencies()

console.log('='.repeat(50))
console.log('Relink complete.')
console.log(`  Cards scanned    : ${result.cardsScanned}`)
console.log(`  Edges created    : ${result.edgesCreated}`)
console.log(`  Total edges      : ${result.totalEdges}`)
console.log('='.repeat(50))

process.exit(0)
