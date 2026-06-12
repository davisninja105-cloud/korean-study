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

/**
 * Returns the sentence with the first occurrence of targetForm replaced by "___".
 * Only call this after confirming sentenceMatch(...).safeToBlank === true.
 */
export function blankSentence(korean: string, targetForm: string): string {
  const idx = korean.indexOf(targetForm)
  if (idx === -1) return korean
  return korean.slice(0, idx) + '___' + korean.slice(idx + targetForm.length)
}
