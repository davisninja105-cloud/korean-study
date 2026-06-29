'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

/**
 * Portal bottom sheet. Spring slide-up + blurred backdrop; closes on backdrop
 * tap or Escape; traps focus and locks body scroll while open. Reduced-motion
 * users get a crossfade instead of the slide (handled in globals.css).
 *
 * `open` starts false in every usage, so SSR and first hydration both render
 * null — the portal only mounts after a client interaction, avoiding any
 * hydration mismatch without a mounted-flag effect.
 */
export default function Sheet({ open, onClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => panelRef.current?.focus(), 0)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-xl bg-surface-1 rounded-t-3xl shadow-2xl outline-none max-h-[85vh] overflow-y-auto pb-[max(1rem,var(--sab,0px))] animate-sheet"
      >
        {/* Drag handle + optional title (sticky so it stays while content scrolls) */}
        <div className="sticky top-0 bg-surface-1 pt-3 pb-2 flex flex-col items-center rounded-t-3xl z-10">
          <div className="w-10 h-1.5 rounded-full bg-surface-3" />
          {title && (
            <h2 className="mt-2 text-base font-semibold text-foreground">{title}</h2>
          )}
        </div>
        <div className="px-2 pb-2">{children}</div>
      </div>
    </div>,
    document.body
  )
}
