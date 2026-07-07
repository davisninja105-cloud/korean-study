/**
 * Phase 21 card-database quality audit — read-only deck scan.
 *
 * Reads the live Turso card corpus via the Prisma singleton, runs every audit
 * check class through `runAuditChecks` (lib/audit-checks.ts), prints a
 * per-class console summary, and writes a dated markdown findings report to
 * .planning/audits/card-audit-YYYY-MM-DD.md.
 *
 * Read-only audit — no writes to the database.
 *
 * The script performs ZERO classification of its own — all check logic lives
 * in lib/audit-checks.ts (runAuditChecks). This file is a thin I/O adapter:
 * load → runAuditChecks → render markdown → write file → console summary → exit(0).
 *
 * Every finding line carries the card id so Phase 22 can fix cards in place
 * by id (STATE.md v1.5 hard rule: never delete+recreate — cascades wipe FSRS
 * state + ReviewLog history).
 *
 * The renderer interpolates ONLY fields of the findings object and the date —
 * never process.env values, the database URL, or any credential (the report
 * is committed to git and becomes permanent record).
 *
 * Usage:
 *   npx tsx scripts/audit-cards.mts
 *
 * Reads DATABASE_URL / DATABASE_AUTH_TOKEN from .env / .env.local.
 * Output: .planning/audits/card-audit-<UTC-date>.md plus the console summary on stdout.
 */

// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we
// use dynamic imports below to ensure Prisma sees the right env vars) —
// mirrors scripts/retro-filter-cleanup.mts:27-41.
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
// Type-only static import is safe — types are erased at compile time and
// trigger NO module initialization (audit-checks.ts is pure anyway, but this
// keeps the convention uniform and avoids any ESM-hoisting surprise).
import type {
  AuditCardInput,
  AuditFindings,
  CardRef,
  DistractorAnomaly,
} from '../lib/audit-checks.js'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now that env is loaded, dynamically import libs that read process.env at
// module init. Never static-import { prisma } — hoisting breaks env loading
// (RESEARCH Pitfall 4; symptom: ~0 cards scanned from the empty local fallback).
const { runAuditChecks } = await import('../lib/audit-checks.js')
const { prisma } = await import('../lib/prisma.js')

const REPORT_DATE = new Date().toISOString().slice(0, 10) // UTC calendar date — NOT habitDateStr
const REPORT_DIR = path.resolve(__dir, '..', '.planning', 'audits')
const REPORT_PATH = path.resolve(REPORT_DIR, `card-audit-${REPORT_DATE}.md`)

console.log('Read-only audit — no writes to the database.')
console.log()

// ─── Data load: the script's ONLY database access, one findMany read ───
// Sentences MUST be ordered by orderIndex ascending — the pre-sort contract
// AuditCardInput requires (classifyBlankSafety reads sentences[0] as "first").
interface SentenceRow {
  korean: string
  targetForm: string
  orderIndex: number
}
interface CardRow {
  id: string
  type: string
  front: string
  back: string
  notes: string | null
  normalizedFront: string
  components: string | null
  distractors: string | null
  clozeSentence: string | null
  lessonId: string | null
  sentences: SentenceRow[]
}

const rows = (await prisma.card.findMany({
  include: { sentences: { orderBy: { orderIndex: 'asc' } } },
})) as CardRow[]

// Map rows to plain AuditCardInput objects — no Prisma types leak into the
// pure module. components/distractors stay as RAW nullable JSON strings; the
// module parses them inside try/catch so malformed rows become findings.
const cards: AuditCardInput[] = rows.map((r) => ({
  id: r.id,
  type: r.type,
  front: r.front,
  back: r.back,
  notes: r.notes,
  normalizedFront: r.normalizedFront,
  components: r.components,
  distractors: r.distractors,
  clozeSentence: r.clozeSentence,
  lessonId: r.lessonId,
  sentences: r.sentences.map((s) => ({
    korean: s.korean,
    targetForm: s.targetForm,
    orderIndex: s.orderIndex,
  })),
}))

console.log(`Loaded ${cards.length} cards from the live deck.`)
console.log()

// ─── Findings: delegate ALL classification to the pure module ───
const findings: AuditFindings = runAuditChecks(cards)

// ─── Markdown rendering (pure string building from findings + date) ───
// Interpolates ONLY findings fields and the date — never process.env, the
// database URL, or any credential. The report is committed to git.
function refLine(c: CardRef): string {
  return `- [${c.type}] front: "${c.front}" — back: "${c.back}" — id: ${c.id}`
}

function renderMarkdown(f: AuditFindings, date: string): string {
  const L: string[] = []
  L.push(`# Card Database Quality Audit — ${date}`)
  L.push('')
  L.push('Read-only audit produced by `npx tsx scripts/audit-cards.mts` against the live Turso deck. Every finding carries the card id so Phase 22 can fix cards in place by id (never delete+recreate — cascades wipe FSRS state + ReviewLog history).')
  L.push('')

  // ── Summary ──
  L.push('## Summary')
  L.push('')
  L.push('| Check class | Findings |')
  L.push('| --- | --- |')
  L.push(`| Total cards scanned | ${f.totalCards} |`)
  L.push(`| Blank-safety — zero-safe cards | ${f.blankSafety.zeroSafe.length} |`)
  L.push(`| Blank-safety — unsafe-first cards | ${f.blankSafety.unsafeFirst.length} |`)
  L.push(`| Blank-safety — sentences with targetForm not found | ${f.blankSafety.notFound.length} |`)
  L.push(`| Zero-sentence cards | ${f.zeroSentenceCards.length} |`)
  L.push(`| Romanization — flagged fronts | ${f.romanization.flaggedFronts.length} |`)
  L.push(`| Romanization — flagged sentences | ${f.romanization.flaggedSentences.length} |`)
  L.push(`| Distractor anomalies | ${f.distractorFindings.length} |`)
  L.push(`| normalizedFront inconsistencies | ${f.normalizedFrontMismatches.length} |`)
  L.push(`| Untrimmed fronts | ${f.untrimmedFronts.length} |`)
  L.push(`| Near-duplicate clusters | ${f.nearDuplicateClusters.length} |`)
  L.push(`| Stale components — cards affected | ${f.staleComponents.cardsAffected} |`)
  L.push(`| Stale components — total stale entries | ${f.staleComponents.totalStaleEntries} |`)
  L.push(`| Stale components — malformed JSON rows | ${f.staleComponents.malformedCards.length} |`)
  L.push('')

  // ── 1. Blank-safety violations (three labelled sub-lists) ──
  L.push('## Blank-safety violations')
  L.push('')
  L.push('Three labelled sub-lists — Phase 22 fix strategy differs per sub-class (reorder vs regenerate vs retire).')
  L.push('')
  L.push('### Zero-safe cards (no sentence is blank-safe — regenerate)')
  L.push('')
  if (f.blankSafety.zeroSafe.length === 0) {
    L.push('None found.')
  } else {
    for (const c of f.blankSafety.zeroSafe) L.push(refLine(c))
  }
  L.push('')
  L.push('### Unsafe-first cards (sentences[0] unsafe but a later one is safe — reorder orderIndex in place)')
  L.push('')
  if (f.blankSafety.unsafeFirst.length === 0) {
    L.push('None found.')
  } else {
    for (const c of f.blankSafety.unsafeFirst) L.push(refLine(c))
  }
  L.push('')
  L.push('### Sentences with targetForm not found (renders un-highlighted — fix or drop the sentence)')
  L.push('')
  if (f.blankSafety.notFound.length === 0) {
    L.push('None found.')
  } else {
    for (const e of f.blankSafety.notFound) {
      L.push(`- [${e.card.type}] front: "${e.card.front}" — id: ${e.card.id} — not-found sentence indices: ${e.indices.join(', ')}`)
    }
  }
  L.push('')

  // ── 2. Zero-sentence cards ──
  L.push('## Zero-sentence cards')
  L.push('')
  L.push('Flagged with hasLegacyCloze so Phase 22 can use legacy cloze data as a possible fix source.')
  L.push('')
  if (f.zeroSentenceCards.length === 0) {
    L.push('None found.')
  } else {
    for (const e of f.zeroSentenceCards) {
      L.push(`- [${e.card.type}] front: "${e.card.front}" — back: "${e.card.back}" — id: ${e.card.id} — hasLegacyCloze: ${e.hasLegacyCloze}`)
    }
  }
  L.push('')

  // ── 3. Romanization leakage (fronts and sentences separately) ──
  L.push('## Romanization leakage')
  L.push('')
  L.push('### Flagged fronts (Latin survives after normalizeFront strips the trailing gloss)')
  L.push('')
  if (f.romanization.flaggedFronts.length === 0) {
    L.push('None found.')
  } else {
    for (const c of f.romanization.flaggedFronts) L.push(refLine(c))
  }
  L.push('')
  L.push('### Flagged sentences (Latin in sentence korean — no gloss allowance there)')
  L.push('')
  if (f.romanization.flaggedSentences.length === 0) {
    L.push('None found.')
  } else {
    for (const e of f.romanization.flaggedSentences) {
      L.push(`- [${e.card.type}] front: "${e.card.front}" — id: ${e.card.id} — flagged sentence indices: ${e.indices.join(', ')}`)
    }
  }
  L.push('')

  // ── 4. Distractor anomalies (grouped by anomaly literal) ──
  L.push('## Distractor anomalies')
  L.push('')
  if (f.distractorFindings.length === 0) {
    L.push('None found.')
  } else {
    const byAnomaly = new Map<DistractorAnomaly, typeof f.distractorFindings>()
    for (const entry of f.distractorFindings) {
      for (const a of entry.anomalies) {
        if (!byAnomaly.has(a)) byAnomaly.set(a, [])
        byAnomaly.get(a)!.push(entry)
      }
    }
    const order: DistractorAnomaly[] = [
      'null', 'malformed-json', 'not-string-array',
      'count-mismatch', 'duplicate-entries', 'equals-back',
    ]
    for (const a of order) {
      const entries = byAnomaly.get(a)
      if (!entries || entries.length === 0) continue
      L.push(`### ${a} (${entries.length} cards)`)
      L.push('')
      for (const e of entries) {
        L.push(`- [${e.card.type}] front: "${e.card.front}" — back: "${e.card.back}" — id: ${e.card.id} — anomalies: ${e.anomalies.join(', ')}`)
      }
      L.push('')
    }
  }
  L.push('')

  // ── 5. normalizedFront inconsistencies (stored vs recomputed + untrimmed) ──
  L.push('## normalizedFront inconsistencies')
  L.push('')
  L.push('### Stored vs recomputed value')
  L.push('')
  if (f.normalizedFrontMismatches.length === 0) {
    L.push('None found.')
  } else {
    for (const e of f.normalizedFrontMismatches) {
      L.push(`- [${e.card.type}] front: "${e.card.front}" — id: ${e.card.id} — stored: "${e.stored}" — expected: "${e.expected}"`)
    }
  }
  L.push('')
  L.push('### Untrimmed fronts')
  L.push('')
  if (f.untrimmedFronts.length === 0) {
    L.push('None found.')
  } else {
    for (const c of f.untrimmedFronts) L.push(refLine(c))
  }
  L.push('')

  // ── 6. Near-duplicate clusters (find-duplicates.mjs echo format) ──
  L.push('## Near-duplicate clusters')
  L.push('')
  L.push('Grouped by superNormalize(normalizedFront); clusters of 2+ members, sorted by member count descending.')
  L.push('')
  if (f.nearDuplicateClusters.length === 0) {
    L.push('None found.')
  } else {
    for (const cluster of f.nearDuplicateClusters) {
      L.push(`### Fuzzy key: "${cluster.key}" (${cluster.members.length} cards)`)
      L.push('')
      for (const c of cluster.members) {
        L.push(`- [${c.type}] front: "${c.front}" — back: "${c.back}" — id: ${c.id}`)
      }
      L.push('')
    }
  }
  L.push('')

  // ── 7. Stale components (summary only — detailed view in retro-filter-cleanup.mts) ──
  L.push('## Stale components (summary)')
  L.push('')
  L.push('Counts only — run `npx tsx scripts/retro-filter-cleanup.mts` (dry-run default) for the per-card before/after view.')
  L.push('')
  L.push(`- Cards affected: ${f.staleComponents.cardsAffected}`)
  L.push(`- Total stale entries: ${f.staleComponents.totalStaleEntries}`)
  L.push(`- Malformed JSON rows: ${f.staleComponents.malformedCards.length}`)
  if (f.staleComponents.malformedCards.length > 0) {
    L.push('')
    L.push('Malformed cards (components JSON unparseable or non-array):')
    for (const c of f.staleComponents.malformedCards) L.push(refLine(c))
  }
  L.push('')

  return L.join('\n')
}

const markdown = renderMarkdown(findings, REPORT_DATE)

// ─── File write (directory does not exist yet — RESEARCH Pitfall 5) ───
fs.mkdirSync(REPORT_DIR, { recursive: true })
fs.writeFileSync(REPORT_PATH, markdown, 'utf8')
console.log(`Report written: ${REPORT_PATH}`)
console.log()

// ─── Console summary (=== section blocks, retro-filter-cleanup convention) ───
console.log('=== Blank-safety violations ===')
console.log(`  Zero-safe cards:               ${findings.blankSafety.zeroSafe.length}`)
console.log(`  Unsafe-first cards:            ${findings.blankSafety.unsafeFirst.length}`)
console.log(`  targetForm not found (cards):  ${findings.blankSafety.notFound.length}`)
console.log()

console.log('=== Zero-sentence cards ===')
console.log(`  Count:                         ${findings.zeroSentenceCards.length}`)
console.log()

console.log('=== Romanization leakage ===')
console.log(`  Flagged fronts:                ${findings.romanization.flaggedFronts.length}`)
console.log(`  Flagged sentences:             ${findings.romanization.flaggedSentences.length}`)
console.log()

console.log('=== Distractor anomalies ===')
console.log(`  Cards with anomalies:          ${findings.distractorFindings.length}`)
console.log()

console.log('=== normalizedFront inconsistencies ===')
console.log(`  Stored-vs-recomputed mismatch: ${findings.normalizedFrontMismatches.length}`)
console.log(`  Untrimmed fronts:              ${findings.untrimmedFronts.length}`)
console.log()

console.log('=== Near-duplicate clusters ===')
console.log(`  Clusters (2+ members):         ${findings.nearDuplicateClusters.length}`)
console.log()

console.log('=== Stale components (summary) ===')
console.log(`  Cards affected:                ${findings.staleComponents.cardsAffected}`)
console.log(`  Total stale entries:           ${findings.staleComponents.totalStaleEntries}`)
console.log(`  Malformed JSON rows:           ${findings.staleComponents.malformedCards.length}`)
console.log()

console.log('=== Summary ===')
console.log(`  Total cards scanned:           ${findings.totalCards}`)
console.log(`  Report path:                   ${REPORT_PATH}`)
console.log()

process.exit(0)
