'use client'

/**
 * iOS-style swipe-to-reveal component. Swipe left on the content to reveal
 * an action button (default: Delete). Tap outside or swipe back to dismiss.
 * Reduced-motion users get the same gesture but without the CSS transition.
 */

import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 72 // px of horizontal swipe needed to confirm open

interface Props {
  children: React.ReactNode
  onDelete: () => void
  deleteLabel?: string
  /** Disable the swipe (e.g. when a parent is already handling the interaction). */
  disabled?: boolean
}

export default function SwipeRow({
  children,
  onDelete,
  deleteLabel = 'Delete',
  disabled = false,
}: Props) {
  const [tx, setTx] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const dir = useRef<'h' | 'v' | null>(null)
  // Lazy init — this component is 'use client', so window is always defined here.
  const [prefersReduced] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Dismiss when the user taps outside the row
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setTx(0)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [isOpen])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    startX.current = e.clientX
    startY.current = e.clientY
    dir.current = null
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current

    // Lock direction after 5 px of movement
    if (!dir.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      dir.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
    }
    if (dir.current === 'v') return

    // Drag horizontally: clamp to [-(THRESHOLD+16), 0]
    const base = isOpen ? -THRESHOLD : 0
    setTx(Math.min(0, Math.max(-(THRESHOLD + 16), base + dx)))
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return
    setDragging(false)
    if (dir.current !== 'h') {
      dir.current = null
      return
    }
    const dx = e.clientX - startX.current
    if (!isOpen && dx < -(THRESHOLD / 2)) {
      setIsOpen(true)
      setTx(-THRESHOLD)
    } else if (isOpen && dx > THRESHOLD / 2) {
      setIsOpen(false)
      setTx(0)
    } else {
      // Snap back to current state
      setTx(isOpen ? -THRESHOLD : 0)
    }
    dir.current = null
  }

  function handleDelete() {
    setIsOpen(false)
    setTx(0)
    onDelete()
  }

  return (
    <div ref={rowRef} className="relative overflow-hidden rounded-xl">
      {/* Revealed action (underneath, right-aligned) */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch rounded-xl"
        aria-hidden={!isOpen}
      >
        <button
          onClick={handleDelete}
          tabIndex={isOpen ? 0 : -1}
          aria-label={deleteLabel}
          className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold min-w-[72px] min-h-[44px] px-5 rounded-xl transition-colors"
        >
          {deleteLabel}
        </button>
      </div>

      {/* Sliding content layer */}
      <div
        style={{
          transform: `translateX(${tx}px)`,
          transition: dragging || prefersReduced ? 'none' : 'transform 0.22s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  )
}
