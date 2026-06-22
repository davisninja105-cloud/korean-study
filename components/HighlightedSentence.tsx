/**
 * Pure render component — no hooks, no side effects.
 * Renders a Korean sentence with the targetForm span highlighted.
 * Uses lib/sentence-match.ts for location logic (single source of truth).
 * Falls back to plain text if targetForm is not found.
 */
import { sentenceMatch } from '@/lib/sentence-match'

interface Props {
  korean: string
  targetForm: string
  className?: string
}

export default function HighlightedSentence({ korean, targetForm, className }: Props) {
  const match = sentenceMatch(korean, targetForm)

  if (!match.found) {
    return <span className={`hangul-sentence ${className ?? ''}`}>{korean}</span>
  }

  const before = korean.slice(0, match.index)
  const target = korean.slice(match.index, match.index + targetForm.length)
  const after  = korean.slice(match.index + targetForm.length)

  return (
    <span className={`hangul-sentence ${className ?? ''}`}>
      {before}
      <mark
        className="font-semibold rounded px-0.5 not-italic"
        style={{ backgroundColor: 'var(--highlight-bg)', color: 'var(--highlight-fg)' }}
      >
        {target}
      </mark>
      {after}
    </span>
  )
}
