---
phase: 30-instant-feedback-cold-start-unblocking
reviewed: 2026-08-06T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - app/api/settings/backfill-cookie/route.ts
  - app/api/settings/route.ts
  - app/cards/loading.tsx
  - app/globals.css
  - app/habits/loading.tsx
  - app/history/loading.tsx
  - app/layout.tsx
  - app/manifest.ts
  - app/settings/page.tsx
  - app/study/loading.tsx
  - components/SettingsClient.tsx
  - components/StudyClient.tsx
  - e2e/perf.spec.ts
  - e2e/settings-flash.spec.ts
  - e2e/study-filter-skeleton.spec.ts
  - lib/settings.ts
  - tests/manifest.test.ts
  - tests/root-layout-sync.test.ts
  - tests/settings-backfill-cookie-route.test.ts
  - tests/settings-page-render-safety.test.ts
  - tests/skeleton-token.test.ts
  - vercel.json
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-08-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

This phase (LAYOUT-01 / PERCEPT-01/02/03 / G-30-2) removes the blocking Prisma
read from `RootLayout`, replaces it with a non-httpOnly `ks_settings` cookie +
pre-paint `<script>` mechanism, adds a dedicated `--skeleton-bg` token so
skeletons are visible in dark mode, tightens the `/habits` perf budget, pins
the dark PWA manifest colors, and fixes a real Next.js 16.2.1
`ReadonlyRequestCookiesError` (G-30-2) by moving the cookie re-seed out of
`app/settings/page.tsx`'s render body into a genuine Route Handler
(`app/api/settings/backfill-cookie/route.ts`).

The mechanical parts of this phase are solid: `tsc --noEmit` and `eslint`
are clean on every reviewed file, all 17 relevant Vitest unit tests pass, the
skeleton-token migration is complete (no stray `bg-surface-3 animate-pulse`
skeletons remain that would be invisible in dark mode), and the `StudyClient`
`phaseRef` refactor correctly avoids the "side effect inside a `setState`
updater" anti-pattern it replaces.

Three real gaps remain, all disclosed in part by the implementation's own
comments but not fully mitigated in code: (1) the new backfill-cookie route
accepts and persists unvalidated color/scale values into a client-readable
cookie, unlike its sibling `PUT /api/settings`, which always normalizes
through `lib/settings.ts`; (2) the removal of server-side DB-driven color
application means any session without a `ks_settings` cookie (new device,
cleared cookies, private browsing, or JS disabled) silently renders default
colors everywhere except `/settings`, with no server-side or middleware
fallback and no no-JS fallback at all; (3) the lesson-range filter re-fetch
in `StudyClient` has no request sequencing, so two rapid filter applies can
resolve out of order and the stale one wins.

## Warnings

### WR-01: `POST /api/settings/backfill-cookie` accepts and persists unvalidated color/scale values

**File:** `app/api/settings/backfill-cookie/route.ts:17-26`
**Issue:** The route's own validation is shape-only (`typeof buttonColor === 'string'`, `typeof readingTextScale === 'number' && Number.isFinite(...)`). Unlike `PUT /api/settings`, it never routes the values through `lib/settings.ts`'s hex/range validators before writing them into the cookie:

- `buttonColor`/`rewardColor` are never checked against `HEX_RE` (`/^#[0-9a-fA-F]{6}$/`) or lowercased — `PUT /api/settings` always normalizes through `setButtonColor`/`setRewardColor`, which fall back to `DEFAULT_ACTION_COLOR`/`DEFAULT_REWARD_COLOR` on anything that doesn't match. This route has no equivalent, so any string type-checks as valid.
- `readingTextScale` is never clamped to `[0.9, 1.4]` — `PUT /api/settings`'s `setReadingTextScale` always clamps. Here, any finite number (including negative values) passes through unchanged into `s.setProperty('--reading-scale', v.readingTextScale)` in `app/layout.tsx`'s pre-paint script.

Under the intended call path (`components/SettingsClient.tsx`'s mount effect, which only ever sends already-validated `initialButtonColor`/etc. props fetched via `getAllSettings()`) this is latent, not exploitable. But the route is a standalone, directly-callable POST endpoint (behind the shared-password auth gate only) with no comment documenting that validation is intentionally deferred to callers, and any future caller — or a bug in `SettingsClient`, or a stray manual `curl`/devtools call by the app's own user — can silently poison the persisted `ks_settings` cookie with a malformed color or out-of-range scale for up to a year (`maxAge: 60 * 60 * 24 * 365`), producing broken theming until the user happens to revisit `/settings` or re-save a color (which overwrites via the validated `PUT` path).

Note: `lib/settings.ts`'s `parseButtonColor`/`parseRewardColor`/`parseReadingTextScale` are pure (no Prisma calls) but are not `export`ed, so this route currently has no way to reuse them without a `lib/settings.ts` change.

**Fix:** Export the pure parse helpers from `lib/settings.ts` and reuse them here instead of the shape-only checks:
```ts
// lib/settings.ts — add `export` to the three parse* functions already defined there
export function parseButtonColor(raw: string | undefined): string { … }
export function parseRewardColor(raw: string | undefined): string { … }
export function parseReadingTextScale(raw: string | undefined): number { … }
```
```ts
// app/api/settings/backfill-cookie/route.ts
import { parseButtonColor, parseRewardColor, parseReadingTextScale } from '@/lib/settings'
// …
const safeButtonColor = parseButtonColor(hasColor ? buttonColor : undefined)
const safeRewardColor = parseRewardColor(hasReward ? rewardColor : undefined)
const safeScale = parseReadingTextScale(hasScale ? String(readingTextScale) : undefined)
// write safeButtonColor/safeRewardColor/safeScale into the cookie instead of the raw body values
```

### WR-02: No server-side or no-JS fallback for DB-configured colors — sessions without the `ks_settings` cookie silently render defaults everywhere except `/settings`

**File:** `app/layout.tsx:44-94` (compare against the removed `getLayoutSettings()`/`buttonStyle` SSR path — see `git diff a531857..HEAD -- app/layout.tsx`); no compensating logic added in `middleware.ts`.
**Issue:** Before this phase, `RootLayout` awaited `getLayoutSettings()` and rendered `--button`/`--reward`/`--reading-scale`/`hangul-spaced` as a real server-rendered inline `style`/`className` on `<html>` — correct on every request, including with JavaScript disabled. After this phase, `RootLayout` is synchronous and does zero DB reads (LAYOUT-01's intended tradeoff); the only mechanism that applies non-default `buttonColor`/`rewardColor`/`readingTextScale`/`readingAid` is a client-side pre-paint `<script>` that reads the `ks_settings` cookie. This introduces two real regressions, one of which is explicitly acknowledged in-code as a "KNOWN GAP" (`app/layout.tsx:81-89`) but left unaddressed:

1. **No-JS regression:** with JavaScript disabled (or blocked), none of the three pre-paint `<script>` tags run at all, so a user's configured button/reward colors, reading-text scale, and reading-aid spacing are *never* applied — the app silently falls back to the CSS `:root` defaults on every page, forever. The old SSR path degraded gracefully to correct output with no JS; this one does not.
2. **Cookie-less-but-customized-DB regression (the disclosed gap):** any session that has a customized DB `buttonColor`/`rewardColor`/etc. but no `ks_settings` cookie — a new device, a cleared-cookies browser, a private-browsing window, or (for the app's real production DB, which likely already has non-default settings from prior use) simply the very first page load after this deploy — sees default colors on `/`, `/study`, `/cards`, `/habits`, etc., and only gets corrected once the user happens to open `/settings` (which fires the `backfill-cookie` POST) or re-saves a setting via `PUT`. `middleware.ts` runs on every request but does nothing to seed this cookie.

**Fix:** At minimum, seed `ks_settings` from `middleware.ts` (or an Edge-safe read) on any cookie-less request so the gap is closed without waiting for a `/settings` visit — the in-code comment already identifies this as the closing move but defers it as "not a quick patch." Until then, this should be tracked as an open risk rather than an implicitly-closed one, since production likely already has non-default DB colors from before this cookie mechanism existed.

### WR-03: `StudyClient`'s lesson-filter re-fetch has no request sequencing — a stale response can overwrite a newer one

**File:** `components/StudyClient.tsx:89-107` (`loadDue`), reachable via the filter-trigger button at `components/StudyClient.tsx:273-281`
**Issue:** `loadDue` guards against overwriting state when the user has since left `select-mode` (via `phaseRef.current`), but it has no defense against **out-of-order responses within `select-mode`**. The filter-trigger button (`Lessons X–Y` / `All lessons`) is rendered unconditionally and is not disabled while `isFilterLoading` is true, and the `Sheet` it opens is dismissed immediately on `handleRangeChange` — so a user can reopen the filter sheet and apply a second range before the first `fetch('/api/cards/due...')` resolves. There is no `AbortController` and no monotonically-increasing request id/token check; whichever fetch happens to resolve last wins, even if it was issued first for a range the user has already moved away from. The result: the study session can silently start (or the select-mode screen can silently display) a due-card count/list for the *wrong* lesson range.
**Fix:**
```ts
const loadDueSeq = useRef(0)
const loadDue = useCallback((from: number, to: number, maxOrder: number) => {
  const seq = ++loadDueSeq.current
  setIsFilterLoading(true)
  fetch(`/api/cards/due${buildParams(from, to, 'due', maxOrder)}`)
    .then((r) => r.json())
    .then((cards: CardDTO[]) => {
      if (seq !== loadDueSeq.current || phaseRef.current !== 'select-mode') {
        if (seq === loadDueSeq.current) setIsFilterLoading(false)
        return
      }
      setStudyCards(cards)
      setScope('due')
      setIsFilterLoading(false)
    })
    .catch(() => { if (seq === loadDueSeq.current) setIsFilterLoading(false) })
}, [buildParams])
```

## Info

### IN-01: PWA manifest colors are pinned to dark regardless of the user's actual theme

**File:** `app/manifest.ts:22-23`
**Issue:** `background_color`/`theme_color` are hardcoded to `#0b0f1a` (dark) for every user, while the app's real theme is a per-user System/Light/Dark choice (`lib/theme.ts`). This is disclosed in-code as an accepted tradeoff (PERCEPT-02), but it means users on System-with-light-OS or explicit Light theme now get the *opposite* splash flash (dark splash → light UI) instead of the previous mismatch. Worth revisiting once real theme-distribution data is available, per the comment's own suggestion (a per-OS-preference manifest, or a `link rel="manifest"` swap keyed off the pre-paint theme script).
**Fix:** No action required now; tracked here so it isn't lost as "already fixed" — it's a shifted tradeoff, not a resolved one.

---

_Reviewed: 2026-08-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
