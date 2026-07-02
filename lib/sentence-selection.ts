/**
 * Pure helper — single source of truth for selecting which example sentence to
 * show for a card during study.
 *
 * Algorithm:
 *   1. Pick the least-unknown tier: sentences with the minimum `unknownCount`
 *      (missing counts as Infinity, i.e. never the tier pick unless everything
 *      ties).
 *   2. Tie-break within the tier by a per-card FNV-1a hash rotation that varies
 *      with review count: `candidates[(hashStr(cardId) + reps) % candidates.length]`.
 *      This keeps a card's chosen sentence stable within a session but lets it
 *      drift across reviews as reps grow, so the learner eventually sees every
 *      example once the words are known.
 *   3. Blank-safety override: when `needsBlank` is true (Recall flashcard /
 *      fill-blank) and the tier pick is NOT safe to blank (single-syllable
 *      target, or target appears more than once), fall back to the first
 *      blank-safe sentence in the array. If none is safe, gracefully degrade
 *      to the tier pick rather than hiding the sentence entirely.
 *
 * Used by:
 *  - components/StudySession.tsx          (the sentence-selection `useMemo`)
 *  - components/StudySession.tsx          (mcOptions distractor seeding —
 *                                          imports `hashStr` only)
 *
 * Pure — no `Date.now()`/`Math.random()`/no-arg `new Date()`; safe to call
 * anywhere, including render or inside a `useMemo`.
 */

import { sentenceMatch } from './sentence-match'

/**
 * Minimal structural type the algorithm reads. Kept deliberately narrower than
 * the full `SentenceDTO` so this pure module stays decoupled from the DTO
 * layer's evolution — mirrors `lib/sequence.ts`'s `SeqCard` convention.
 */
export interface SelectableSentence {
  korean: string
  targetForm: string
  unknownCount?: number
}

/**
 * FNV-1a hash for a string → unsigned 32-bit int. Non-cryptographic; used only
 * for deterministic UI variety (per-card sentence rotation and multiple-choice
 * distractor seeding), not as a security control.
 *
 * Moved here from `components/StudySession.tsx` so it has a single definition
 * shared by both the sentence-selection tie-break and `mcOptions`' distractor
 * seeding. No `Math.random()` / `Date.now()` — purity-safe in render.
 */
export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

/**
 * Picks which sentence to show for a card. Returns the chosen index, or `-1`
 * if the sentence array is empty. See the module header for the full algorithm.
 *
 * Pure — safe to call in render or memoize with `useMemo`.
 */
export function selectSentence(
  sentences: SelectableSentence[],
  cardId: string,
  reps: number,
  needsBlank: boolean,
): number {
  if (sentences.length === 0) return -1

  // Least-unknown tier pick (Exposure and non-blank modes).
  const minUnknown = Math.min(...sentences.map((s) => s.unknownCount ?? Infinity))
  const candidates = sentences
    .map((_, i) => i)
    .filter((i) => (sentences[i].unknownCount ?? Infinity) === minUnknown)
  const tierIdx = candidates[(hashStr(cardId) + reps) % candidates.length]

  if (!needsBlank) return tierIdx

  // Blank-safe override: if the tier pick is unsafe, find first safe sentence.
  if (sentenceMatch(sentences[tierIdx].korean, sentences[tierIdx].targetForm).safeToBlank) {
    return tierIdx
  }
  const safeIdx = sentences.findIndex(
    (s) => sentenceMatch(s.korean, s.targetForm).safeToBlank
  )
  return safeIdx >= 0 ? safeIdx : tierIdx  // graceful degrade: no safe sentence
}
