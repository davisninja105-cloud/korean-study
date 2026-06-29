---
plan: 07-01
phase: 07-secondary-screens-navigation
status: complete
completed: 2026-06-28
requirements_met: [NAV-01, SEC-02]
---

# Plan 07-01 Summary: Nav Safe-Area Fix + Touch Targets

## What Was Built

Fixed the iOS safe-area-inset-bottom collapse bug (NAV-01) and met the 44px touch-target minimum on bottom nav tabs (SEC-02).

**Root cause fix:** `env(safe-area-inset-bottom)` resolves to `0px` after a Next.js `<Link>` navigation because the CSS environment resets. The fix reads the value once at mount into a persistent `--sab` CSS variable on `document.documentElement`, which survives route transitions.

## Tasks Completed

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Add `--sab` useEffect + swap bottom nav padding | ✓ | `useEffect([], ...)` reads env() at mount, writes `--sab`; nav uses `pb-[var(--sab,0px)]` |
| Task 2: 44px min-height + press feedback on tab links and settings gear | ✓ | `min-h-[44px] active:opacity-70` on tab links; `active:opacity-70` on settings gear |
| Task 3: Swap layout `<main>` bottom padding | ✓ | `pb-[calc(4.5rem+var(--sab,0px))]` replaces the `env()` reference |

## Key Files Modified

- `components/Nav.tsx` — added `useEffect` import + `--sab` effect; swapped bottom nav pb; added `min-h-[44px] active:opacity-70` on tab links and `active:opacity-70` on settings gear
- `app/layout.tsx` — swapped `<main>` bottom padding to `var(--sab,0px)`

## Verification

- All grep assertions pass (no `env(safe-area-inset-bottom)` in bottom nav or layout `<main>`; `active:opacity-70` appears exactly twice in Nav.tsx)
- `npm run lint` passes with zero errors

## Self-Check: PASSED
