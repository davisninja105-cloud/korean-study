/**
 * Pure audit-check module — single source of truth for Phase 21 card-database
 * quality audit predicates.
 *
 * Contract: every check class delegates to a production helper rather than
 * reimplementing its rules, so the audit's definition of "violation" is
 * structurally identical to what the production write-path
 * (`normalizeExtractedCards` in lib/extract-cards.ts) enforces at extraction
 * time. The audit measures the legacy debt the post-Phase-20 hardening
 * prevents; it must NOT diverge from that truth.
 *
 * Purity: plain data in, findings out. No Prisma, no fs, no Node builtins, no
 * Anthropic SDK. Safe server AND client. The Wave 2 script
 * (scripts/audit-cards.mts) owns ALL I/O; this module only classifies.
 *
 * Helper delegation map (never reimplement these):
 *  - sentenceMatch(korean, targetForm).safeToBlank  → blank-safety authority
 *  - normalizeFront(front)                          → gloss-stripping + dedup key
 *  - filterComponents(raw, deckSet)                 → stale-components count
 *  (splitParticle is reused transitively through filterComponents' stem step)
 *
 * Used by:
 *  - scripts/audit-cards.mts  (Plan 21-02, the Wave 2 read-only report script)
 *  - tests/audit-checks.test.ts (Vitest coverage for every exported function)
 *
 * Never import from lib/extract-cards.ts — it pulls the Anthropic SDK at
 * module top (RESEARCH.md anti-pattern). Import the four pure helpers from
 * their own files instead.
 */

import { sentenceMatch } from './sentence-match'
import { normalizeFront } from './card-key'

// ─── Shared plain-data types (used by every task in this plan + Wave 2) ───

/**
 * One example sentence on a card, as the audit sees it. Callers MUST pre-sort
 * ascending by orderIndex before passing to any function in this module
 * (matches the production query shape `orderBy: { orderIndex: 'asc' }`).
 */
export interface AuditSentence {
  korean: string
  targetForm: string
  orderIndex: number
}

/**
 * A card row as the audit sees it — plain data only, no Prisma types.
 * `components` and `distractors` are the RAW nullable JSON-string columns,
 * unparsed; the audit module parses them inside try/catch so malformed rows
 * become findings, never crashes (V5 input validation, ASVS L1).
 */
export interface AuditCardInput {
  id: string
  type: string
  front: string
  back: string
  notes: string | null
  normalizedFront: string
  /** Raw JSON-string column, unparsed (may be null or malformed). */
  components: string | null
  /** Raw JSON-string column, unparsed (may be null or malformed). */
  distractors: string | null
  /** Deprecated legacy field — surfaced as a possible fix source for zero-sentence cards. */
  clozeSentence: string | null
  lessonId: string | null
  /** Pre-sorted ascending by orderIndex by the caller. */
  sentences: AuditSentence[]
}

/**
 * The echo shape every finding carries. IDs are mandatory so Phase 22 can fix
 * cards in place by id (STATE.md v1.5 hard rule: never delete+recreate,
 * which would cascade-wipe FSRS state + ReviewLog history).
 */
export interface CardRef {
  id: string
  type: string
  front: string
  back: string
}

/**
 * The four blank-safety outcome classes. The three non-ok outcomes correspond
 * to Phase 22's three distinct fix strategies (RESEARCH Pitfall 2):
 *  - zero-sentences → regenerate sentences or retire the card
 *  - zero-safe       → regenerate sentences (no reorder can rescue)
 *  - unsafe-first    → safe-first reorder in place by swapping orderIndex
 */
export type BlankSafetyClass = 'zero-sentences' | 'zero-safe' | 'unsafe-first' | 'ok'

// ─── Check class 1: blank-safety classification ───

/**
 * Classify a card's sentence set by blank-safety, delegating every decision
 * to `sentenceMatch(korean, targetForm).safeToBlank` (lib/sentence-match.ts).
 *
 * The three non-ok outcomes map onto Phase 22's three distinct fix strategies,
 * which is why they must stay separate classes (RESEARCH Pitfall 2):
 *  - 'zero-sentences' → no sentences to classify (regenerate or retire)
 *  - 'zero-safe'       → sentences exist but none are safe (regenerate)
 *  - 'unsafe-first'    → sentences[0] unsafe but a later one is safe (reorder)
 *  - 'ok'              → sentences[0] is safe (the post-Phase-20 invariant)
 *
 * @param sentences Pre-sorted ascending by orderIndex by the caller.
 * @returns The BlankSafetyClass label for this card.
 */
export function classifyBlankSafety(sentences: AuditSentence[]): BlankSafetyClass {
  if (sentences.length === 0) return 'zero-sentences'

  // Delegate every safeToBlank decision to the production predicate — never
  // reimplement the length<=1 / multi-occurrence / not-found rules here.
  const results = sentences.map((s) => sentenceMatch(s.korean, s.targetForm))

  if (!results.some((r) => r.safeToBlank)) return 'zero-safe'
  if (!results[0].safeToBlank) return 'unsafe-first'
  return 'ok'
}

/**
 * Indices of sentences whose targetForm does NOT appear verbatim in korean
 * (sentenceMatch().found === false). These sentences render un-highlighted in
 * the UI and fill-blank has no answer — reported as their own blank-safety
 * sub-class so Phase 22 can target them by id+orderIndex.
 *
 * @param sentences Pre-sorted ascending by orderIndex by the caller.
 * @returns Array of indices (into the input array) where the target was not found.
 */
export function notFoundSentenceIndices(sentences: AuditSentence[]): number[] {
  const indices: number[] = []
  sentences.forEach((s, i) => {
    if (!sentenceMatch(s.korean, s.targetForm).found) indices.push(i)
  })
  return indices
}

// ─── Check class 3: romanization leakage (grounded in normalizeFront regexes) ───

// Same Latin-alphabet character class normalizeFront uses for gloss detection
// (lib/card-key.ts). Reused here so the audit's definition of "Latin letter"
// is structurally identical to what the dedup key treats as a gloss.
const LATIN = /[A-Za-z]/

/**
 * Whether a card front leaks Latin-letter romanization, gloss-safe.
 *
 * Delegates gloss stripping to `normalizeFront(front)` (lib/card-key.ts): the
 * trailing English clarifying gloss (e.g. "(direction particle)") is removed
 * first, so any Latin that survives the production helper IS leakage.
 *
 * Scope boundary (documented limitation, RESEARCH Pitfall 3): a trailing ASCII
 * paren group is never flagged even if it contains romanization, because the
 * heuristic cannot distinguish an English gloss from trailing-paren
 * romanization. This matches normalizeFront's intentional design — the gloss
 * allowance is the price of readable grammar-pattern fronts.
 *
 * @param front Raw card front string.
 * @returns true iff Latin letters survive after normalizeFront strips any gloss.
 */
export function frontHasRomanization(front: string): boolean {
  return LATIN.test(normalizeFront(front))
}

/**
 * Whether a sentence korean field leaks Latin-letter romanization.
 *
 * Sentences have NO gloss allowance — the prompt bans Latin in sentence
 * korean entirely — so the LATIN test runs on the raw string. Any ASCII letter
 * is leakage.
 *
 * @param korean Raw sentence korean string.
 * @returns true iff the korean contains any Latin letter.
 */
export function sentenceHasRomanization(korean: string): boolean {
  return LATIN.test(korean)
}

// ─── Check class 4: distractor-count anomalies ───

/**
 * The six distractor anomaly literals. Each corresponds to a distinct shape
 * the extraction prompt forbids but stored legacy rows may hold:
 *  - 'null'              : column is null (prompt demands exactly 3)
 *  - 'malformed-json'    : JSON.parse fails OR parses to a non-array
 *  - 'not-string-array'  : an entry is not a string (prompt demands English meanings)
 *  - 'count-mismatch'    : parsed length is not exactly 3 (both under AND over)
 *  - 'duplicate-entries' : two entries are the same string
 *  - 'equals-back'       : an entry strictly equals the card's back (the answer)
 */
export type DistractorAnomaly =
  | 'null'
  | 'malformed-json'
  | 'not-string-array'
  | 'count-mismatch'
  | 'duplicate-entries'
  | 'equals-back'

/**
 * Classify every anomaly present in a distractors JSON column.
 *
 * Grounding: the extraction prompt demands EXACTLY 3 plausible-but-wrong
 * English meanings; Phase 20 added a console.warn when < 3 but persists anyway
 * (IN-01); components/StudySession.tsx parses the JSON with try/catch → [] on
 * malformed and pads/slices to 3 at render. Stored legacy rows can hold any
 * shape (RESEARCH Pitfall 6), so this function reports every applicable
 * anomaly without throwing on malformed input.
 *
 * Rules (empty array means healthy):
 *  - null column → ['null'] alone (cannot inspect what isn't there)
 *  - JSON.parse failure OR non-array parse → ['malformed-json'] alone
 *  - otherwise accumulate ALL that apply:
 *      • any non-string entry → 'not-string-array'
 *      • parsed length !== 3  → 'count-mismatch' (both directions)
 *      • any exact-string repeat → 'duplicate-entries'
 *      • any entry strictly === back → 'equals-back'
 *
 * @param distractors Raw nullable JSON-string column value (untrusted).
 * @param back        The card's back (correct answer) — used for the equals-back check.
 * @returns Array of every anomaly literal present (empty = healthy).
 */
export function checkDistractors(
  distractors: string | null,
  back: string
): DistractorAnomaly[] {
  if (distractors === null) return ['null']

  let parsed: unknown
  try {
    parsed = JSON.parse(distractors)
  } catch {
    return ['malformed-json']
  }
  if (!Array.isArray(parsed)) return ['malformed-json']

  const anomalies: DistractorAnomaly[] = []

  // any non-string entry → 'not-string-array'
  if (parsed.some((entry) => typeof entry !== 'string')) {
    anomalies.push('not-string-array')
  }

  // parsed length !== 3 → 'count-mismatch' (both under AND over)
  if (parsed.length !== 3) {
    anomalies.push('count-mismatch')
  }

  // any exact-string repeat → 'duplicate-entries' (string duplicates only;
  // non-string duplicates are already covered by 'not-string-array')
  const seenStrings = new Set<string>()
  for (const entry of parsed) {
    if (typeof entry === 'string') {
      if (seenStrings.has(entry)) {
        anomalies.push('duplicate-entries')
        break // report once, not once per repeat
      }
      seenStrings.add(entry)
    }
  }

  // any entry strictly === back → 'equals-back'
  if (parsed.some((entry) => entry === back)) {
    anomalies.push('equals-back')
  }

  return anomalies
}
