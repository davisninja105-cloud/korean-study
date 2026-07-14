/**
 * Pure helper — single source of truth for deriving which face (front prompt
 * + reveal shape) an Active-mode flashcard should render for the current
 * study item.
 *
 * Precedence (order matters):
 *   1. `isPractice` → passive-degrade, unconditionally (CR-01 fix). AI-generated
 *      `PracticeCard` items (`lib/generate-practice.ts`) do NOT mirror the real
 *      `Card.front`/`Card.back` shape — `front` is a Korean instruction/prompt
 *      (not a bare word) and `back` is mixed Korean+English content (not a
 *      clean English gloss). Reusing the production mechanic for them either
 *      leaks the Korean answer into the un-revealed prompt (`card.back` shown
 *      as the "translate this" text) or renders a broken/oversized reveal
 *      (`card.front` styled as a single giant bold word). Practice cards have
 *      no guaranteed single-language field split, so they always render via
 *      the same silent Passive/exposure face real new cards use — checked
 *      BEFORE the new-card check since a practice item is also "new" by the
 *      `isNewCard` computation (no FSRS review state at all).
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
  | { face: 'passive-degrade' } // real card, state <= 1 (D-10), or ANY practice card (CR-01)
  | { face: 'word-production'; prompt: string } // matured real card, zero sentences (D-04)
  | { face: 'sentence-production'; prompt: string } // matured card with a chosen sentence

export function deriveActiveFace(
  card: { front: string; back: string },
  chosenSentence: { translation: string } | null,
  isNewCard: boolean,
  isPractice: boolean,
): ActiveFace {
  if (isPractice) return { face: 'passive-degrade' }
  if (isNewCard) return { face: 'passive-degrade' }
  if (!chosenSentence) return { face: 'word-production', prompt: card.back }
  return { face: 'sentence-production', prompt: chosenSentence.translation }
}
