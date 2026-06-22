/**
 * Pure render component — no hooks, no side effects.
 * Renders a Korean sentence with the targetForm span highlighted.
 * Uses lib/sentence-match.ts for location logic (single source of truth).
 * Falls back to plain text if targetForm is not found.
 *
 * For grammar cards (cardType === 'grammar'), the trailing particle (조사) is
 * tinted distinctly from the stem so the structure is visible.
 */
import { sentenceMatch, splitParticle } from '@/lib/sentence-match'

interface Props {
  korean: string
  targetForm: string
  className?: string
  cardType?: string
}

export default function HighlightedSentence({ korean, targetForm, className, cardType }: Props) {
  const match = sentenceMatch(korean, targetForm)

  if (!match.found) {
    return <span className={`hangul-sentence ${className ?? ''}`}>{korean}</span>
  }

  const before = korean.slice(0, match.index)
  const target = korean.slice(match.index, match.index + targetForm.length)
  const after  = korean.slice(match.index + targetForm.length)

  const { stem, particle } =
    cardType === 'grammar' ? splitParticle(target) : { stem: target, particle: '' }

  return (
    <span className={`hangul-sentence ${className ?? ''}`}>
      {before}
      <mark
        className="font-semibold rounded-md px-1 py-0.5 not-italic"
        style={{ backgroundColor: 'var(--highlight-bg)', color: 'var(--highlight-fg)' }}
      >
        {particle ? (
          <>
            {stem}
            <span
              className="rounded-sm px-0.5"
              style={{ backgroundColor: 'color-mix(in srgb, var(--cat-grammar) 35%, transparent)' }}
            >
              {particle}
            </span>
          </>
        ) : (
          target
        )}
      </mark>
      {after}
    </span>
  )
}
