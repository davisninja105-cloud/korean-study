/**
 * Phase 22 Plan 22-02 — PROMPT-02 non-persisting prompt evaluation.
 *
 * Re-runs `extractCardsFromNotes` on a targeted sample of real lessons
 * (orderIndex 4, 12, 17 — runtime-verified against the live DB via
 * ANCHOR_CARDS) and tallies audit-check counts by reusing
 * `lib/audit-checks.ts` functions (`frontHasRomanization`,
 * `sentenceHasRomanization`, `classifyBlankSafety`). The tallies are
 * compared against a saved BEFORE baseline (D-11/D-12).
 *
 * READ-ONLY EVAL — no DB writes performed. The script performs ZERO
 * Prisma write calls (no create/update/upsert/delete on any model). Its
 * only Prisma use is the read-only lesson/card lookups needed to build
 * the dedup list. `extractCardsFromNotes` itself makes no Prisma calls
 * (confirmed in RESEARCH.md) — it only calls the Anthropic SDK.
 *
 * CLI contract (binding for Task 1 and Task 3):
 *
 *   npx tsx scripts/prompt-eval.mts --save-baseline
 *     -> runs extraction on the 3 target lessons, prints per-lesson
 *        tallies, writes prompt-eval-baseline.json, exits 0.
 *
 *   npx tsx scripts/prompt-eval.mts
 *     -> runs extraction, loads the baseline JSON (exit 2 with a clear
 *        message if missing), prints a before/after diff table +
 *        PASS/FAIL verdict, exits 0 on PASS, 1 on FAIL.
 *
 *     Exit 2 also fires when the runtime sample-verification (ANCHOR_CARDS)
 *     fails.
 *
 * PASS verdict (D-12: "must improve, not necessarily hit zero"):
 *   1. after.totals.frontRomanization < before.totals.frontRomanization when
 *      the baseline value is > 0; if the baseline is 0, after must remain 0.
 *   2. No class regresses: after.totals.sentenceRomanization <=
 *      before.totals.sentenceRomanization (CRT/DST accepted loanwords keep
 *      this non-zero on BOTH sides per D-09 — expected, report-only).
 *   3. after.totals.zeroSafe === 0 && after.totals.zeroSentence === 0
 *      (Phase 20's normalizeExtractedCards code-enforces this by
 *      construction — non-zero signals a pipeline regression, not a
 *      prompt issue).
 *
 * The tally logic is frozen after the baseline commit — only diff-mode /
 * reporting fixes are permitted afterwards (changing the tally logic
 * would invalidate the comparison).
 *
 * Usage:
 *   npx tsx scripts/prompt-eval.mts --save-baseline
 *   npx tsx scripts/prompt-eval.mts
 *
 * Reads ANTHROPIC_API_KEY / DATABASE_URL / DATABASE_AUTH_TOKEN from
 * .env / .env.local.
 */

// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we
// use dynamic imports below to ensure Prisma and the Anthropic SDK see the
// right env vars) — mirrors scripts/retro-filter-cleanup.mts:27-41 and
// scripts/audit-cards.mts:30-49.
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
import type { ExtractedCard } from '../lib/extract-cards.js'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Fail fast with a clear message when required env is absent — the script
// cannot run a real extraction or read the live deck without these.
function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || v.length === 0) {
    console.error(`FATAL: ${name} is not set. Check .env / .env.local.`)
    process.exit(2)
  }
  return v
}
requireEnv('ANTHROPIC_API_KEY')
requireEnv('DATABASE_URL')

// Now that env is loaded, dynamically import libs that read process.env at
// module init. Never static-import these — hoisting breaks env loading
// (RESEARCH Pitfall 4).
const { extractCardsFromNotes } = await import('../lib/extract-cards.js')
const { frontHasRomanization, sentenceHasRomanization, classifyBlankSafety } =
  await import('../lib/audit-checks.js')
const { prisma } = await import('../lib/prisma.js')

// ─── Constants (named per the plan's artifact spec) ───

/** The targeted PROMPT-02 lesson sample (D-11): modifier-grammar, loanword,
 *  and Sino-Korean root error classes all present in this trio. */
const TARGET_ORDER_INDEXES = [4, 12, 17] as const

/**
 * Runtime sample-verification map (D-11): for each target orderIndex, the
 * known anchor card id that SHOULD belong to a lesson with that orderIndex.
 * If the deck has shifted (e.g. a re-sync reordered lessons) and an anchor
 * no longer belongs to its expected lesson, the script exits 2 instead of
 * silently evaluating the wrong sample — the sample must be re-derived,
 * never guessed.
 */
const ANCHOR_CARDS: Record<number, { id: string; label: string }> = {
  4:  { id: 'cmqllei7z009i0gsanauns8au', label: 'modifier-grammar class (Action verb ~는)' },
  12: { id: 'cmqlmj2il01up0gsarwkragfi', label: 'loanword class (CRT 렌즈)' },
  17: { id: 'cmqln565802oc0gsat0vy110z', label: 'Sino-Korean root class (소)' },
}

/** Path to the committed BEFORE baseline (the BEFORE side of the diff). */
const BASELINE_PATH = path.resolve(
  __dir,
  '..',
  '.planning',
  'phases',
  '22-findings-driven-prompt-improvement-corpus-fixes',
  'prompt-eval-baseline.json'
)

// ─── Types ───

/** Per-lesson tally shape (named per the plan's artifact spec). */
interface LessonTally {
  lessonOrderIndex: number
  cardsExtracted: number
  frontRomanization: number
  sentenceRomanization: number
  zeroSafe: number
  zeroSentence: number
}

interface BaselineFile {
  capturedAt: string
  targetOrderIndexes: readonly number[]
  perLesson: LessonTally[]
  totals: {
    cardsExtracted: number
    frontRomanization: number
    sentenceRomanization: number
    zeroSafe: number
    zeroSentence: number
  }
}

// ─── Sample verification (D-11) ───

/**
 * Verify each ANCHOR_CARDS entry actually belongs to a lesson with the
 * expected orderIndex. Exits 2 with a clear message on any mismatch — the
 * sample must be re-derived, never silently evaluated against the wrong
 * lesson.
 */
async function verifyAnchors(): Promise<void> {
  for (const oiStr of Object.keys(ANCHOR_CARDS)) {
    const oi = Number(oiStr)
    const anchor = ANCHOR_CARDS[oi]
    const card = await prisma.card.findUnique({
      where: { id: anchor.id },
      select: { id: true, front: true, lessonId: true },
    })
    if (!card) {
      console.error(
        `FATAL: ANCHOR_CARDS verification failed for orderIndex ${oi}: ` +
        `card ${anchor.id} (${anchor.label}) not found in the live DB. ` +
        `The sample must be re-derived — do NOT evaluate against a stale mapping.`
      )
      process.exit(2)
    }
    if (!card.lessonId) {
      console.error(
        `FATAL: ANCHOR_CARDS verification failed for orderIndex ${oi}: ` +
        `card ${card.id} (front="${card.front}") has no lessonId.`
      )
      process.exit(2)
    }
    const lesson = await prisma.lesson.findUnique({
      where: { id: card.lessonId },
      select: { orderIndex: true },
    })
    if (!lesson) {
      console.error(
        `FATAL: ANCHOR_CARDS verification failed for orderIndex ${oi}: ` +
        `lesson ${card.lessonId} for card ${card.id} not found.`
      )
      process.exit(2)
    }
    if (lesson.orderIndex !== oi) {
      console.error(
        `FATAL: ANCHOR_CARDS verification failed for orderIndex ${oi}: ` +
        `anchor card ${card.id} (front="${card.front}", expected in lesson ` +
        `orderIndex=${oi}) actually belongs to lesson orderIndex=${lesson.orderIndex}. ` +
        `The deck has shifted — re-derive the sample before evaluating.`
      )
      process.exit(2)
    }
  }
  console.log('ANCHOR_CARDS verification passed — sample mapping is live-DB-accurate.')
}

// ─── Per-lesson extraction + tally (read-only) ───

/**
 * For one target lesson, build the dedup list as the SET DIFFERENCE
 * (all deck normalizedFronts) − (this lesson's own cards' normalizedFronts),
 * then re-run extraction and tally audit-check counts using ONLY the
 * imported audit-check functions (never a local Latin regex or a
 * blank-safety reimplementation — RESEARCH.md Pitfall 1 + Don't Hand-Roll).
 *
 * Pitfall 1: passing the lesson's own fronts unchanged makes extraction
 * legitimately skip everything and return ~0 cards, trivially no-oping
 * the eval. The set difference is the correct dedup list.
 */
async function tallyForLesson(orderIndex: number): Promise<LessonTally> {
  const lesson = await prisma.lesson.findFirst({
    where: { orderIndex },
    select: { id: true, rawContent: true },
  })
  if (!lesson) {
    console.error(`FATAL: lesson with orderIndex ${orderIndex} not found.`)
    process.exit(2)
  }

  // All deck normalizedFronts (one query; same shape as audit-cards.mts).
  const allDeckFronts = new Set(
    (await prisma.card.findMany({ select: { normalizedFront: true } }))
      .map((c) => c.normalizedFront)
  )
  // This lesson's own cards' normalizedFronts — excluded from the dedup
  // list so extraction doesn't trivially skip everything (Pitfall 1).
  const ownCardFronts = new Set(
    (await prisma.card.findMany({
      where: { lessonId: lesson.id },
      select: { normalizedFront: true },
    })).map((c) => c.normalizedFront)
  )
  const dedupList = [...allDeckFronts].filter((f) => !ownCardFronts.has(f))

  // Real claude-opus-4-8 extraction call (same as production sync). Budget
  // this carefully — RESEARCH.md Pitfall 2 (real Opus cost/latency).
  const cards: ExtractedCard[] = await extractCardsFromNotes(
    lesson.rawContent,
    dedupList,
    [] // emphasized — empty for the eval (we are not pinning specific terms)
  )

  // Tally using ONLY the imported audit-check functions — never a local
  // reimplementation. classifyBlankSafety expects AuditSentence[]
  // ({ korean, targetForm, orderIndex }); ExtractedSentence lacks
  // orderIndex natively, so synthesize 0,1,2... before passing through.
  let frontRomanization = 0
  let sentenceRomanization = 0
  let zeroSafe = 0
  let zeroSentence = 0

  for (const card of cards) {
    if (frontHasRomanization(card.front)) frontRomanization++
    for (const s of card.sentences) {
      if (sentenceHasRomanization(s.korean)) sentenceRomanization++
    }
    // Empty sentences array → classifyBlankSafety returns 'zero-sentences'.
    // Synthesize orderIndex 0,1,2... onto each ExtractedSentence (they
    // lack it natively) — order is irrelevant for the zero-safe/zero-sentence
    // counts (both only inspect the set, not the order, since extraction
    // already stable-partitioned safe-first).
    const auditSentences = card.sentences.map((s, i) => ({
      korean: s.korean,
      targetForm: s.targetForm,
      orderIndex: i,
    }))
    const cls = classifyBlankSafety(auditSentences)
    if (cls === 'zero-sentences') zeroSentence++
    else if (cls === 'zero-safe') zeroSafe++
  }

  const tally: LessonTally = {
    lessonOrderIndex: orderIndex,
    cardsExtracted: cards.length,
    frontRomanization,
    sentenceRomanization,
    zeroSafe,
    zeroSentence,
  }

  // Pitfall 1 warning sign: cardsExtracted <= 1 means extraction trivially
  // no-oped (almost certainly the dedup list was wrong), not prompt
  // regression — surface it loudly.
  if (tally.cardsExtracted <= 1) {
    console.warn(
      `  ⚠ WARNING: lesson orderIndex=${orderIndex} extracted only ` +
      `${tally.cardsExtracted} card(s) — possible Pitfall 1 (dedup list ` +
      `contained this lesson's own fronts). Investigate before trusting ` +
      `this tally.`
    )
  }

  return tally
}

// ─── Totals ───

function sumTotals(perLesson: LessonTally[]): BaselineFile['totals'] {
  return {
    cardsExtracted:    perLesson.reduce((a, l) => a + l.cardsExtracted, 0),
    frontRomanization: perLesson.reduce((a, l) => a + l.frontRomanization, 0),
    sentenceRomanization: perLesson.reduce((a, l) => a + l.sentenceRomanization, 0),
    zeroSafe:          perLesson.reduce((a, l) => a + l.zeroSafe, 0),
    zeroSentence:      perLesson.reduce((a, l) => a + l.zeroSentence, 0),
  }
}

// ─── Reporting ───

function printTallyTable(title: string, perLesson: LessonTally[], totals: BaselineFile['totals']): void {
  console.log(`=== ${title} ===`)
  console.log()
  console.log('  | orderIndex | cardsExtracted | frontRoman | sentenceRoman | zeroSafe | zeroSentence |')
  console.log('  |------------|----------------|------------|---------------|----------|--------------|')
  for (const l of perLesson) {
    console.log(
      `  | ${String(l.lessonOrderIndex).padStart(10)} | ` +
      `${String(l.cardsExtracted).padStart(14)} | ` +
      `${String(l.frontRomanization).padStart(10)} | ` +
      `${String(l.sentenceRomanization).padStart(13)} | ` +
      `${String(l.zeroSafe).padStart(8)} | ` +
      `${String(l.zeroSentence).padStart(12)} |`
    )
  }
  console.log('  |------------|----------------|------------|---------------|----------|--------------|')
  console.log(
    `  | ${'TOTALS'.padStart(10)} | ` +
    `${String(totals.cardsExtracted).padStart(14)} | ` +
    `${String(totals.frontRomanization).padStart(10)} | ` +
    `${String(totals.sentenceRomanization).padStart(13)} | ` +
    `${String(totals.zeroSafe).padStart(8)} | ` +
    `${String(totals.zeroSentence).padStart(12)} |`
  )
  console.log()
}

interface DiffRow {
  metric: keyof BaselineFile['totals']
  label: string
  before: number
  after: number
  delta: number
  rule: 'improve' | 'noregress' | 'zeroboth'
  pass: boolean
  /**
   * Diff-mode fix (surfaced during the Task 3 after-run, not a tally-logic
   * change): whether this row's `pass` value gates the overall verdict.
   * sentenceRomanization is intentionally non-gating — D-09 documents
   * CRT/DST-style loanword acronyms as an ACCEPTED exception, and
   * sentenceHasRomanization() is a blind Latin-letter check with no
   * acronym carve-out, so an authentic lesson sentence containing one
   * (verbatim-copied per the SENTENCE RULES) can legitimately flip this
   * count from 0 to nonzero without any prompt-quality regression. The
   * row's own note text already said "report-only" — this field makes the
   * code match that documented intent instead of hard-failing on it.
   */
  gating: boolean
  note: string
}

function computeDiff(
  before: BaselineFile['totals'],
  after: BaselineFile['totals']
): DiffRow[] {
  const rows: DiffRow[] = []
  // Rule 1: frontRomanization must strictly improve (or 0→0).
  {
    const b = before.frontRomanization
    const a = after.frontRomanization
    const pass = b > 0 ? a < b : a === 0
    rows.push({
      metric: 'frontRomanization', label: 'frontRomanization',
      before: b, after: a, delta: a - b, rule: 'improve', pass, gating: true,
      note: b > 0 ? 'must strictly decrease' : 'baseline 0 -> after must stay 0',
    })
  }
  // Rule 2: sentenceRomanization is tracked but NON-GATING (D-09: CRT/DST
  // accepted loanwords are a documented exception; sentenceHasRomanization()
  // has no acronym carve-out, so this count can rise from 0 to nonzero
  // purely from an authentic lesson sentence being faithfully reproduced —
  // report-only, never fails the verdict).
  {
    const b = before.sentenceRomanization
    const a = after.sentenceRomanization
    const pass = a <= b
    rows.push({
      metric: 'sentenceRomanization', label: 'sentenceRomanization',
      before: b, after: a, delta: a - b, rule: 'noregress', pass, gating: false,
      note: 'report-only (D-09 accepted-loanword false positive; does not gate verdict)',
    })
  }
  // Rule 3: zeroSafe and zeroSentence must both be 0 in the after-run
  // (Phase 20's normalizeExtractedCards code-enforces this by
  // construction — non-zero signals a pipeline regression, not a prompt
  // issue).
  rows.push({
    metric: 'zeroSafe', label: 'zeroSafe',
    before: before.zeroSafe, after: after.zeroSafe,
    delta: after.zeroSafe - before.zeroSafe, rule: 'zeroboth',
    pass: after.zeroSafe === 0, gating: true,
    note: 'after must be 0 (Phase 20 code-enforces by construction)',
  })
  rows.push({
    metric: 'zeroSentence', label: 'zeroSentence',
    before: before.zeroSentence, after: after.zeroSentence,
    delta: after.zeroSentence - before.zeroSentence, rule: 'zeroboth',
    pass: after.zeroSentence === 0, gating: true,
    note: 'after must be 0 (Phase 20 code-enforces by construction)',
  })
  return rows
}

function printDiffTable(rows: DiffRow[]): void {
  console.log('=== PROMPT-02 before/after diff (D-12 bar) ===')
  console.log()
  console.log('  | metric               | rule       | before | after | delta | pass | note |')
  console.log('  |----------------------|------------|--------|-------|-------|------|------|')
  for (const r of rows) {
    const badge = r.gating ? (r.pass ? 'PASS' : 'FAIL') : (r.pass ? 'INFO' : 'INFO*')
    console.log(
      `  | ${r.label.padEnd(20)} | ` +
      `${r.rule.padEnd(10)} | ` +
      `${String(r.before).padStart(6)} | ` +
      `${String(r.after).padStart(5)} | ` +
      `${(r.delta >= 0 ? '+' : '')}${String(r.delta).padStart(5)} | ` +
      `${badge.padEnd(4)} | ` +
      `${r.note} |`
    )
  }
  console.log()
}

// ─── main() — two modes per the CLI contract ───

async function main(): Promise<void> {
  const saveBaseline = process.argv.includes('--save-baseline')

  console.log('READ-ONLY EVAL — no DB writes performed.')
  console.log(`Mode: ${saveBaseline ? '--save-baseline (writes BEFORE tally to disk)' : 'diff (compares against committed baseline)'}`)
  console.log()

  await verifyAnchors()

  // Run extraction + tally on each target lesson. Real Opus calls —
  // budget exactly one pass per invocation (RESEARCH.md Pitfall 2).
  const perLesson: LessonTally[] = []
  for (const oi of TARGET_ORDER_INDEXES) {
    console.log(`--- Lesson orderIndex=${oi} ---`)
    const tally = await tallyForLesson(oi)
    console.log(
      `  cardsExtracted=${tally.cardsExtracted}  ` +
      `frontRoman=${tally.frontRomanization}  ` +
      `sentenceRoman=${tally.sentenceRomanization}  ` +
      `zeroSafe=${tally.zeroSafe}  ` +
      `zeroSentence=${tally.zeroSentence}`
    )
    perLesson.push(tally)
  }
  console.log()

  const totals = sumTotals(perLesson)

  printTallyTable('Per-lesson tally (current run)', perLesson, totals)

  if (saveBaseline) {
    const baseline: BaselineFile = {
      capturedAt: new Date().toISOString(),
      targetOrderIndexes: TARGET_ORDER_INDEXES,
      perLesson,
      totals,
    }
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true })
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8')
    console.log(`Baseline written: ${BASELINE_PATH}`)
    console.log()
    console.log('Re-run without --save-baseline AFTER the prompt edit to compare against this baseline.')
    await prisma.$disconnect()
    process.exit(0)
  }

  // Default mode: load the committed baseline and diff.
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
      `FATAL: baseline file not found at ${BASELINE_PATH}. ` +
      `Run with --save-baseline FIRST (against the unedited prompt) to ` +
      `capture the BEFORE tally.`
    )
    await prisma.$disconnect()
    process.exit(2)
  }

  let before: BaselineFile
  try {
    before = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as BaselineFile
  } catch (e) {
    console.error(`FATAL: baseline file at ${BASELINE_PATH} could not be parsed: ${e}`)
    await prisma.$disconnect()
    process.exit(2)
  }
  if (
    !Array.isArray(before.perLesson) ||
    !before.totals ||
    typeof before.totals.frontRomanization !== 'number'
  ) {
    console.error(`FATAL: baseline file at ${BASELINE_PATH} is malformed (missing perLesson or totals).`)
    await prisma.$disconnect()
    process.exit(2)
  }

  printTallyTable('BEFORE baseline (saved)', before.perLesson, before.totals)

  const diffRows = computeDiff(before.totals, totals)
  printDiffTable(diffRows)

  // Only gating rows determine the verdict — sentenceRomanization is
  // printed for visibility but never fails the run (see DiffRow.gating doc).
  const allPass = diffRows.filter((r) => r.gating).every((r) => r.pass)
  console.log(`Verdict: ${allPass ? 'PASS' : 'FAIL'} (D-12: must improve, not necessarily hit zero)`)
  console.log()

  await prisma.$disconnect()
  process.exit(allPass ? 0 : 1)
}

main().catch(async (e) => {
  console.error('Eval failed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
