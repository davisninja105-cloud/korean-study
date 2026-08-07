import { useEffect, useRef, useState } from 'react'

/**
 * Debounce-timer coordinator (no React APIs) — the exact scheduling logic
 * `useDebouncedValue` relies on, extracted as a plain class so it is
 * unit-testable with `vi.useFakeTimers()` without a DOM/React-rendering
 * harness (this codebase's Vitest suite runs in the `node` environment and
 * has no jsdom/@testing-library/react — see `tests/use-debounced-value.test.ts`
 * for the "why" note). A fresh call to `schedule()` always cancels any
 * still-pending timer before starting a new one, so only the MOST RECENTLY
 * scheduled value can ever fire — this is what makes a burst of rapid value
 * changes collapse onto the last one instead of applying every intermediate
 * value in sequence (the CARDS-03 "debounce collapses bursts" contract).
 */
export class Debouncer<T> {
  private timerId: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onSettle: (value: T) => void) {}

  /** Cancels any pending timer and schedules `value` to settle after `delayMs`. */
  schedule(value: T, delayMs: number): void {
    this.cancel()
    this.timerId = setTimeout(() => {
      this.timerId = null
      this.onSettle(value)
    }, delayMs)
  }

  /** Clears any pending timer without applying its value. Safe to call when idle. */
  cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }
}

/**
 * react-hooks/purity-safe debounce: returns `value` unchanged until it has
 * settled (no newer value superseded it) for `delayMs`. No `Date.now()`/
 * `Math.random()` in render — all timing lives inside the effect, delegated
 * to `Debouncer` above. React's own effect dependency-array diffing (not
 * this hook's own code) is what guarantees a call with an unchanged `value`
 * never reschedules a redundant timer.
 *
 * Usage: `const debouncedSearch = useDebouncedValue(search, 300)`
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  const debouncerRef = useRef<Debouncer<T> | null>(null)
  if (debouncerRef.current === null) {
    debouncerRef.current = new Debouncer<T>(setDebounced)
  }

  useEffect(() => {
    const debouncer = debouncerRef.current!
    debouncer.schedule(value, delayMs)
    return () => debouncer.cancel()
  }, [value, delayMs])

  return debounced
}
