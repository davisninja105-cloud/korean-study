# Phase 35: Service Worker & Offline Review Queue - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 9 (net-new) + 5 (modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `public/sw.js` (generated) | service-worker / cache | request-response (fetch interception) | none in-repo (net-new concept) | no analog — use RESEARCH.md Patterns 1–3 |
| `scripts/gen-sw.mjs` | utility / build script | file-I/O (batch, post-build) | `scripts/gen-icons.mjs` | role-match |
| `lib/service-worker.ts` | utility / provider-support module | event-driven (SW lifecycle) | `lib/local-cache.ts` (module shape) + `components/FreshnessWatcher.tsx` (event pattern) | role-match |
| `lib/offline-queue.ts` | service / store (IndexedDB) | CRUD + batch (queue enqueue/flush) | `lib/local-cache.ts` | exact (same idb wrapper style) |
| `lib/useForegroundResume.ts` (optional) | hook | event-driven | `components/FreshnessWatcher.tsx` | role-match (extract shared listener set) |
| `components/ServiceWorkerProvider.tsx` | provider (client shell, mount-once) | event-driven | `components/FreshnessWatcher.tsx` / `components/GlossProvider.tsx` | exact (mount-once provider in `app/layout.tsx`) |
| `components/StudySession.tsx` (modified — `submitReview`) | component / event handler | request-response → event-driven (offline branch) | itself (`postReviewWithRetry`, lines 83-140, 483-494) | exact — extend in place |
| `components/HomeClient.tsx` (modified — mount effect) | component (RSC client shell) | request-response (warm fetch) | itself (existing `loadStats`/`loadActivity` mount effect) | exact — extend in place |
| `middleware.ts` (modified — matcher) | middleware | request-response | itself | exact — extend in place |
| `lib/local-cache.ts` (modified — `fetchCacheContextOrLastKnown`) | service / store (IndexedDB) | CRUD | itself (`fetchCacheContext`) | exact — extend in place |
| `app/api/review/route.ts` | route (API) | request-response | **no changes needed** — already idempotent | n/a |

## Pattern Assignments

### `lib/offline-queue.ts` (service, CRUD/batch — IndexedDB queue)

**Analog:** `lib/local-cache.ts`

**Imports pattern** (lines 1-32 of `lib/local-cache.ts`):
```typescript
// No 'use client' directive: this is a plain module (not a component), same
// convention as lib/usePullToRefresh.ts. It is only ever imported from
// 'use client' components, but importing it does not itself require the
// directive.
import { openDB, type IDBPDatabase } from 'idb'
import type { ActivityDTO, StatsDTO, CardDTO, GroupCountsDTO } from '@/lib/dto'
```
`lib/offline-queue.ts` should follow the same "no `'use client'`, plain module, `idb`-only import" shape. Per **D-00** (locked, non-negotiable), it must NOT reuse `CACHE_DB_PREFIX`/`ks-cache-<buildId>` — open a fresh, non-buildId-keyed database (`ks-offline-queue`).

**Lazy per-purpose DB open pattern** (lines 78-79 + header comment lines 24-29 of `lib/local-cache.ts`):
```typescript
// ── Lazy, per-buildId DB open (Pitfall 4, react-hooks/purity) ──────────────
// `openDB(...)` is called only inside `getDb()`, itself only reachable from
// this module's exported async functions — never at module scope, never as
// an import-time side effect.
let dbPromise: Promise<IDBPDatabase> | null = null
let dbBuildId: string | null = null
```
Mirror the "lazy open, never at module scope" discipline for the queue's `getDb()`, but **drop** the buildId-keying half entirely (that's the one part of the pattern D-00 forbids copying).

**Full target implementation:** already fully specified in `35-RESEARCH.md` Architecture Pattern 4 (`lib/offline-queue.ts` — `QueuedReview` interface, `enqueueReview()`, `flushQueue()` sequential-cursor loop). Use that code verbatim as the starting point; it already follows `local-cache.ts`'s "silent try/catch-to-no-op on any IndexedDB failure" convention.

**Error handling pattern** (silent-fallback convention, matches `local-cache.ts`'s established style — grep any `catch {` block in that file, e.g. its `readCache`/`writeCache` wrapping): every IndexedDB operation is wrapped in `try { … } catch { /* no-op, safe fallback */ }` — never throws up to the caller. `enqueueReview` failing silently is acceptable per RESEARCH.md (falls back to today's existing lost-background-save behavior).

---

### `components/ServiceWorkerProvider.tsx` (provider, event-driven)

**Analog:** `components/FreshnessWatcher.tsx` (event-listener/mount-once shape) + `components/GlossProvider.tsx` (mount-once provider convention referenced in header comments)

**Mount pattern** (`FreshnessWatcher.tsx` lines 72-116):
```typescript
'use client'
import { useEffect, useRef } from 'react'

export default function FreshnessWatcher({ children }: { children: React.ReactNode }) {
  const lastRefreshRef = useRef<number>(0)
  useEffect(() => {
    const refresh = () => { /* Date.now() read only inside event-handler closure */ }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refresh() }
    const onPopState = () => { setTimeout(refresh, 0) }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) refresh() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow)
    return () => { /* remove all three */ }
  }, [router])
  return <>{children}</>
}
```
`ServiceWorkerProvider.tsx` should follow this exact "wrap children, register listeners in one effect, cleanup on unmount" shape — mounted in `app/layout.tsx` alongside `FreshnessWatcher`/`ThemeWatcher`/`GlossProvider` (per RESEARCH.md's Recommended Project Structure). D-09 reuses the SAME event names (`visibilitychange`/`pageshow`/`online`) FreshnessWatcher listens to — **do not modify `FreshnessWatcher.tsx` itself** (it's "do-not-delete" per canonical refs, and its own header comment scopes it narrowly to the RSC-refresh concern only).

**react-hooks/purity discipline** (line 78-80 of `FreshnessWatcher.tsx`): any `Date.now()`/timestamp read for the update-check coalesce logic must happen inside the event-handler closure, never during render — same rule applies to `queuedAt: string` writes in `offline-queue.ts`'s `enqueueReview`.

**Toast wiring** — see `components/Toast.tsx` below; `ServiceWorkerProvider` owns the `showToast`/`saveError`-style state that conditionally renders `<Toast>` for the update-available prompt (D-07).

---

### `components/Toast.tsx` (reused verbatim, no new file)

**Analog:** itself — this component already exists and is reused for both D-07 (update-available) and D-11 (permanent flush failure).

**Full component** (lines 1-62):
```typescript
'use client'
import { useEffect, useRef } from 'react'

interface Props {
  message: string
  onDismiss: () => void
  duration?: number
}

export default function Toast({ message, onDismiss, duration = 4000 }: Props) {
  const dismissRef = useRef(onDismiss)
  useEffect(() => { dismissRef.current = onDismiss }, [onDismiss])
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), duration)
    return () => clearTimeout(timer)
  }, [duration, message])
  return (
    <div role="status" aria-live="polite" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(7rem+var(--sab,0px))] z-[60] max-w-[90vw] flex items-center gap-2 bg-surface-1 text-foreground rounded-2xl shadow-md px-4 py-3">
      <p className="text-sm">{message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="min-h-[44px] min-w-[44px] -my-1 -mr-2 flex items-center justify-center rounded-md text-muted hover:text-muted-foreground hover:bg-surface-3 active:bg-surface-3 transition-colors text-xl leading-none">×</button>
    </div>
  )
}
```
Both D-07 (update prompt) and D-11 (flush-failure notice) render `<Toast message="…" onDismiss={…}>`. D-07's "tapping it" affordance needs a click handler distinct from `onDismiss` — either wrap `<Toast>`'s message in a clickable parent or extend usage at the call site (do not fork the component; keep `Toast.tsx` itself unmodified, matching StudySession's existing `saveError` toast call-site pattern at lines 483-494).

---

### `components/StudySession.tsx` `submitReview` (modified — event handler, request-response → event-driven)

**Analog:** itself — `postReviewWithRetry` (lines 83-140) and its call site (lines 483-494)

**Retry/backoff/idempotency pattern** (lines 83-133):
```typescript
type SaveFailureReason = 'network' | 'permanent'

async function postReviewWithRetry(
  cardId: string, rating: number, idempotencyKey: string,
  cancelSignal: AbortSignal, onExhausted: (reason: SaveFailureReason) => void,
): Promise<void> {
  const backoffMs = [500, 1500]
  let failureReason: SaveFailureReason = 'network'
  for (let attempt = 0; attempt < 3; attempt++) {
    if (cancelSignal.aborted) return
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, rating, idempotencyKey }), signal: ctrl.signal,
      })
      if (res.ok) return
      if (res.status >= 400 && res.status < 500) { failureReason = 'permanent'; break }
    } catch {
      if (cancelSignal.aborted) return
      // fetch rejected/aborted — counts as a failed attempt; retry
    } finally { clearTimeout(timeoutId) }
    if (attempt < 2) await new Promise<void>((r) => setTimeout(r, backoffMs[attempt]))
  }
  onExhausted(failureReason)
}
```

**Call site** (lines 483-494):
```typescript
void postReviewWithRetry(cardId, rating, idempotencyKey, controller.signal, (reason) => {
  if (isMountedRef.current) {
    setSaveError(
      reason === 'permanent'
        ? "Couldn't save your last review. Your progress may not be recorded."
        : "Couldn't save your last review — check your connection.",
    )
  }
})
```

**Integration point for offline queue:** OFFLINE-03 extends this — a `'network'`-classified exhaustion while `navigator.onLine === false` (or the very first attempt fails while offline) is the trigger to call `enqueueReview()` from `lib/offline-queue.ts` **instead of** calling `setSaveError`. Reuse the exact same `idempotencyKey` already generated at this call site (do not create a second idempotency scheme — see RESEARCH.md "Don't Hand-Roll" table). Do not touch the 4xx/`'permanent'` branch — that still goes through the existing toast path unchanged.

---

### `components/HomeClient.tsx` mount effect (modified — request-response, warm fetch)

**Analog:** itself — the existing `loadStats`/`loadActivity` mount effect + cache-context pattern (lines 44-60 and surrounding).

**Existing imports/pattern** (lines 1-15):
```typescript
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchCacheContext, readCache, writeCache, type HomeCachePayload } from '@/lib/local-cache'
```
D-01–D-04's warm fetch (call `getStudyCards({ scope: 'due' })` equivalent client route, or directly hit whatever endpoint `/study` uses) belongs in this same mount effect, following the existing `versionRef`/`buildIdRef`-based cache-context adoption pattern already used for `stats`/`activityData` (lines 44-60). Cancellation-guarded via the same `isMountedRef`/`let cancelled = false` idiom already established in this file and in `FreshnessWatcher.tsx`.

**Integration point:** write the fetched due-session pool into `lib/local-cache.ts`'s `study` cache entry (`StudyCachePayload`, already defined at line 71) via `writeCache`, so `StudyClient.tsx`'s own mount-time `readCache('study', …)` finds a fresh pool even if `/study` itself was never visited this session (D-01).

---

### `middleware.ts` (modified — request-response, matcher only)

**Analog:** itself.

**Current matcher** (lines 39-45):
```typescript
export const config = {
  matcher: [
    '/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png|apple-icon.*\\.png).*)',
  ],
}
```
**Required change (Pitfall 3):** add `sw\\.js` (and optionally `fonts/.*`) to the negative-lookahead exclusion list so a SW-initiated `fetch('/sw.js')` or install-time precache fetch of `/fonts/*` never gets redirected to `/login` (a redirected response is fatal to SW registration/update and can poison the precache with an HTML login page). Keep the rest of the file (cookie/cron logic, lines 1-37) untouched — this is a one-line matcher-regex edit only.

---

### `lib/local-cache.ts` `fetchCacheContextOrLastKnown` (modified — CRUD, adds a fallback wrapper)

**Analog:** itself — `fetchCacheContext()` (referenced throughout, exact signature not shown in the read range but consumed identically at all 4 `*Client.tsx` call sites) and the module's existing header-comment convention for documenting *why* a rule exists (lines 1-29).

**Target implementation** — already fully specified in RESEARCH.md Pattern 5:
```typescript
const LAST_CONTEXT_KEY = 'ks-last-cache-context'

export async function fetchCacheContextOrLastKnown(): Promise<CacheContext | null> {
  const live = await fetchCacheContext()
  if (live) {
    try { localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify(live)) } catch {}
    return live
  }
  try {
    const raw = localStorage.getItem(LAST_CONTEXT_KEY)
    return raw ? (JSON.parse(raw) as CacheContext) : null
  } catch { return null }
}
```
Follow the existing module's header-comment convention (see lines 1-29 of `lib/local-cache.ts`) — add a short comment block above this function explaining the offline-cold-launch gap it closes (mirrors the existing "Build-ID namespacing" / "Version-check revalidation" comment blocks already in the file). Update all 4 `*Client.tsx` mount-effect call sites (`StudyClient.tsx`, `CardsClient.tsx` ×2, `HabitsClient.tsx`, `HomeClient.tsx`) to call this new wrapper instead of the bare `fetchCacheContext()`.

---

### `scripts/gen-sw.mjs` (build script, file-I/O batch)

**Analog:** `scripts/gen-icons.mjs`

**File header/module pattern** (`gen-icons.mjs`, plain Node ESM script, no project-specific imports beyond `sharp`/`fs`):
```javascript
// scripts/gen-icons.mjs — plain Node ESM script, run manually via `node scripts/gen-icons.mjs`
```
`gen-sw.mjs` follows the same "plain Node ESM script in `scripts/`, no TS, uses only `node:fs`/`node:path`" convention — but unlike `gen-icons.mjs` (manually run, output committed), `gen-sw.mjs` must be wired into the `build` npm script itself (`"build": "prisma generate && next build && node scripts/gen-sw.mjs"`) since its output (`public/sw.js`) changes on every deploy, not just on manual icon edits. Full implementation already specified in RESEARCH.md Architecture Pattern 1 (`scripts/gen-sw.mjs` walking `.next/static/`).

**Decision needed at plan time:** whether `public/sw.js` is committed (mirroring `gen-icons.mjs`'s committed-PNG convention) or gitignored (RESEARCH.md leans gitignore, since it changes every deploy) — flagged as an open call in RESEARCH.md's Recommended Project Structure comment, not resolved here.

---

## Shared Patterns

### Silent-fallback IndexedDB error handling
**Source:** `lib/local-cache.ts` (module-wide convention, see header comments lines 1-29 and the lazy-open discipline at lines 24-29/78-79)
**Apply to:** `lib/offline-queue.ts`, `lib/local-cache.ts`'s new `fetchCacheContextOrLastKnown`
Every IndexedDB read/write wraps in `try/catch` and degrades to `undefined`/no-op rather than throwing — never surfaces a raw IndexedDB error to a caller or the UI.

### Foreground-boundary event set (`visibilitychange`/`pageshow`/`popstate`/`online`)
**Source:** `components/FreshnessWatcher.tsx` (lines 76-113) and `components/Nav.tsx`'s `isOffline` effect (lines 22-38)
**Apply to:** `components/ServiceWorkerProvider.tsx` (SW update check, D-09) and the offline-queue flush trigger
```typescript
// Nav.tsx's online/offline listener pattern (lines 28-38):
const [isOffline, setIsOffline] = useState(false)
useEffect(() => {
  const update = () => setIsOffline(!navigator.onLine)
  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
}, [])
```
Both the SW update check and the queue flush should trigger off this same event set (`visibilitychange` gated on `document.visibilityState === 'visible'`, `pageshow` gated on `e.persisted`, plus `online`) — do not duplicate raw listener code across `ServiceWorkerProvider.tsx` and the queue-flush call site; factor into `lib/useForegroundResume.ts` per RESEARCH.md's Recommended Project Structure if reused in 2+ places.

### react-hooks/purity — no `Date.now()`/`Math.random()` in render
**Source:** `FreshnessWatcher.tsx` line 78-80 comment; project-wide convention (CLAUDE.md, `.claude/CLAUDE.md`)
**Apply to:** any timestamp write in `lib/offline-queue.ts` (`queuedAt`), the SW update-check coalesce timer, `enqueueReview`'s `idempotencyKey` generation (`crypto.randomUUID()` is fine — not Math.random/Date.now — but must still be called from an event handler, never module/render scope)

### Idempotency-key reuse (never a second dedup scheme)
**Source:** `components/StudySession.tsx`'s existing idempotencyKey generation at the `postReviewWithRetry` call site + `app/api/review/route.ts`'s `ReviewLog` UNIQUE-constraint handling (lines 96-118, 140-179)
**Apply to:** `lib/offline-queue.ts`'s `enqueueReview`/`flushQueue`
The offline queue must reuse the exact same idempotencyKey generated at grade-time, never mint a second one on flush — `app/api/review/route.ts` already treats a duplicate `idempotencyKey` as an idempotent 200 (see the P2002/`isUniqueConstraintError` catch block, lines 163-179), so re-flushing an already-applied entry after a force-quit mid-flush is already safe with zero server changes.

### Middleware auth-exclusion list edits
**Source:** `middleware.ts` `config.matcher` (lines 39-45)
**Apply to:** adding `sw.js` (Pitfall 3) — same one-line regex-array-string edit pattern already used for `manifest.webmanifest`/`icon-*.png`/`apple-icon*.png` in Phase 30.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `public/sw.js` (generated) | service-worker | fetch interception (install/activate/fetch/message events) | No service worker exists anywhere in this codebase today — genuinely net-new browser-API surface. Use RESEARCH.md Architecture Patterns 1-3 (precache generation, skipWaiting/clients.claim sequencing, navigation fallback) as the source of truth; there is no in-repo analog to copy from. |
| `lib/service-worker.ts` (registration/update-check glue) | utility | event-driven (SW lifecycle: `updatefound`/`statechange`/`controllerchange`) | No prior SW registration code exists. Closest *stylistic* analog is `lib/local-cache.ts`'s plain-module-no-'use client' convention, but the actual `navigator.serviceWorker` API surface is new — use RESEARCH.md Pattern 2's `registerServiceWorker`/`activateWaitingWorker` code directly. |

## Metadata

**Analog search scope:** `lib/`, `components/`, `scripts/`, `app/api/review/`, `middleware.ts`
**Files scanned:** `lib/local-cache.ts`, `components/FreshnessWatcher.tsx`, `components/Toast.tsx`, `components/Nav.tsx`, `components/StudySession.tsx`, `components/HomeClient.tsx`, `app/api/review/route.ts`, `middleware.ts`, `scripts/gen-icons.mjs`
**Pattern extraction date:** 2026-08-10
