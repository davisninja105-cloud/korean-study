/**
 * Pure helper — single source of truth for locating a targetForm substring
 * inside a Korean sentence.
 *
 * Used by:
 *  - components/HighlightedSentence.tsx   (render highlighting)
 *  - components/StudySession.tsx          (fill-blank blanking + Recall front)
 *  - components/CardEditor.tsx            (live preview + mismatch warning)
 *
 * No hooks, no side-effects — safe to call anywhere, including render.
 */

export interface MatchResult {
  /** targetForm was found verbatim in korean */
  found: boolean
  /** Index of the first occurrence; -1 if not found */
  index: number
  /**
   * Whether it is safe to blank the target for fill-in-the-blank / Recall mode.
   * false when:
   *   - targetForm.length <= 1  (single Korean syllable → matches inside other words / particles)
   *   - targetForm occurs more than once in korean (ambiguous which to blank)
   *   - not found
   */
  safeToBlank: boolean
}

export function sentenceMatch(korean: string, targetForm: string): MatchResult {
  if (!targetForm || !korean) {
    return { found: false, index: -1, safeToBlank: false }
  }

  const firstIndex = korean.indexOf(targetForm)
  if (firstIndex === -1) {
    return { found: false, index: -1, safeToBlank: false }
  }

  // Single Korean syllable / character — matches too broadly (particles, inside words).
  if (targetForm.length <= 1) {
    return { found: true, index: firstIndex, safeToBlank: false }
  }

  // Multiple occurrences — can't reliably choose which to blank.
  const secondIndex = korean.indexOf(targetForm, firstIndex + 1)
  if (secondIndex !== -1) {
    return { found: true, index: firstIndex, safeToBlank: false }
  }

  return { found: true, index: firstIndex, safeToBlank: true }
}

// Multi-character particles (조사). These are unambiguous — when a word ends in
// 에서 / 부터 / 으로 it really is noun + particle — so they may split off even a
// single-syllable stem (집에서 → 집 + 에서). Longest-first so 에게서 wins over 에게.
const PARTICLES_MULTI = [
  '에게서', '한테서', '으로서', '으로써',
  '에서', '에게', '한테', '에다', '부터', '까지', '처럼', '보다',
  '마다', '밖에', '이나', '라도', '으로', '라고', '께서',
]

// Single-character case markers. These collide with word-internal syllables and
// verb endings (없이, 같이, 라는, 가는), so they only split off a 2+ syllable stem.
// Auxiliary 도 / 만 / 나 are intentionally excluded — they look identical to the
// common connective endings 먹어도 / 하지만 / 그러나.
const PARTICLES_SINGLE = ['은', '는', '이', '가', '을', '를', '에', '와', '과', '의', '로', '께']

/**
 * Splits a target form into { stem, particle } by detecting a trailing particle,
 * for grammar-card structure cues. Conservative on purpose: it would rather
 * under-split (return particle '' → highlight the whole form) than show a wrong
 * morpheme boundary. A single-syllable stem before a one-char particle (없이,
 * 라는) is treated as one unit, not noun + particle. Pure; safe in render.
 */
export function splitParticle(targetForm: string): { stem: string; particle: string } {
  for (const p of PARTICLES_MULTI) {
    if (targetForm.length > p.length && targetForm.endsWith(p)) {
      return { stem: targetForm.slice(0, -p.length), particle: p }
    }
  }
  // Single-char particle requires a 2+ syllable stem (targetForm length >= 3).
  if (targetForm.length >= 3) {
    for (const p of PARTICLES_SINGLE) {
      if (targetForm.endsWith(p)) {
        return { stem: targetForm.slice(0, -1), particle: p }
      }
    }
  }
  return { stem: targetForm, particle: '' }
}

/**
 * Returns the sentence with the first occurrence of targetForm replaced by "___".
 * Only call this after confirming sentenceMatch(...).safeToBlank === true.
 */
export function blankSentence(korean: string, targetForm: string): string {
  const idx = korean.indexOf(targetForm)
  if (idx === -1) return korean
  return korean.slice(0, idx) + '___' + korean.slice(idx + targetForm.length)
}
