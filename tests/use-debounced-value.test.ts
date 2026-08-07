import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Debouncer } from '../lib/useDebouncedValue'

// Why this file tests `Debouncer` directly rather than rendering
// `useDebouncedValue` as a React hook: this codebase's Vitest suite runs in
// the `node` environment (see vitest.config.ts) and has no jsdom/happy-dom
// or @testing-library/react installed — the established convention here is
// unit-testing pure `lib/` functions, not React component/hook rendering
// (`npm test` — "no DB/API needed", per CLAUDE.md; no other hook in this
// codebase, e.g. lib/usePullToRefresh.ts, has a rendering-based unit test
// either). `Debouncer` is the exact, fully pure scheduling core
// `useDebouncedValue` delegates to (construct it, call schedule/cancel,
// advance fake timers, assert `onSettle` calls) — every timing behavior the
// hook exhibits is exercised here with `vi.useFakeTimers()`. The one
// behavior NOT independently re-tested is "an unchanged `value` never
// reschedules a timer" — that guarantee comes from React's own `useEffect`
// dependency-array diffing (well-established, tested upstream in React
// itself), not from any code in this file.

describe('Debouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('settles on the scheduled value after delayMs elapses', () => {
    const onSettle = vi.fn()
    const debouncer = new Debouncer<string>(onSettle)

    debouncer.schedule('a', 300)
    expect(onSettle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(onSettle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith('a')
  })

  it('collapses a burst of values within the delay window onto only the LAST one', () => {
    // Proves debounce collapses bursts, not just delays each value
    // individually — the first intermediate value must never fire.
    const onSettle = vi.fn()
    const debouncer = new Debouncer<string>(onSettle)

    debouncer.schedule('first', 300)
    vi.advanceTimersByTime(100)
    debouncer.schedule('second', 300) // supersedes 'first' before its timer fired
    vi.advanceTimersByTime(299)
    expect(onSettle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith('second')
  })

  it('cancel() clears the pending timer — onSettle never fires', () => {
    const onSettle = vi.fn()
    const debouncer = new Debouncer<string>(onSettle)

    debouncer.schedule('a', 300)
    debouncer.cancel()
    vi.advanceTimersByTime(1000)

    expect(onSettle).not.toHaveBeenCalled()
  })

  it('cancel() is a safe no-op when nothing is scheduled', () => {
    const onSettle = vi.fn()
    const debouncer = new Debouncer<string>(onSettle)

    expect(() => debouncer.cancel()).not.toThrow()
    expect(onSettle).not.toHaveBeenCalled()
  })

  it('a stale timer never fires after being cancelled and rescheduled (no double-apply)', () => {
    const onSettle = vi.fn()
    const debouncer = new Debouncer<number>(onSettle)

    debouncer.schedule(1, 300)
    vi.advanceTimersByTime(300) // 1 settles
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenLastCalledWith(1)

    debouncer.schedule(2, 300)
    debouncer.cancel()
    debouncer.schedule(3, 300)
    vi.advanceTimersByTime(300)

    expect(onSettle).toHaveBeenCalledTimes(2)
    expect(onSettle).toHaveBeenLastCalledWith(3)
  })

  it('supports independent Debouncer instances (e.g. per hook call site) without cross-talk', () => {
    const onSettleA = vi.fn()
    const onSettleB = vi.fn()
    const a = new Debouncer<string>(onSettleA)
    const b = new Debouncer<string>(onSettleB)

    a.schedule('a-value', 300)
    b.schedule('b-value', 100)

    vi.advanceTimersByTime(100)
    expect(onSettleB).toHaveBeenCalledWith('b-value')
    expect(onSettleA).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(onSettleA).toHaveBeenCalledWith('a-value')
  })
})
