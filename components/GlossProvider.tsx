'use client'

/**
 * GlossProvider
 * =============
 * Client context for tap-to-gloss. Mount once in app/layout.tsx alongside
 * ThemeWatcher. Provides `useWordTap()` which returns a stable callback for
 * child components to wire into HighlightedSentence's `onWordTap` prop.
 *
 * Architecture:
 *  - GlossProvider wraps the app and renders a single portal-mounted popover.
 *  - useWordTap() returns (word, anchorRect) => void, or undefined if no
 *    provider is in the tree (graceful — HighlightedSentence stays static).
 *  - In-memory Map caches all fetched glosses for the session lifetime.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { typeBadgeClass } from '@/lib/card-style'

// ── Types ─────────────────────────────────────────────────────────────────

interface GlossEntry {
  dictionaryForm: string
  gloss: string
  partOfSpeech: string
  source: 'corpus' | 'cache' | 'llm'
  cardId?: string
}

interface PopoverState {
  word: string
  anchorRect: DOMRect
  entry: GlossEntry | null
  loading: boolean
  added: boolean
  error: boolean
}

interface GlossContextType {
  showGloss: (word: string, anchorRect: DOMRect) => void
}

// ── Context ───────────────────────────────────────────────────────────────

const GlossContext = createContext<GlossContextType | null>(null)

/** Returns the showGloss callback, or undefined when outside the provider. */
export function useWordTap(): ((word: string, anchorRect: DOMRect) => void) | undefined {
  return useContext(GlossContext)?.showGloss
}

// ── Popover ───────────────────────────────────────────────────────────────

function toCardType(partOfSpeech: string): 'vocabulary' | 'grammar' | 'phrase' {
  if (['particle', 'grammar'].includes(partOfSpeech)) return 'grammar'
  if (['expression', 'phrase'].includes(partOfSpeech)) return 'phrase'
  return 'vocabulary'
}

const POPOVER_WIDTH = 256
const GAP = 8

interface PopoverProps {
  state: PopoverState
  onClose: () => void
  onAddCard: () => void
}

function GlossPopoverUI({ state, onClose, onAddCard }: PopoverProps) {
  const { anchorRect, entry, loading, added, error, word } = state

  // Position: centered above the tapped word, clamped to viewport.
  const centerX = anchorRect.left + anchorRect.width / 2
  const left = Math.max(
    8,
    Math.min(centerX - POPOVER_WIDTH / 2, window.innerWidth - POPOVER_WIDTH - 8)
  )
  // Show above by default (keeps popover visible over the finger on touch).
  // If too close to the top, fall to below the word.
  const showAbove = anchorRect.top > 160
  const posStyle: React.CSSProperties = showAbove
    ? { bottom: `${window.innerHeight - anchorRect.top + GAP}px`, left: `${left}px` }
    : { top: `${anchorRect.bottom + GAP}px`, left: `${left}px` }

  // Dismiss on outside tap
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [onClose])

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const badgeType = entry
    ? ((['vocabulary', 'grammar', 'phrase'].includes(entry.partOfSpeech)
        ? entry.partOfSpeech
        : toCardType(entry.partOfSpeech)) as string)
    : 'vocabulary'

  return (
    <div
      role="dialog"
      aria-label={`Gloss for ${word}`}
      aria-live="polite"
      style={{ position: 'fixed', width: `${POPOVER_WIDTH}px`, zIndex: 60, ...posStyle }}
      className="animate-reveal"
    >
      <div
        ref={panelRef}
        className="bg-surface-1 rounded-2xl shadow-xl border border-border/60 p-4 flex flex-col gap-2"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close gloss"
          className="absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted hover:text-muted-foreground rounded-full hover:bg-surface-3 active:bg-surface-3 text-xs"
        >
          ✕
        </button>

        {loading && (
          <div className="py-2 flex items-center gap-2 text-sm text-muted">
            <span className="inline-block w-3 h-3 border-2 border-button border-t-transparent rounded-full animate-spin" />
            Looking up…
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-muted py-1">
            Couldn&apos;t find a gloss for <span className="hangul font-medium">{word}</span>.
          </p>
        )}

        {entry && !loading && (
          <>
            {/* Dictionary form */}
            <p className="hangul font-bold text-foreground text-lg leading-tight pr-6">
              {entry.dictionaryForm}
            </p>

            {/* Gloss */}
            <p className="text-sm text-muted-foreground">{entry.gloss}</p>

            {/* Part-of-speech chip */}
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadgeClass(badgeType)}`}>
                {entry.partOfSpeech}
              </span>
              {entry.source === 'corpus' && (
                <span className="text-[10px] text-muted">in your deck</span>
              )}
            </div>

            {/* Add as card — only for non-corpus results (corpus card already exists) */}
            {!entry.cardId && (
              <div className="pt-1 border-t border-border/60 mt-1">
                {added ? (
                  <p className="text-xs text-green-600 dark:text-green-400">Card added ✓</p>
                ) : (
                  <button
                    onClick={onAddCard}
                    aria-label={`Add ${word} as a card`}
                    className="flex items-center text-xs text-button hover:text-button-hover hover:underline min-h-[44px] active:opacity-70"
                  >
                    + Add as card
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Provider ──────────────────────────────────────────────────────────────

export function GlossProvider({ children }: { children: React.ReactNode }) {
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const cache = useRef<Map<string, GlossEntry>>(new Map())

  const showGloss = useCallback((word: string, anchorRect: DOMRect) => {
    const key = word.trim()
    if (!key) return

    // In-memory cache hit — instant display
    const hit = cache.current.get(key)
    if (hit) {
      setPopover({ word: key, anchorRect, entry: hit, loading: false, added: false, error: false })
      return
    }

    // Show loading state then fetch
    setPopover({ word: key, anchorRect, entry: null, loading: true, added: false, error: false })

    fetch('/api/gloss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: key }),
    })
      .then((r) => r.json())
      .then((data: GlossEntry & { error?: string }) => {
        if (!data.error) cache.current.set(key, data)
        setPopover((prev) =>
          prev?.word === key
            ? { ...prev, entry: data.error ? null : data, loading: false, error: !!data.error }
            : prev
        )
      })
      .catch(() => {
        setPopover((prev) =>
          prev?.word === key ? { ...prev, loading: false, error: true } : prev
        )
      })
  }, [])

  const handleAddCard = useCallback(async () => {
    if (!popover?.entry) return
    const { dictionaryForm, gloss, partOfSpeech } = popover.entry
    await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: toCardType(partOfSpeech),
        front: dictionaryForm,
        back: gloss,
      }),
    }).catch(() => {/* non-fatal */})
    setPopover((prev) => (prev ? { ...prev, added: true } : null))
  }, [popover])

  const handleClose = useCallback(() => setPopover(null), [])

  return (
    <GlossContext.Provider value={{ showGloss }}>
      {children}
      {popover && typeof document !== 'undefined' &&
        createPortal(
          <GlossPopoverUI
            state={popover}
            onClose={handleClose}
            onAddCard={handleAddCard}
          />,
          document.body
        )}
    </GlossContext.Provider>
  )
}
