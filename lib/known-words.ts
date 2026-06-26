/**
 * Pure helper — single source of truth for counting unknown words in a
 * Korean sentence relative to a known-lemma set.
 *
 * Used by:
 *  - app/api/cards/due/route.ts  (annotate each sentence with unknownCount)
 *
 * Resolution order per whitespace token:
 *  1. normalizeFront(token)  → if in knownLemmas → known
 *  2. splitParticle(token).stem → normalize stem → if in knownLemmas → known
 *  3. Neither matched → unknown (count +1)
 *  Skip tokens that belong to targetForm (the card's own word is not counted).
 *
 * Tokenization is imperfect for Korean; this is a ranking signal only.
 *
 * Pure — no Date.now(), Math.random(), or side effects.
 * Safe to call in server AND client contexts.
 */

import { normalizeFront } from './card-key'
import { splitParticle } from './sentence-match'

/**
 * Count the number of whitespace-tokenized words in `korean` that cannot be
 * resolved to the `knownLemmas` set.
 *
 * @param korean     The full Korean sentence string to scan.
 * @param targetForm The card's own target form — tokens belonging to the target
 *                   are skipped entirely (never counted as unknown, per D-05).
 * @param knownLemmas  Set of normalizedFront strings representing cards the
 *                   learner has mastered (FSRS state ≥ 2).
 * @returns Number of unknown tokens (0 for empty input).
 */
export function countUnknownWords(
  korean: string,
  targetForm: string,
  knownLemmas: Set<string>
): number {
  if (!korean) return 0

  const tokens = korean.split(/\s+/).filter(Boolean)
  let unknownCount = 0

  for (const token of tokens) {
    // Skip the card's own target form (D-05: never count the word being learned).
    if (token === targetForm) continue

    // Resolution step 1: normalize the token and look up directly.
    const normalized = normalizeFront(token)
    if (knownLemmas.has(normalized)) continue

    // Resolution step 2: particle-stem fallback — strip a trailing particle and
    // check whether the bare stem is known. splitParticle is conservative: it
    // only splits when it can be confident about the morpheme boundary.
    const { stem } = splitParticle(token)
    if (stem && stem !== token) {
      const normalizedStem = normalizeFront(stem)
      if (knownLemmas.has(normalizedStem)) continue
    }

    // Neither direct match nor stem match — this token is unknown.
    unknownCount++
  }

  return unknownCount
}
