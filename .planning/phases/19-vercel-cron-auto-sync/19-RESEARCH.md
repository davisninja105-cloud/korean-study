# Phase 19: Vercel Cron Auto-Sync - Research

**Researched:** 2026-07-04
**Domain:** Vercel platform integration (Cron Jobs + Edge Middleware auth) on top of an existing Next.js/Prisma/Turso app
**Confidence:** HIGH

## Summary

This phase wires the existing `POST /api/sync` extraction pipeline to Vercel's native Cron Jobs feature so the deck refreshes daily without a manual tap, while keeping the endpoint inside the app's existing auth-gated surface. There are three moving parts, and all three are low-risk, additive changes with **zero new npm dependencies**:

1. **`vercel.json`** (new file — first Vercel-specific config file in this repo) declares a single daily cron job pointing at a new `GET /api/cron/sync` route. Vercel's own infrastructure — not application code — is responsible for scheduling; the app only needs to expose an endpoint and verify who's calling it.
2. **A bearer-token branch in `middleware.ts`** authenticates cron-triggered requests. Vercel automatically attaches `Authorization: Bearer <CRON_SECRET>` to every cron-invoked request when the `CRON_SECRET` env var is set on the project — no extra Vercel-side wiring beyond setting the env var. This is additive to (not a replacement for) the existing HMAC-cookie gate; the two auth mechanisms protect different endpoints and must not interfere with each other.
3. **A shared `lib/sync.ts:runSync()`** extraction pulls the existing `POST /api/sync` body out into a reusable function (mirroring the already-established `lib/study-cards.ts` / `lib/dashboard.ts` pattern), called by both the manual route and the new cron route. The `MAX_LESSONS_PER_SYNC=1` behavior, per-lesson failure reporting, and `remaining` count must be preserved unchanged — this is a pure refactor, not a behavior change, for the manual path.

The "last auto-synced" timestamp (SYNC-04) requires **no schema change** — it is a new `Setting` row (generic key/value table already exists), following the exact `lib/settings.ts` getter/setter pattern used by every other setting in the app.

**Primary recommendation:** Extract `runSync()` into `lib/sync.ts` first (pure refactor, verify manual sync still behaves identically), then add the `vercel.json` cron declaration + new `GET /api/cron/sync` route + middleware bearer-token branch as one cohesive unit, then add the Setting-backed timestamp last (touches `lib/settings.ts`, `app/api/settings/route.ts`, and the Settings ▸ Advanced UI). The timestamp write belongs in the cron route itself, called only after `runSync()` resolves without throwing — never inside `runSync()`, so the manual sync path is untouched and the timestamp genuinely means "last unattended run," not "last sync of any kind."

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cron scheduling (when to invoke) | Platform/Infra (Vercel Cron, declared in `vercel.json`) | — | Vercel's own scheduler; not application code. The app has no control over exact invocation time (only ±59 min precision window on Hobby). |
| Cron request authentication | Frontend Server / Edge Middleware (`middleware.ts`) | — | `middleware.ts` already owns all request-level auth for this app (the HMAC cookie gate); a second bearer-token branch belongs in the same file, not duplicated inside the route handler. |
| Sync extraction logic (fetch doc → extract cards → upsert → link deps) | API/Backend (`lib/sync.ts:runSync()`) | Database/Storage (Prisma writes) | Already lives at this tier in `app/api/sync/route.ts`; extraction only moves the code, not the tier. |
| "Last auto-synced" timestamp write | API/Backend (`app/api/cron/sync/route.ts`, after `runSync()` resolves) | Database/Storage (`Setting` table via `lib/settings.ts`) | Must NOT live inside `runSync()` — the manual path must stay behaviorally identical (per phase approach note), and the timestamp's meaning ("an unattended cron run completed") is cron-route-specific. |
| "Last auto-synced" timestamp display | Browser/Client (`app/settings/page.tsx`, client component) | API/Backend (`GET /api/settings`) | Settings page is already a `'use client'` page that fetches `/api/settings` in a `useEffect` — this is an additive field on the same existing fetch, not a new data-fetching pattern. |

## User Constraints

No `CONTEXT.md` exists for this phase (discuss-phase was not run). ROADMAP.md's phase section is the scope source; treat its "Approach note" and "Success Criteria" as locked (they were written into the roadmap deliberately, not left to discretion):

### Locked (from ROADMAP.md phase section)
- Extract `POST /api/sync` body into `lib/sync.ts:runSync()`, mirroring `lib/study-cards.ts`/`lib/dashboard.ts`. Called by both the manual route and a new `GET /api/cron/sync`.
- Auth is a new bearer-token branch **inside `middleware.ts`** (not inside the route handler).
- The cron route **stays inside the existing auth matcher** — never excluded from it.
- Must fail closed if `CRON_SECRET` is unset — explicitly: never write `if (secret && authHeader !== ...)` (this pattern silently disables auth when the env var is missing, because the whole condition short-circuits to `false` and the unauthorized branch never executes).
- Cron triggers exactly 1 lesson via the existing `MAX_LESSONS_PER_SYNC=1` path (no batch-size change).
- Settings ▸ Advanced shows a "last auto-synced" timestamp.

### Claude's Discretion
- Exact cron schedule time (any UTC time satisfying Hobby's "once per day" rule).
- Whether the timestamp Setting key stores a raw ISO string or a formatted value (recommend raw ISO, format at render time — matches `lib/dto.ts` convention of ISO strings crossing boundaries).
- Whether to extract a pure `isValidCronAuth()`/`verifyCronAuth()` helper into `lib/auth.ts` for unit-testability (recommended — see Validation Architecture).
- Whether the cron route also writes the timestamp on partial per-lesson failure (recommend: yes, as long as `runSync()` didn't throw — see Common Pitfalls).

### Deferred Ideas (OUT OF SCOPE)
- Rate limiting on `/api/sync` — explicitly out of scope per `.planning/REQUIREMENTS.md` (carried over from v1.3; single-tenant app, Hobby timeout already caps damage).
- Time-bound HMAC auth tokens — explicitly out of scope (deterministic token accepted tradeoff, carried over from v1.3). Do not extend this reasoning to `CRON_SECRET` — the cron secret is a completely separate mechanism (raw string compare against an env var, not an HMAC token) and needs no time-bounding either.
- Any UI beyond a plain timestamp in Settings ▸ Advanced (no retry button, no failure detail list for cron-specific runs — that's what `SyncPanel`'s manual flow already covers).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-02 | A Vercel Cron job runs daily and triggers exactly 1 lesson of sync via the existing `MAX_LESSONS_PER_SYNC=1` path | `vercel.json` crons array (verified official docs) + `lib/sync.ts:runSync()` extraction preserving `MAX_LESSONS_PER_SYNC=1` unchanged |
| SYNC-03 | Cron-triggered requests authenticate via a `CRON_SECRET` bearer token, checked inside `middleware.ts`, fail-closed if the secret is unset | Verified Vercel auto-injects `Authorization: Bearer <CRON_SECRET>`; fail-closed pattern confirmed against Vercel's own reference implementation |
| SYNC-04 | Settings ▸ Advanced shows a "last auto-synced" timestamp | `Setting` table (no schema change) + `lib/settings.ts` getter/setter pattern + existing Settings page `Advanced` `<details>` section |

## Standard Stack

### Core
No new libraries. This phase is 100% platform configuration (`vercel.json`) + application code reusing existing project conventions (Prisma `Setting` table, `lib/` extraction pattern, `middleware.ts`).

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Vercel Cron Jobs | Platform feature, no version | Scheduled invocation of `GET /api/cron/sync` | Native Vercel feature; no third-party scheduler needed for a single daily job [VERIFIED: vercel.com/docs/cron-jobs, fetched 2026-07-04] |
| `vercel.json` | Config file, `$schema` optional | Declares the `crons` array | The only supported way to declare cron jobs for a Next.js App Router project (no "vercel.ts" typed config exists — see State of the Art) [VERIFIED: vercel.com/docs/cron-jobs, vercel.com/docs/project-configuration] |
| `Setting` (Prisma model, already exists) | n/a | Stores `lastAutoSyncedAt` as a generic key/value row | Already the single source of truth for every other app setting; adding a key requires **no** Turso DDL — confirmed no schema change needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel Cron Jobs | External scheduler (GitHub Actions cron, cron-job.org, Upstash QStash) hitting the same endpoint | Unnecessary — Vercel Cron is free on Hobby, zero extra infra, and the phase requirements explicitly name "Vercel Cron." Only relevant if Hobby's once-per-day limit becomes a blocker later. |
| A new `CardDependency`-style DDL migration to store the timestamp on a dedicated table | Generic `Setting` key | Adding a dedicated column/table would hit the exact Turso `prisma db push` gotcha this repo has already worked around (`libsql://` doesn't support the schema engine). The `Setting` table exists precisely to avoid this for exactly this kind of scalar value. |

**Installation:** None — no new dependencies. Only a new file (`vercel.json`) at the project root and standard app code additions.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero external packages. All work is platform configuration (`vercel.json`) plus reuse of already-installed, already-vetted dependencies (`@prisma/client`, `next`). No `npm install` command is part of this phase's plan.

## Architecture Patterns

### System Architecture Diagram

```
[Vercel Cron Scheduler]                         [Human, via Settings page]
        |                                                |
        | GET, once/day, UTC                             | GET /api/settings (fetch)
        | headers: Authorization: Bearer <CRON_SECRET>   |
        | headers: x-vercel-cron-schedule: <expr>        |
        | headers: user-agent: vercel-cron/1.0           |
        v                                                v
+---------------------------+                +-----------------------+
| middleware.ts             |                | middleware.ts         |
| (Edge, runs on every req  |                | (cookie branch, as    |
|  matched by `config.matcher`) |             |  today — unaffected) |
|                            |                +-----------------------+
| NEW: if path === cron path|                            |
|   check bearer token       |                            v
|   fail-closed if no secret|                +-----------------------+
+---------------------------+                | GET /api/settings     |
        | authorized                         | returns lastAutoSynced|
        v                                    | AtSetting value       |
+---------------------------+                +-----------------------+
| GET /api/cron/sync        |                            |
| (new route)                |                            v
|  1. runSync(docId)         |                +-----------------------+
|  2. on success (no throw): | ------------->  | app/settings/page.tsx |
|     setLastAutoSyncedAt()  |  Setting row     | Advanced section:    |
+---------------------------+  written here    | "Last auto-synced:   |
        |                                       |  <formatted date>"   |
        v                                       +-----------------------+
+---------------------------+
| lib/sync.ts: runSync()    |  <-- ALSO called by:
|  (extracted from the      |      POST /api/sync (existing manual route,
|   current POST /api/sync  |       triggered by SyncPanel "Sync now" button)
|   handler body, unchanged |      -- behavior here must NOT change.
|   behavior)                |
|  - fetchGoogleDoc()        |
|  - extractCardsFromNotes() |
|  - upsert cards            |
|  - resolveDependencyEdges()|
+---------------------------+
```

### Recommended Project Structure
```
vercel.json                       # NEW — first Vercel-specific config file in this repo
lib/
├── sync.ts                       # NEW — runSync(documentId): extracted POST /api/sync body
├── settings.ts                   # MODIFIED — add getLastAutoSyncedAt / setLastAutoSyncedAt
└── auth.ts                       # MODIFIED — add isValidCronAuth (pure, testable) alongside computeAuthToken
app/
├── api/
│   ├── sync/route.ts             # MODIFIED — now calls lib/sync.ts:runSync(), same response shape
│   ├── cron/
│   │   └── sync/route.ts         # NEW — GET handler, calls runSync() then setLastAutoSyncedAt()
│   └── settings/route.ts         # MODIFIED — GET/PUT include lastAutoSyncedAt
middleware.ts                     # MODIFIED — new bearer-token branch for the cron path only
app/settings/page.tsx             # MODIFIED — Advanced section shows the timestamp next to SyncPanel
tests/
└── auth.test.ts                  # NEW — unit tests for isValidCronAuth (fail-closed cases)
```

### Pattern 1: Shared sync core (`lib/sync.ts`)
**What:** Move the entire `POST /api/sync` handler body into an exported `runSync(documentId: string): Promise<SyncResult>` function. The route handler becomes a thin wrapper that parses/validates input and calls the shared function, matching the `lib/study-cards.ts` / `lib/dashboard.ts` precedent exactly.
**When to use:** Any time two entry points (a manual API route and a cron-triggered route) need identical business logic — this project already has this pattern twice (`getStudyCards()` used by both the RSC page and `GET /api/cards/due`; `getStats()`/`getActivityData()` used by multiple pages and routes).
**Example:**
```typescript
// lib/sync.ts — server-only sync core
// No 'use client' — this module runs server-side only.
import { createHash } from 'crypto'
import { fetchGoogleDoc } from '@/lib/google-docs'
import { extractCardsFromNotes } from '@/lib/extract-cards'
import { normalizeFront } from '@/lib/card-key'
import { resolveDependencyEdges } from '@/lib/link-dependencies'
import { lessonExcerpt } from '@/lib/lesson-excerpt'
import { prisma } from '@/lib/prisma'

const MAX_LESSONS_PER_SYNC = 1 // unchanged — same constant, same value, now lives here

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
  // ...exact body currently in app/api/sync/route.ts's try block, unchanged...
}

// app/api/sync/route.ts — now a thin wrapper
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

### Pattern 2: `vercel.json` cron declaration
**What:** A single top-level `crons` array entry pointing at the new route.
**When to use:** This is the only supported declarative mechanism for Vercel Cron Jobs.
**Example:**
```json
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs (fetched 2026-07-04)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 10 * * *"
    }
  ]
}
```
Note: `"0 10 * * *"` runs once daily at 10:00 UTC (satisfies Hobby's "once per day" rule). Exact hour is Claude's discretion — pick a time when the tutor's Doc is likely to already have new content (e.g., a few hours after the weekly lesson, or simply any fixed daily time — Hobby's ±59-minute jitter means precision doesn't matter).

### Pattern 3: Bearer-token middleware branch (fail-closed)
**What:** A new branch inside `middleware.ts` checked before the existing cookie logic, scoped to the cron path only.
**When to use:** Exactly this phase's SYNC-03 requirement.
**Example:**
```typescript
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs (Vercel's own reference
// implementation — this exact `!cronSecret || authHeader !== ...` shape is the
// fail-closed pattern; do NOT invert it to `if (cronSecret && authHeader !== ...)`.)

// lib/auth.ts — add alongside computeAuthToken (pure, no Prisma/Node-only APIs — testable)
export function isValidCronAuth(authHeader: string | null, cronSecret: string | undefined): boolean {
  // Fail closed: an unset/empty secret must NEVER validate, regardless of authHeader.
  return typeof cronSecret === 'string' && cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`
}

// middleware.ts
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

  // ...existing cookie-based check, unchanged...
}

// matcher config: NO change needed — the existing negative-lookahead matcher
// already covers `/api/cron/sync` (it only excludes /login, /api/login, and
// static/PWA assets), so the cron path is already inside the protected surface.
```

### Pattern 4: Setting-backed timestamp (no schema change)
**What:** A new key in the existing generic `Setting` table, following the exact getter/setter shape every other setting already uses.
**Example:**
```typescript
// Source: lib/settings.ts (existing file, pattern extended)
const LAST_AUTO_SYNCED_KEY = 'lastAutoSyncedAt'

export async function getLastAutoSyncedAt(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: LAST_AUTO_SYNCED_KEY } })
  return row?.value ?? null // ISO string, or null if cron has never run successfully
}

export async function setLastAutoSyncedAt(iso: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: LAST_AUTO_SYNCED_KEY },
    create: { key: LAST_AUTO_SYNCED_KEY, value: iso },
    update: { value: iso },
  })
}

// app/api/cron/sync/route.ts
import { runSync } from '@/lib/sync'
import { setLastAutoSyncedAt } from '@/lib/settings'

export const maxDuration = 300

export async function GET() {
  try {
    const documentId = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID
    if (!documentId) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_GOOGLE_DOC_ID is not set' }, { status: 500 })
    }
    const result = await runSync(documentId)
    // Only reached if runSync() didn't throw — an uncaught exception below never
    // updates the timestamp, which is the "silently failing cron is noticeable" signal.
    await setLastAutoSyncedAt(new Date().toISOString())
    return NextResponse.json(result)
  } catch (err) {
    console.error('Cron sync error:', err)
    return NextResponse.json({ error: 'Cron sync failed — see server logs' }, { status: 500 })
  }
}
```
`process.env.NEXT_PUBLIC_GOOGLE_DOC_ID` read directly server-side (not via client injection) already has precedent in this codebase: `scripts/local-resync.mts` reads the exact same env var the same way [VERIFIED: scripts/local-resync.mts line 30].

### Anti-Patterns to Avoid
- **`if (secret && authHeader !== ...) return unauthorized`:** This is the exact bug the phase description calls out by name. If `secret` is falsy (unset), the whole condition short-circuits to `false`, the block is skipped, and the request falls through to "allowed" — the opposite of fail-closed. Always structure the check as `if (!secret || authHeader !== ...)` (Vercel's own docs use this exact shape).
- **Writing the timestamp inside `runSync()`:** Would make the manual "Sync now" button also update "last auto-synced," defeating the purpose of the field (detecting a *silently failing unattended* cron) and violating the phase's explicit "pure refactor, no behavior change for the manual path" constraint.
- **Excluding the cron path from `middleware.ts`'s matcher to "simplify" auth:** This is explicitly forbidden by the phase's Success Criterion 2 ("the sync endpoint stays inside the auth matcher and is never publicly reachable"). The correct approach adds a branch *inside* the already-matched middleware function, not a matcher carve-out.
- **A `vercel.ts` typed config file:** Does not exist. `vercel.json` (optionally with `"$schema": "https://openapi.vercel.sh/vercel.json"` for editor autocomplete/validation) is the only supported mechanism as of the fetched docs (last updated 2026-06-16). Next.js 16's typed `next.config.ts` is unrelated — it does not carry Vercel platform config like cron.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | A custom `setInterval`/polling loop, or an external scheduler service | Vercel Cron Jobs (`vercel.json`) | This project has "No background workers: All processing is triggered by user actions" as an explicit architectural constraint (per `.claude/CLAUDE.md` codebase docs); Vercel Cron is the platform-native exception that doesn't require introducing a worker process. |
| Verifying the request truly came from Vercel's scheduler | A signature-verification scheme, IP allowlisting, or a custom nonce protocol | The `CRON_SECRET` bearer-token comparison Vercel documents and auto-injects | This is Vercel's own documented, supported mechanism — building anything more elaborate adds complexity with no additional security benefit for a single-tenant personal app. |
| Timestamp/date storage for a scalar setting | A new dedicated Prisma model + Turso DDL migration | The existing generic `Setting` key/value table | Turso/libSQL DDL changes are a known-painful manual process in this repo (`prisma db push` doesn't work against `libsql://`); the `Setting` table exists specifically to avoid needing DDL for exactly this class of value. |

**Key insight:** Every piece of this phase already has a same-shape precedent elsewhere in the codebase (`lib/study-cards.ts`/`lib/dashboard.ts` for the shared-core extraction, `lib/settings.ts` for scalar persistence, `middleware.ts` for request-level auth). The only genuinely new surface is the Vercel-specific `vercel.json` file and the platform behaviors it depends on (auto-injected header, Hobby scheduling limits) — everything else is applying an established in-repo pattern to a new endpoint.

## Common Pitfalls

### Pitfall 1: Fail-open auth via short-circuit `&&`
**What goes wrong:** `if (cronSecret && authHeader !== \`Bearer ${cronSecret}\`) return unauthorized` silently allows ALL requests through when `CRON_SECRET` is unset (e.g., forgotten during Vercel env var setup, or removed accidentally) — the exact opposite of "fail closed."
**Why it happens:** The `&&` reads naturally as "only check if we have a secret," but that framing already assumes the missing-secret case should be *allowed*, when it should be *denied*.
**How to avoid:** Structure the check as `if (!cronSecret || authHeader !== ...)` — a missing secret is one of the disjunction's failure conditions, not a bypass. Extract this into a pure, named function (`isValidCronAuth`) and unit test it directly, including the "secret is `undefined`" case (see Validation Architecture).
**Warning signs:** Any conditional where the "reject" branch requires *both* a truthy secret *and* a header mismatch — that's an implicit "no secret = allow" branch, even if the author didn't intend it.

### Pitfall 2: Assuming `vercel dev` / `next dev` can locally simulate a cron invocation
**What goes wrong:** Vercel's own docs state explicitly: "There is currently no support for `vercel dev`, `next dev`, or other framework-native local development servers" for cron jobs [VERIFIED: vercel.com/docs/cron-jobs/manage-cron-jobs]. A developer might try to "wait for the schedule to fire" locally and conclude the feature is broken.
**Why it happens:** Every other Vercel feature (env vars, functions) mostly "just works" locally via `vercel dev`; cron scheduling is the exception.
**How to avoid:** Test the route directly with a manual HTTP request carrying a valid `Authorization: Bearer <CRON_SECRET>` header (`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync`), against a locally-set `CRON_SECRET` in `.env.local`. Test the actual scheduled trigger only after deploying (Production deployment — cron jobs only run in Production, not Preview).
**Warning signs:** Plan tasks that say "wait for cron to fire locally to verify" — replace with "manually curl the route with the bearer header."

### Pitfall 3: Conflicting timeout assumptions (60s Hobby vs. 300s Fluid Compute default)
**What goes wrong:** This project's own `CLAUDE.md` documents a hard-won, production-observed constraint: "Vercel function timeout is 60 s hard limit on Hobby plan — `maxDuration = 300` in the route code has no effect on Hobby." However, current Vercel platform documentation states Fluid Compute (which changes the effective default/max duration) is now enabled by default for all plans including Hobby, with a 300s default. These two claims are in tension.
**Why it happens:** Vercel's platform defaults have changed over time (Fluid Compute rollout); the project's `CLAUDE.md` reflects an earlier, empirically-verified constraint that may or may not still hold for this specific project (Fluid Compute could be off for a project created before its default flipped, or the 60s limit could have been from a different failure mode entirely — e.g. a genuinely long-running extraction call, not a hard platform ceiling).
**How to avoid:** Do NOT use this ambiguity as a reason to relax `MAX_LESSONS_PER_SYNC=1` — keep it at 1 regardless, since that constraint is validated-safe under the *stricter* interpretation and cron adds no pressure to change it (a daily cron processing exactly 1 lesson has no urgency to batch more per invocation). Treat the actual current timeout as an open question to verify (Vercel dashboard → Project Settings → Functions) rather than something this research can resolve with certainty — flagged below in Open Questions.
**Warning signs:** A plan task that increases `MAX_LESSONS_PER_SYNC` "since cron gives us more headroom" — this conflates two unrelated concerns (schedule frequency vs. per-invocation timeout) and isn't supported by either the phase's success criteria or this research.

### Pitfall 4: Forgetting `CRON_SECRET` must be set in Vercel's dashboard, not just `.env.local`
**What goes wrong:** Cron-triggered requests only happen against the Production deployment. If `CRON_SECRET` exists only in a local `.env.local` file (or is missing from Vercel's Production environment variables), the deployed cron route will always see `authHeader === null` (Vercel won't inject a header for a secret it doesn't know about) and the middleware will correctly — but unhelpfully, from a "why isn't sync running" debugging perspective — return 401 forever.
**Why it happens:** This project's env var workflow (per `CLAUDE.md`) already distinguishes local `.env`/`.env.local` from Vercel's dashboard env vars for several other secrets (`AUTH_SECRET`, `ANTHROPIC_API_KEY`, etc.) — `CRON_SECRET` needs the exact same "set it in Vercel dashboard for Production" step, which is easy to forget since it's the one env var this repo has never needed before.
**How to avoid:** Document this explicitly as a manual post-merge provisioning step (see Environment Availability below) — `vercel env add CRON_SECRET production` or via the dashboard.
**Warning signs:** Cron logs show 401 responses in Vercel's Runtime Logs (`View Logs` on the Cron Jobs settings page) with no other errors.

## Code Examples

### Verifying auth header shape Vercel sends (for a manual local test)
```bash
# Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
```

### Reading which schedule triggered a request (not needed for this phase — only 1 cron job — but useful if a second schedule is ever added to the same path)
```typescript
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs
const schedule = request.headers.get('x-vercel-cron-schedule')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `now.json` for Vercel config | `vercel.json` | `now.json` support removed 2026-03-31 | Irrelevant here — this repo has neither file yet; use `vercel.json` directly. |
| Manual "Basic" vs "Standard" Vercel CPU instance tiers | Fluid Compute Standard (1 vCPU/2GB) as the only tier; "Basic" removed | Ongoing platform consolidation | Not something this phase's code needs to configure — no `functions` block override needed for a single lightweight cron route unless the timeout question (Pitfall 3) resolves unfavorably. |
| Manually retrying failed background jobs | Vercel's own guidance: cron delivery is "best effort" — design for idempotent, reconciliation-based retries rather than exactly-once delivery | Documented in current Vercel docs (fetched 2026-07-04) | Directly relevant: `runSync()`'s existing behavior (content-hash dedup on `Lesson.contentHash`, `remaining` count, no Lesson row on failed extraction) already makes a duplicate or missed cron invocation safe — no new idempotency work needed for SYNC-02 beyond what already exists. |

**Deprecated/outdated:**
- `now.json` — deprecated, N/A to this repo (no file to rename).
- Any assumption that Vercel needs manual webhook signature verification for cron auth — superseded by the simpler, officially-documented `CRON_SECRET` bearer-token mechanism.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The actual Hobby-plan function timeout currently in effect for THIS specific Vercel project is 60s (per `CLAUDE.md`) rather than the platform-wide 300s Fluid Compute default described in current Vercel docs | Common Pitfalls #3 | Low — either way, `MAX_LESSONS_PER_SYNC=1` stays unchanged, so this ambiguity doesn't change any planned code. Worth a one-time dashboard check (Project Settings → Functions) during/after this phase, but not blocking. |
| A2 | A single daily cron time (e.g., `"0 10 * * *"`) is an acceptable default schedule with no specific business requirement for a particular hour | Pattern 2 / Recommended Project Structure | Low — user can trivially change the hour in `vercel.json` post-merge; no code depends on the specific hour chosen. |
| A3 | The cron route should write the "last auto-synced" timestamp even when `runSync()` completes with partial per-lesson failures (not just full success) | Pattern 4 | Medium — if this assumption is wrong and the user actually wants the timestamp gated on zero failures, a silently-degrading cron (e.g., failing every lesson but never throwing) would still show a fresh timestamp and mask the problem. Recommend confirming this design choice explicitly at plan/discuss time. |

## Open Questions

1. **What is the actual current Vercel function timeout for this project?**
   - What we know: `CLAUDE.md` documents 60s as a hard, production-observed limit; current Vercel platform docs describe a 300s Fluid Compute default for all plans (including Hobby) as of the general Vercel Functions documentation.
   - What's unclear: Whether Fluid Compute is active on this specific project, and whether the originally-observed 60s ceiling was a genuine platform hard-limit or some other failure mode (e.g., a specific slow extraction call that happened to take >60s under the old model).
   - Recommendation: Not blocking for this phase — `MAX_LESSONS_PER_SYNC=1` is unaffected either way. Optionally verify via Vercel dashboard → Project Settings → Functions before/during planning, and update `CLAUDE.md` if the constraint has changed (out of scope for this phase's plan, but worth a follow-up note).

2. **Should the "last auto-synced" timestamp update on partial failure (some lessons failed to extract) as long as the cron route itself didn't throw?**
   - What we know: SYNC-04's stated purpose is "so a silently-failing daily cron is noticeable" — implying the signal that matters is "did the unattended process run at all," not "did it succeed perfectly."
   - What's unclear: Whether a cron run that completes but reports `failed > 0` for its single lesson should still refresh the timestamp (making it a "last attempted" signal) or should withhold the update (making it a "last successful" signal).
   - Recommendation: Default to refreshing on any non-throwing completion (see A3 above and Pattern 4's code example) — this is consistent with how `runSync()`'s own retry design already treats per-lesson failures as expected/recoverable (they retry automatically on the next sync since no `Lesson` row was created). Confirm at plan time if a stricter "success-only" semantic is preferred.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vercel CLI | Manual provisioning (`vercel env add CRON_SECRET production`), optional local testing | ✓ | 54.14.0 | Vercel dashboard UI works identically |
| Vercel project linked (`.vercel/project.json`) | Deploying `vercel.json` cron config | ✓ | project `korean-study`, already linked | — |
| Node.js / npm | Running the app locally to test the new route | ✓ | Node v25.8.2, npm 11.11.1 | — |
| `CRON_SECRET` env var | SYNC-03 auth | ✗ (not yet set — new for this phase) | — | None — this is a required manual provisioning step (see below); no fallback, the feature cannot ship without it. |

**Missing dependencies with no fallback:**
- `CRON_SECRET` must be generated (Vercel recommends a random string ≥16 characters) and set as a Vercel **Production** environment variable before the cron job can authenticate successfully. This is a manual, post-merge step — no code can substitute for it. Recommend adding to `.env.local` too (for local `curl` testing) once generated.

**Manual Vercel-side provisioning steps (post-merge, not part of the code plan):**
1. Generate a `CRON_SECRET` value (≥16 random characters).
2. `vercel env add CRON_SECRET production` (or via Vercel dashboard → Project Settings → Environment Variables) — Production only; cron jobs never run against Preview deployments.
3. Deploy (the `vercel.json` cron declaration is only registered on deploy — push to `main` per this repo's existing deploy flow).
4. Confirm the cron job appears under Vercel dashboard → Project Settings → Cron Jobs, and check its first invocation's logs after the scheduled time.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | `vitest.config.ts` (environment: node, `@/*` alias) |
| Quick run command | `npx vitest run tests/auth.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-03 | `isValidCronAuth` returns `true` only for a correctly-formed bearer header AND a non-empty secret | unit | `npx vitest run tests/auth.test.ts -t "valid"` | ❌ Wave 0 |
| SYNC-03 | `isValidCronAuth` returns `false` (fail-closed) when `cronSecret` is `undefined`/empty, regardless of `authHeader` | unit | `npx vitest run tests/auth.test.ts -t "fail closed"` | ❌ Wave 0 |
| SYNC-02 | `GET /api/cron/sync` triggers `runSync()` and stays within the existing 1-lesson-per-invocation path | manual-only | `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync` then inspect response `newLessons <= 1` | manual (no DB-mocking test convention exists in this repo — CLAUDE.md restricts vitest to pure lib functions) |
| SYNC-02 | Manual `POST /api/sync` behavior is unchanged after the `runSync()` extraction | manual-only (regression) | Trigger a manual sync via Settings ▸ Advanced ▸ Sync now, confirm identical response shape to pre-refactor | manual — same rationale as above; `app/api/sync/route.ts` has no existing test coverage to extend |
| SYNC-04 | `lastAutoSyncedAt` Setting persists and round-trips through `GET /api/settings` | manual-only | Trigger cron route manually, then `curl http://localhost:3000/api/settings \| jq .lastAutoSyncedAt` | manual — `lib/settings.ts` getters/setters are Prisma-backed and have no existing unit-test convention in this repo (matches every other setting, e.g. `dailyGoalSeconds`, which is also untested) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/auth.test.ts` (fast, pure-function only)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green, plus the 3 manual checks above (cron route curl test, manual-sync regression check, settings round-trip), before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/auth.test.ts` — new file, covers SYNC-03's `isValidCronAuth` fail-closed behavior (the single highest-value automated test this phase can add, given the phase description explicitly calls out the fail-open anti-pattern as a named risk)
- [ ] No fixture/mock infrastructure needed — `isValidCronAuth` is a pure function (string in, boolean out), consistent with every other tested `lib/` module in this repo (`card-key.test.ts`, `known-words.test.ts`, etc.)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Bearer-token comparison against `CRON_SECRET` (new mechanism, separate from the existing HMAC session cookie) — must fail closed when the secret is unset [VERIFIED: vercel.com/docs/cron-jobs/manage-cron-jobs] |
| V3 Session Management | no | The cron path is stateless, single-request auth (no session/cookie involved) — out of scope for this mechanism |
| V4 Access Control | yes | The cron route must remain inside `middleware.ts`'s existing matcher (never carved out as a public exception) — this is Success Criterion 2, verbatim |
| V5 Input Validation | no (minimal) | `GET /api/cron/sync` takes no request body/params from the caller (documentId is read from a trusted server-side env var, not attacker-controlled input) |
| V6 Cryptography | no | No new cryptographic primitive introduced — bearer-token string comparison, same class of mechanism the codebase already uses for the HMAC cookie (`===` comparison), not a new crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Fail-open auth via short-circuited `&&` when `CRON_SECRET` is unset | Elevation of Privilege | `if (!cronSecret || authHeader !== ...)` structure (Pitfall 1) — unit test explicitly covers the "secret unset" case |
| Leaked/guessed `CRON_SECRET` allows an attacker to trigger arbitrary sync runs | Spoofing / Denial of Service (resource exhaustion via repeated Claude API calls) | Rate limiting is explicitly OUT OF SCOPE (per `.planning/REQUIREMENTS.md`, carried over from v1.3) — accepted tradeoff for a single-tenant personal app; the `CRON_SECRET` itself (≥16 random chars, Vercel-recommended) is the only mitigation, same posture as the existing shared-password auth model |
| Route enumeration / cron path becoming publicly reachable if the matcher is ever misconfigured | Tampering / Information Disclosure | The existing matcher's negative-lookahead already covers `/api/cron/sync` by default (only excludes `/login`, `/api/login`, static assets) — verify this explicitly with a matcher-path test or manual check as part of the plan's verification, since a future matcher edit could accidentally exclude the whole `/api/cron/*` prefix |

## Sources

### Primary (HIGH confidence)
- https://vercel.com/docs/cron-jobs — fetched 2026-07-04: cron mechanics (GET method, Production-only, UTC timezone, `x-vercel-cron-schedule` and `vercel-cron/1.0` user-agent headers, cron expression syntax/limitations)
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — fetched 2026-07-04: `vercel.json` syntax, `CRON_SECRET` auto-injection mechanism and reference implementation, error handling (no retries), concurrency/idempotency guidance, "no `vercel dev` support" caveat, dynamic routes, redirects behavior
- https://vercel.com/docs/cron-jobs/usage-and-pricing — fetched 2026-07-04: Hobby plan limits table (100 cron jobs/project, once-per-day minimum interval, per-hour ±59min scheduling precision)
- `vercel:vercel-functions` skill (bundled reference) — Vercel Functions runtime/timeout model, Fluid Compute defaults, `vercel.json` `functions` block syntax
- Direct file reads: `middleware.ts`, `lib/auth.ts`, `app/api/sync/route.ts`, `lib/settings.ts`, `app/api/settings/route.ts`, `app/settings/page.tsx`, `prisma/schema.prisma`, `lib/study-cards.ts`, `lib/dashboard.ts`, `lib/dto.ts`, `scripts/local-resync.mts`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`

### Secondary (MEDIUM confidence)
- WebSearch cross-check on Hobby cron job count limits (returned conflicting numbers from third-party/community sources — 2, 5, 20, 100 depending on article date; resolved by preferring the directly-fetched official docs table, which is the most current and authoritative source)

### Tertiary (LOW confidence)
- None used as authoritative — all Vercel-specific claims in this document are backed by directly-fetched official docs (Primary tier above).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns verified against official Vercel docs fetched this session, or directly observed in this repo's existing code
- Architecture: HIGH — every pattern (shared-core extraction, Setting-backed scalar, middleware auth branch) mirrors an existing, working precedent already in this codebase
- Pitfalls: HIGH for auth fail-open pattern (verified against Vercel's own reference code) and local-dev cron limitation (verified in official docs); MEDIUM for the 60s-vs-300s timeout question (genuine ambiguity between this repo's documented experience and current platform docs — flagged as an open question, not resolved)

**Research date:** 2026-07-04
**Valid until:** 30 days (stable platform feature; re-verify Hobby cron limits and `CRON_SECRET` injection behavior if this phase is replanned significantly later, since Vercel has changed cron limits at least twice in its history per the WebSearch cross-check)
