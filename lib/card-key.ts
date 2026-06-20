/**
 * Pure dedup-key helper — single source of truth for "are two card fronts
 * the same item?"
 *
 * Used by:
 *  - lib/extract-cards.ts   (normalizer, to populate normalizedFront)
 *  - app/api/sync/route.ts  (upsert WHERE clause + component-resolution map)
 *  - scripts/relink-dependencies.mjs  (offline rebuild of CardDependency edges)
 *
 * Rules:
 *  1. NFC-normalize Unicode so 갈 == 갈 regardless of composition.
 *  2. Trim and collapse internal whitespace.
 *  3. Strip an English clarifying gloss in trailing parentheses
 *     (e.g. "~(으)면 (if/when)" → "~(으)면")
 *     BUT keep Hangul-only or mixed Hangul+punctuation parens intact
 *     (e.g. "~(으)면", "Action verb ~는 + noun (present modifier)").
 *     Heuristic: strip the LAST parenthesised group only when it contains
 *     exclusively ASCII letters, digits, punctuation, and spaces
 *     (i.e. it's an English gloss, not a Korean pattern).
 *  4. Leave a leading ~ on grammar patterns (it's meaningful).
 *
 * No side-effects, no imports. Safe to call in server AND client contexts.
 */

export function normalizeFront(front: string): string {
  let s = front.normalize('NFC').trim().replace(/\s+/g, ' ')
  // Strip a trailing English-only gloss in parentheses.
  // Guard: only strip when the paren group has at least one ASCII letter/digit
  // and NO Hangul (Unicode range AC00–D7A3, Jamo, compatibility Jamo).
  const match = s.match(/\s*\(([^)]*)\)\s*$/)
  if (match) {
    const inner = match[1]
    const hasHangul = /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/.test(inner)
    const hasAscii = /[A-Za-z0-9]/.test(inner)
    if (!hasHangul && hasAscii) {
      s = s.slice(0, s.length - match[0].length).trim()
    }
  }
  return s
}
