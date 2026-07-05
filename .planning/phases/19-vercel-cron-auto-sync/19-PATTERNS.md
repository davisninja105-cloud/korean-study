# Phase 19: Vercel Cron Auto-Sync - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 9 (1 config, 3 new code files, 5 modified, 1 new test)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `vercel.json` | config | n/a (platform declaration) | none (first Vercel-specific config file in repo) | no analog |
| `lib/sync.ts` | service | request-response / event-driven (extraction pipeline) | `lib/study-cards.ts` / `lib/dashboard.ts` | exact (shared-core-extracted-from-route pattern) |
| `lib/settings.ts` (add `getLastAutoSyncedAt`/`setLastAutoSyncedAt`) | service | CRUD (scalar Setting row) | itself — `getDailyGoalSeconds`/`setDailyGoalSeconds` (same file, lines 15-29) | exact |
| `lib/auth.ts` (add `isValidCronAuth`) | utility | request-response (pure predicate) | itself — `computeAuthToken` (same file, lines 10-25) | exact |
| `app/api/sync/route.ts` | controller/route | request-response | itself (pre-refactor) → becomes thin wrapper mirroring `app/api/cards/due/route.ts`'s relationship to `lib/study-cards.ts` | exact |
| `app/api/cron/sync/route.ts` | route | request-response | `app/api/sync/route.ts` (pre-refactor handler; also structurally similar to `GET /api/cards/due`) | role-match |
| `app/api/settings/route.ts` | route | CRUD | itself (extend GET/PUT with one more field) | exact |
| `middleware.ts` | middleware | request-response (auth gate) | itself (add branch) | exact |
| `app/settings/page.tsx` | component | request-response (client fetch/display) | itself — Advanced `<details>` section (lines 458-467) | exact |
| `tests/auth.test.ts` | test | transform (pure fn in/out) | `tests/card-key.test.ts` | exact |

## Pattern Assignments

### `lib/sync.ts` (service, request-response/event-driven)

**Analog:** `lib/study-cards.ts` (shared-core pattern) + current body of `app/api/sync/route.ts` (the logic to move)

**Shared-core module header pattern** (`lib/study-cards.ts` lines 1-11):
```typescript
// lib/study-cards.ts — server-only due-card pipeline
// No 'use client' — this module runs server-side only.
// Extracts the pool-fetch + edge-fetch + knownLemmas + selectSessionCards +
// sequenceCards + annotation pipeline from app/api/cards/due/route.ts so
// both the RSC study page and the API route call one shared, DRY function.

import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO } from '@/lib/dto'

export interface StudyCardsParams { ... }
export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]> { ... }
```
Apply the same header comment convention to `lib/sync.ts`: `// No 'use client' — this module runs server-side only.` plus a one-line note that this was extracted from `app/api/sync/route.ts` so both the manual route and `GET /api/cron/sync` call one shared function.

**Params/result interface convention** — mirror `StudyCardsParams` with a `SyncResult` interface (already specified in RESEARCH.md Pattern 1):
```typescript
export interface SyncResult {
  synced: boolean
  newLessons: number
  newCards: number
  remaining: number
  failed: number
  failures?: string[]
  message?: string
}

export async function runSync(documentId: string): Promise<SyncResult> {
  // body = current app/api/sync/route.ts lines 29-321 (everything between
  // `const lessonDataList = await fetchGoogleDoc(documentId)` and the final
  // `return NextResponse.json({...})` — convert the NextResponse.json(...) call
  // into a plain returned object matching SyncResult).
}
```

**Exact source body to move** — `app/api/sync/route.ts` lines 22-329 (the whole `POST` handler). Everything from `const lessonDataList = await fetchGoogleDoc(documentId)` (line 31) through the `newLessons`/`newCards`/`remaining`/`failures` bookkeeping (lines 90-311) is pure business logic with no dependency on `NextRequest`/`NextResponse` except the final response shape — this is what moves into `runSync()` verbatim. The outer `try/catch` (lines 23, 322-328) also moves inside `runSync()` so the thin route wrapper doesn't need to duplicate the "Sync failed — see server logs" message; alternatively let `runSync()` throw and have each thin caller catch — RESEARCH.md's Pattern 1 example keeps a caller-side try/catch, so prefer that shape (mirrors `getStudyCards()` which throws and lets callers decide status codes).

**Thin wrapper pattern after extraction** (mirrors `app/api/cards/due/route.ts`'s relationship to `getStudyCards()` — not shown above but same shape as RESEARCH.md's Pattern 1 example):
```typescript
// app/api/sync/route.ts — after refactor
import { runSync } from '@/lib/sync'
export const maxDuration = 300
export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json()
    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }
    const result = await runSync(documentId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed — see server logs for details' }, { status: 500 })
  }
}
```

**Concurrent independent queries pattern** (worth reusing inside `runSync()` if any new queries are added) — `lib/study-cards.ts` lines 39-65 shows the `Promise.allSettled` critical/non-critical split; `lib/dashboard.ts` lines 20-31 shows a plain `Promise.all` for independent queries with no partial-failure tolerance needed. `runSync()`'s existing internal `Promise.allSettled(batch.map(...))` for extraction (route.ts lines 60-64) already follows this convention — preserve unchanged.

---

### `lib/settings.ts` (service, CRUD) — add `getLastAutoSyncedAt`/`setLastAutoSyncedAt`

**Analog:** same file, existing `GOAL_KEY`/`getDailyGoalSeconds`/`setDailyGoalSeconds` (lines 5, 15-29)

**Key constant + getter/setter pattern to copy** (lines 5-29):
```typescript
const GOAL_KEY = 'dailyGoalSeconds'
// ...
export async function getDailyGoalSeconds(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: GOAL_KEY } })
  const n = row ? parseInt(row.value, 10) : NaN
  return Number.isFinite(n) ? n : DEFAULT_GOAL_SECONDS
}

export async function setDailyGoalSeconds(seconds: number): Promise<number> {
  const clamped = Math.max(60, Math.min(3600, Math.round(seconds))) // 1–60 min
  await prisma.setting.upsert({
    where: { key: GOAL_KEY },
    create: { key: GOAL_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  })
  return clamped
}
```
For `lastAutoSyncedAt` there is no numeric clamping needed (it's a raw ISO string, not a number) — instead follow the `getButtonColor`/`setButtonColor` shape (lines 93-111) which stores/returns a plain string with light validation, but since RESEARCH.md's Pattern 4 already gives the exact getter/setter (no clamping — just store the ISO string as-is), use that verbatim:
```typescript
const LAST_AUTO_SYNCED_KEY = 'lastAutoSyncedAt'

export async function getLastAutoSyncedAt(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: LAST_AUTO_SYNCED_KEY } })
  return row?.value ?? null
}

export async function setLastAutoSyncedAt(iso: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: LAST_AUTO_SYNCED_KEY },
    create: { key: LAST_AUTO_SYNCED_KEY, value: iso },
    update: { value: iso },
  })
}
```
Note the return-type asymmetry vs. every other setter in this file (they return the clamped/validated value; this one returns `void`) — acceptable because the caller (`app/api/cron/sync/route.ts`) already has the ISO string it just wrote and doesn't need it echoed back, unlike the Settings page pattern where the PUT response round-trips the value for client state sync.

---

### `lib/auth.ts` (utility, request-response) — add `isValidCronAuth`

**Analog:** same file, `computeAuthToken` (lines 1-25)

**Existing pure-function + module header style to match:**
```typescript
// Shared auth helpers for the single-password gate. Uses Web Crypto (HMAC)
// so it runs in both the Edge middleware and Node route handlers.

export const AUTH_COOKIE = 'ks_auth'
const MESSAGE = 'korean-study-authenticated'

// Deterministic session token = HMAC-SHA256(AUTH_SECRET, MESSAGE). The cookie
// stores this; middleware recomputes and compares. Without AUTH_SECRET the
// token can't be forged.
export async function computeAuthToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  ...
}
```
`isValidCronAuth` should be added below this, as a **named export, pure, synchronous** (unlike `computeAuthToken` which is async due to Web Crypto) — matching the file's existing "single source of truth" doc-comment convention:
```typescript
// Fail-closed bearer-token check for Vercel Cron requests. Pure and
// synchronous (no Web Crypto needed — plain string comparison), so it is
// directly unit-testable without mocking crypto or env vars.
export function isValidCronAuth(authHeader: string | null, cronSecret: string | undefined): boolean {
  // Fail closed: an unset/empty secret must NEVER validate, regardless of authHeader.
  return typeof cronSecret === 'string' && cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`
}
```
Note the existing file has no `try/catch` in `computeAuthToken` itself — the `try/catch` lives at the call site in `middleware.ts` (see below). `isValidCronAuth` needs no try/catch at all since it does no fallible work (no crypto, no I/O) — straight boolean expression, consistent with "pure library functions throw on unexpected input" being N/A here since there's no invalid input shape to reject (any string/undefined is handled by the type signature already).

---

### `middleware.ts` (middleware, request-response)

**Analog:** itself — existing cookie-check branch (lines 1-31)

**Full existing structure to extend (not replace):**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, computeAuthToken } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(AUTH_COOKIE)?.value

  let authed = false
  try {
    authed = !!cookie && cookie === (await computeAuthToken())
  } catch {
    authed = false // AUTH_SECRET missing — fail closed
  }

  if (authed) return NextResponse.next()

  // Unauthenticated: 401 for API calls, redirect to /login for pages.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png|apple-icon.*\\.png).*)',
  ],
}
```
**Fail-closed cookie pattern to mirror exactly for the new bearer branch:** note line 8-12's `try { authed = ... } catch { authed = false }` — this is the same "fail closed on missing secret" philosophy the new `isValidCronAuth` branch must follow, just expressed as a pure boolean instead of a try/catch (since `isValidCronAuth` never throws). The new branch must be inserted **before** the cookie check and must **return early** for the cron path so it never falls through into the cookie logic (a cron request will never carry the `ks_auth` cookie, and letting it fall through would just redirect it to `/login`, wasting the 401 semantics cron monitoring expects):
```typescript
import { AUTH_COOKIE, computeAuthToken, isValidCronAuth } from '@/lib/auth'

const CRON_SYNC_PATH = '/api/cron/sync'

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === CRON_SYNC_PATH) {
    const authHeader = req.headers.get('authorization')
    if (isValidCronAuth(authHeader, process.env.CRON_SECRET)) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ...existing cookie-based check below, completely unchanged...
}
```
**Matcher: no change needed** — the existing negative-lookahead (line 29) already includes `/api/cron/sync` (it only excludes `login`, `api/login`, and static/PWA assets), satisfying the phase's hard constraint that the cron path must never be carved out of the matcher.

---

### `app/api/settings/route.ts` (route, CRUD)

**Analog:** itself (extend existing GET/PUT with one more field)

**Existing GET pattern (lines 12-23):**
```typescript
export async function GET() {
  const [dailyGoalSeconds, dayStartHour, buttonColor, rewardColor, sessionSize, readingTextScale, readingAid] = await Promise.all([
    getDailyGoalSeconds(),
    getDayStartHour(),
    getButtonColor(),
    getRewardColor(),
    getSessionSize(),
    getReadingTextScale(),
    getReadingAid(),
  ])
  return NextResponse.json({ dailyGoalSeconds, dayStartHour, buttonColor, rewardColor, sessionSize, readingTextScale, readingAid })
}
```
Add `getLastAutoSyncedAt()` to this `Promise.all` array and the returned object. **Important asymmetry:** `lastAutoSyncedAt` is **read-only** from the client's perspective (only the cron route ever calls the setter) — so unlike every other field here, it must appear in `GET` but should **NOT** be accepted as a settable field in `PUT`. The existing `PUT` handler (lines 25-61) validates each field with a `has*` boolean and only calls the setter when present in the request body — simply omit `lastAutoSyncedAt` from that destructure/validation entirely so a client PUT can never overwrite it (defense in depth beyond just "the UI doesn't expose a control for it").

**Existing PUT validation-per-field pattern (lines 25-61)** — shown for reference on how fields are conditionally set vs. read-through; new field does NOT participate in this pattern at all (GET-only).

---

### `app/api/sync/route.ts` (route, request-response) — pre-refactor body

**Analog:** N/A — this file IS the source; see `lib/sync.ts` section above for what moves. Post-refactor it becomes the thin wrapper shown there. Preserve the `export const maxDuration = 300` line (route.ts line 13) — this constant governs the route's declared max duration and is orthogonal to the `runSync()` extraction; it stays on the route file, not the lib file (matches how `MAX_LESSONS_PER_SYNC` — a business-logic constant — moves into `lib/sync.ts` per RESEARCH.md Pattern 1, lines 162, while `maxDuration` — a Next.js route-segment config export — must stay in `route.ts` since Next.js only recognizes it as a route-file-level export).

---

### `app/api/cron/sync/route.ts` (route, request-response) — new file

**Analog:** `app/api/sync/route.ts` (pre-refactor handler, for the try/catch + response shape convention) — full pattern already given in RESEARCH.md Pattern 4, reproduced here as the concrete target:
```typescript
import { runSync } from '@/lib/sync'
import { setLastAutoSyncedAt } from '@/lib/settings'
import { NextResponse } from 'next/server'

export const maxDuration = 300

export async function GET() {
  try {
    const documentId = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID
    if (!documentId) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_GOOGLE_DOC_ID is not set' }, { status: 500 })
    }
    const result = await runSync(documentId)
    // Only reached if runSync() didn't throw.
    await setLastAutoSyncedAt(new Date().toISOString())
    return NextResponse.json(result)
  } catch (err) {
    console.error('Cron sync error:', err)
    return NextResponse.json({ error: 'Cron sync failed — see server logs' }, { status: 500 })
  }
}
```
Matches the `try { ... } catch (e) { return NextResponse.json({ error: ... }, { status: 500 }) }` convention documented in `.claude/CLAUDE.md` § Error Handling / API Routes, and the existing error-message style of `app/api/sync/route.ts` line 322-327 (`console.error` + generic "see server logs" message, no leaking of internal error detail to the client).

---

### `app/settings/page.tsx` (component, request-response)

**Analog:** itself — existing Advanced `<details>` section (lines 458-467) and the `useEffect` GET-fetch pattern (lines 38-53)

**Existing fetch-and-populate pattern (lines 38-53):**
```typescript
useEffect(() => {
  fetch('/api/settings')
    .then((r) => r.json())
    .then((d) => {
      setGoal(d.dailyGoalSeconds ?? 300)
      setDayStartHour(d.dayStartHour ?? 2)
      // ... one setState per field ...
      setLoaded(true)
    })
    .catch(() => setLoaded(true))
}, [])
```
Add a new `const [lastAutoSyncedAt, setLastAutoSyncedAt] = useState<string | null>(null)` and a corresponding `setLastAutoSyncedAt(d.lastAutoSyncedAt ?? null)` line inside this same effect — no new fetch needed, since it now rides along in the existing `GET /api/settings` payload per the `app/api/settings/route.ts` change above.

**Existing Advanced section to extend (lines 458-467):**
```tsx
{/* Advanced — back-office plumbing kept off the home screen */}
<details className="group">
  <summary className="flex items-center gap-2 text-sm font-medium text-muted cursor-pointer select-none px-1 py-2">
    <span>Advanced</span>
    <span className="text-xs opacity-60 transition-transform group-open:rotate-90">▶</span>
  </summary>
  <div className="mt-2">
    <SyncPanel onSynced={() => {}} />
  </div>
</details>
```
Insert the timestamp display just above or below `<SyncPanel onSynced={() => {}} />` inside the same `<div className="mt-2">`, formatted at render time (per RESEARCH.md's "format at render time" recommendation, matching the `lib/dto.ts` convention of raw ISO strings crossing the network boundary and only being formatted in the component). A `text-xs text-muted` paragraph matching the existing muted-caption style used elsewhere on this page (e.g. line 165's `<p className="text-sm text-muted mt-0.5">`) is the right visual weight — this is a passive status line, not an actionable control, so it should NOT get its own `<section className="bg-surface-1 rounded-2xl shadow-md p-6 ...">` card treatment like the other settings groups; it belongs inside the existing Advanced disclosure, consistent with "back-office plumbing kept off the home screen" per the section's own comment.

---

### `tests/auth.test.ts` (test, transform)

**Analog:** `tests/card-key.test.ts` (full file, 37 lines — pure-function unit test convention)

**Full structural pattern to copy:**
```typescript
import { describe, it, expect } from 'vitest'
import { normalizeFront } from '../lib/card-key'

describe('normalizeFront', () => {
  it('trims whitespace', () => {
    expect(normalizeFront('  가다  ')).toBe('가다')
  })
  // ... one `it` block per distinct behavior/edge case ...
})
```
For `isValidCronAuth`, mirror this exactly — relative import (`'../lib/auth'`, matching `card-key.test.ts`'s `'../lib/card-key'` style, not the `@/` alias used in app code — the existing test files use relative imports), one `describe` block, and `it` blocks covering:
- valid bearer header + matching non-empty secret → `true`
- valid header format but wrong secret value → `false`
- `cronSecret` is `undefined` (unset env var) → `false` regardless of header (the fail-closed case named explicitly in RESEARCH.md/ROADMAP)
- `cronSecret` is empty string `''` → `false` (fail-closed even when the var exists but is blank)
- `authHeader` is `null` (header missing entirely) → `false`
- malformed header (e.g. missing `Bearer ` prefix, wrong-case, extra whitespace) → `false`

## Shared Patterns

### Server-only module header comment
**Source:** `lib/study-cards.ts` line 2, `lib/dashboard.ts` line 2
**Apply to:** `lib/sync.ts`
```typescript
// No 'use client' — this module runs server-side only.
```

### Fail-closed try/catch around a throwing auth primitive
**Source:** `middleware.ts` lines 8-12
**Apply to:** conceptually informs `isValidCronAuth`'s design (explicit boolean-returning check with no ambiguous falsy-shortcut), even though the new function itself needs no try/catch (it never throws).
```typescript
try {
  authed = !!cookie && cookie === (await computeAuthToken())
} catch {
  authed = false // AUTH_SECRET missing — fail closed
}
```

### API route try/catch + generic error message
**Source:** `.claude/CLAUDE.md` § Error Handling; `app/api/sync/route.ts` lines 322-328
**Apply to:** `app/api/cron/sync/route.ts`, refactored `app/api/sync/route.ts`
```typescript
try {
  // ...
} catch (err: unknown) {
  console.error('Sync error:', err)
  return NextResponse.json({ error: 'Sync failed — see server logs for details' }, { status: 500 })
}
```

### Setting getter/setter key-constant convention
**Source:** `lib/settings.ts` lines 5-11 (key constants), lines 15-29 (getter/setter pair)
**Apply to:** `getLastAutoSyncedAt`/`setLastAutoSyncedAt`
```typescript
const GOAL_KEY = 'dailyGoalSeconds'
// ... getter reads via prisma.setting.findUnique, setter upserts ...
```

### GET/PUT settings route — conditional-set-else-read-through
**Source:** `app/api/settings/route.ts` lines 25-61
**Apply to:** any new PUT-settable field (NOT applicable to `lastAutoSyncedAt`, which is GET-only — noted explicitly above to prevent accidental client-writability)

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `vercel.json` | config | n/a | First Vercel-platform-specific config file in this repo (no `now.json` legacy file either) — use RESEARCH.md's Pattern 2 verbatim (`{"$schema": "https://openapi.vercel.sh/vercel.json", "crons": [{"path": "/api/cron/sync", "schedule": "0 10 * * *"}]}`), sourced from official Vercel docs rather than an in-repo analog. |

## Metadata

**Analog search scope:** `lib/`, `app/api/`, `app/settings/`, `middleware.ts`, `tests/`
**Files scanned:** `lib/study-cards.ts`, `lib/dashboard.ts`, `lib/settings.ts`, `lib/auth.ts`, `middleware.ts`, `app/api/sync/route.ts`, `app/api/settings/route.ts`, `app/settings/page.tsx`, `tests/card-key.test.ts`, RESEARCH.md
**Pattern extraction date:** 2026-07-04
