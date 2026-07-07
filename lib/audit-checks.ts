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
