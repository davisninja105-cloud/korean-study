/**
 * Pure render component — no hooks, no side effects.
 * Renders a Korean sentence with the targetForm span highlighted.
 * Uses lib/sentence-match.ts for location logic (single source of truth).
 * Falls back to plain text if targetForm is not found.
 *
 * For grammar cards (cardType === 'grammar'), the trailing particle (조사) is
 * tinted distinctly from the stem so the structure is visible.
 *
 * When `onWordTap` is provided, each whitespace-separated token becomes a
 * tappable span for tap-to-gloss. Off in editing contexts (don't pass the prop).
 */
import { sentenceMatch, splitParticle } from '@/lib/sentence-match'

interface Props {
  korean: string
  targetForm: string
  className?: string
  cardType?: string
  /** When provided, each word token becomes tappable (tap-to-gloss). */
  onWordTap?: (word: string, anchorRect: DOMRect) => void
}

/** Split a text segment into tappable spans + plain whitespace. */
function TappableSegment({
  text,
  onWordTap,
}: {
  text: string
  onWordTap: (word: string, anchorRect: DOMRect) => void
}) {
  const tokens = text.split(/(\s+)/)
  return (
    <>
      {tokens.map((chunk, i) =>
        /^\s+$/.test(chunk) || chunk === '' ? (
          chunk
        ) : (
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Look up ${chunk}`}
            className="rounded px-0.5 -mx-0.5 cursor-pointer hover:bg-button-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-button/50"
            onClick={(e) => {
              e.stopPropagation()
              onWordTap(chunk, e.currentTarget.getBoundingClientRect())
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onWordTap(chunk, e.currentTarget.getBoundingClientRect())
              }
            }}
          >
            {chunk}
          </span>
        )
      )}
    </>
  )
}

export default function HighlightedSentence({
  korean,
  targetForm,
  className,
  cardType,
  onWordTap,
}: Props) {
  const match = sentenceMatch(korean, targetForm)

  if (!match.found) {
    return (
      <span className={`hangul-sentence ${className ?? ''}`}>
        {onWordTap ? (
          <TappableSegment text={korean} onWordTap={onWordTap} />
        ) : (
          korean
        )}
      </span>
    )
  }

  const before = korean.slice(0, match.index)
  const target = korean.slice(match.index, match.index + targetForm.length)
  const after  = korean.slice(match.index + targetForm.length)

  const { stem, particle } =
    cardType === 'grammar' ? splitParticle(target) : { stem: target, particle: '' }

  return (
    <span className={`hangul-sentence ${className ?? ''}`}>
      {onWordTap ? <TappableSegment text={before} onWordTap={onWordTap} /> : before}
      <mark
        className={`font-semibold rounded-md px-1 py-0.5 not-italic${onWordTap ? ' cursor-pointer hover:opacity-80' : ''}`}
        style={{ backgroundColor: 'var(--highlight-bg)', color: 'var(--highlight-fg)' }}
        role={onWordTap ? 'button' : undefined}
        tabIndex={onWordTap ? 0 : undefined}
        aria-label={onWordTap ? `Look up ${target}` : undefined}
        onClick={
          onWordTap
            ? (e) => {
                e.stopPropagation()
                onWordTap(target, e.currentTarget.getBoundingClientRect())
              }
            : undefined
        }
        onKeyDown={
          onWordTap
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onWordTap(target, e.currentTarget.getBoundingClientRect())
                }
              }
            : undefined
        }
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
      {onWordTap ? <TappableSegment text={after} onWordTap={onWordTap} /> : after}
    </span>
  )
}
