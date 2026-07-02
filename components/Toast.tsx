'use client'

import { useEffect, useRef } from 'react'

interface Props {
  message: string
  onDismiss: () => void
  duration?: number
}

/**
 * Minimal status toast — a single fixed-position message near the bottom of
 * the viewport that announces itself to screen readers (role="status",
 * aria-live="polite") and self-dismisses after `duration` ms (default 4s).
 *
 * The dismiss callback is held in a ref so the auto-dismiss timer is set up
 * once on mount and is NOT reset by unrelated parent re-renders (e.g. the
 * study session advancing cards while a save-failure toast is visible).
 * `onDismiss` is invoked inside the setTimeout callback — never synchronously
 * in the effect body — so it does not violate react-hooks/set-state-in-effect.
 * (Ref writes in an effect body are allowed; they are not setState.)
 *
 * Styled with semantic tokens only (bg-surface-1, text-foreground, shadow-md,
 * the --sab safe-area var) — no literal bg-orange or text-blue color utilities,
 * and no new npm dependency. Deliberately far simpler than Sheet: no portal,
 * no spring animation, no focus trap, no backdrop.
 */
export default function Toast({ message, onDismiss, duration = 4000 }: Props) {
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), duration)
    return () => clearTimeout(timer)
  }, [duration])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-[calc(7rem+var(--sab,0px))] z-[60] max-w-[90vw] flex items-center gap-2 bg-surface-1 text-foreground rounded-2xl shadow-md px-4 py-3"
    >
      <p className="text-sm">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="min-h-[44px] min-w-[44px] -my-1 -mr-2 flex items-center justify-center rounded-md text-muted hover:text-muted-foreground hover:bg-surface-3 active:bg-surface-3 transition-colors text-xl leading-none"
      >
        ×
      </button>
    </div>
  )
}
