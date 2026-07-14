/**
 * Pure helper — single source of truth for deriving which face (front prompt
 * + reveal shape) an Active-mode flashcard should render for the current
 * study item.
 *
 * Precedence (order matters — a practice card is also "new" by the existing
 * `isNewCard` computation, since it has no FSRS review state at all):
 *   1. `isPractice` → word-production, prompt = `card.back`. Practice cards
 *      have no `sentences` field, so they always take the word-level
 *      production fallback — checked BEFORE the new-card check (D-04).
 *   2. `isNewCard` (state <= 1) → passive-degrade. A never/barely-seen real
 *      card silently renders the existing Passive/exposure face for that
 *      review (D-03/D-10) — checked BEFORE the null-sentence fallback so a
 *      brand-new, zero-sentence real card degrades instead of getting a
 *      production prompt for a never-seen word (Core Value).
 *   3. `chosenSentence === null` → word-production, prompt = `card.back`. A
 *      matured real card with no sentences at all.
 *   4. otherwise → sentence-production, prompt = `chosenSentence.translation`.
 *      A matured card with a selected sentence — the common case.
 *
 * Used by:
 *  - components/StudySession.tsx (render-scope `activeFace` derivation from
 *    queue[0] — never snapshotted; a requeued card must re-derive its face
 *    every render so a mid-session state 1 → 2 graduation flips its face)
 *
 * Pure — reads no wall-clock time and no pseudo-random source; safe to call
 * anywhere, including render or inside a `useMemo` (react-hooks/purity).
 */

export type ActiveFace =
  | { face: 'passive-degrade' } // real card, state <= 1 (D-10)
  | { face: 'word-production'; prompt: string } // practice card OR matured zero-sentence (D-04)
  | { face: 'sentence-production'; prompt: string } // matured card with a chosen sentence

export function deriveActiveFace(
  card: { front: string; back: string },
  chosenSentence: { translation: string } | null,
  isNewCard: boolean,
  isPractice: boolean,
): ActiveFace {
  if (isPractice) return { face: 'word-production', prompt: card.back }
  if (isNewCard) return { face: 'passive-degrade' }
  if (!chosenSentence) return { face: 'word-production', prompt: card.back }
  return { face: 'sentence-production', prompt: chosenSentence.translation }
}
