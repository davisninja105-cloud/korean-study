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
    return <span className={className}>{korean}</span>
  }

  const before = korean.slice(0, match.index)
  const target = korean.slice(match.index, match.index + targetForm.length)
  const after  = korean.slice(match.index + targetForm.length)

  return (
    <span className={className}>
      {before}
      <mark className="bg-yellow-200 dark:bg-yellow-500/30 text-yellow-900 dark:text-yellow-100 font-semibold rounded px-0.5 not-italic">
        {target}
      </mark>
      {after}
    </span>
  )
}
