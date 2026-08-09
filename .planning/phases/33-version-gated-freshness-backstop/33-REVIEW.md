---
phase: 33-version-gated-freshness-backstop
reviewed: 2026-08-08T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - app/api/review/route.ts
  - app/api/version/route.ts
  - components/FreshnessWatcher.tsx
  - e2e/freshness-fresh-paths.spec.ts
  - e2e/freshness-version-gate.spec.ts
  - e2e/helpers/mutate.ts
  - e2e/run-mutate.ts
  - lib/settings.ts
  - lib/sync.ts
  - tests/version-route.test.ts
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-08-08
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the version-gated freshness backstop (VERS-01/VERS-02): the new `dataVersion` Setting-table counter, `GET /api/version`, the `POST /api/review` transaction-scoped bump, `lib/sync.ts`'s unconditional end-of-sync bump, `FreshnessWatcher.tsx`'s client-side gate, and the accompanying e2e/unit test coverage.

`npm run lint`, `tsc --noEmit`, and `npx vitest run tests/version-route.test.ts` all pass clean against the reviewed files — no syntax/type/lint defects. The core write-atomicity design (bumping inside the same `$transaction` as the review write, rolling back together with `StaleReviewError`/idempotency-replay) is sound and well-tested by `tests/version-route.test.ts`.

Two classes of issues surfaced on closer inspection, both **not** exercised by the phase's own test suite:

1. **Token collision risk** — `nextDataVersionToken()` is a bare `String(Date.now())` with millisecond resolution and no monotonicity guard. Two bumps landing in the same millisecond produce an identical token, which can cause the version gate to silently miss a real change — in exactly the "resume shows stale data" scenario the whole backstop exists to prevent.
2. **Narrower trigger scope than the payloads it gates** — the gate is wired to only two write paths (`runSync()` and `POST /api/review`), but `FreshnessWatcher` gates the JSON re-fetch for `/cards` (card CRUD) and `/habits` (activity/streak data) too. Card create/edit/delete (`POST/PUT/DELETE /api/cards*`) and activity logging (`POST /api/activity`) never bump the counter, so a resume after those writes (from another tab/device, or a study session that logs time without completing a graded review) can now serve a stale JSON backstop payload — a real narrowing of the pre-Phase-33 behavior, which always re-fetched unconditionally regardless of write origin.

Neither issue is a data-loss or security risk — `router.refresh()` remains unconditional in all cases, so the RSC half of the dual-delivery mechanism still fires. But both directly undermine the specific guarantee VERS-01/02 was built to provide, in the exact failure mode (stale post-resume UI) the backstop exists to prevent, so they're flagged as Warnings rather than Info.

## Warnings

### WR-01: `nextDataVersionToken()` can produce a duplicate token, silently defeating the version gate

**File:** `lib/settings.ts:335-337`, also `lib/settings.ts:366-374`, `app/api/review/route.ts:110-115`
**Issue:** `nextDataVersionToken()` is `String(Date.now())` — millisecond resolution, no read-and-increment, no random suffix (deliberately, per the doc comment at `lib/settings.ts:349-365`). If two writes that each call this (e.g. two `POST /api/review` transactions serialized back-to-back by SQLite, or a `runSync()` completion racing a review write) land within the same millisecond, they produce the **identical** token. `tests/version-route.test.ts:159-171` proves the authors are aware of this — it inserts an explicit `await new Promise((resolve) => setTimeout(resolve, 2))` between two `bumpDataVersion()` calls specifically to dodge the collision, rather than testing that the implementation is collision-proof.

Concretely: if a client's `lastVersionRef` is updated to token `T` by a boundary-event check that happens to land *between* two writes that share token `T` (because both occurred within the same millisecond), a later boundary event that reads `T` again will see `previous === version` and skip the JSON backstop re-fetch — even though a real write happened after the client's baseline was captured. Since `FreshnessWatcher`'s JSON backstop is the second half of the *specific* mitigation for the "server recomputed correctly but the client never applied it" Next.js 16.2.1 Suspense flake documented in the file's header comment, a collision here reintroduces that exact bug in a narrow window, defeating the purpose of the whole feature for that resume.

This is a low-probability window in today's single-user, human-paced write cadence, but `POST /api/review` is fired optimistically and non-blocking from `StudySession.tsx` (`.catch(() => {})`, never awaited) — a user grading several cards in quick succession is exactly the kind of rapid-fire write sequence that makes millisecond collisions plausible.

**Fix:** Make the token strictly increasing regardless of wall-clock resolution, e.g. read the current value inside the same transaction/upsert and bump to `max(Date.now(), current + 1)`:
```ts
export async function bumpDataVersion(): Promise<string> {
  const current = await getDataVersion()
  const token = String(Math.max(Date.now(), Number(current) + 1))
  await prisma.setting.upsert({
    where: { key: DATA_VERSION_KEY },
    create: { key: DATA_VERSION_KEY, value: token },
    update: { value: token },
  })
  return token
}
```
The transaction-scoped inline upsert in `app/api/review/route.ts` would need the same read-then-bump treatment (currently just calls the pure `nextDataVersionToken()` with no DB read).

### WR-02: Card CRUD writes never bump `dataVersion` — cross-device/tab `/cards` freshness regresses versus pre-Phase-33 behavior

**File:** `app/api/cards/route.ts` (POST), `app/api/cards/[id]/route.ts` (PUT/DELETE), `app/api/review/undo/route.ts` (POST) — none call `bumpDataVersion()`
**Issue:** `33-RESEARCH.md` explicitly scopes the trigger to only `runSync()` and `POST /api/review`, reasoning that "Manual card edits are user-initiated on the current device and are already reflected via `CardsClient.tsx`'s existing optimistic local-state update... the backstop exists to catch changes from *other* origins (cron sync, another tab/device), not to duplicate the current device's own optimistic update."

That reasoning covers the *current device's own tab*, but does not address the scenario the backstop's own doc comments say it targets: a second tab or device. Before Phase 33, `fetchBackstop()` ran unconditionally on every boundary event, so a card created/edited/deleted on Device A would be picked up by Device B's `/cards` JSON backstop on its next resume, regardless of origin. After Phase 33, that same edit on Device A does not move `dataVersion` at all, so Device B's gate stays closed on resume unless a sync or review-grade *also* happens to move the counter around the same time. This is a real narrowing of the freshness guarantee for exactly the multi-tab/multi-device case the backstop exists for, not just an unrelated no-op case.

`POST /api/review/undo` has the identical gap and isn't mentioned in the research doc's scope discussion at all.

**Fix:** Either (a) add `bumpDataVersion()` calls to the card CRUD routes and the undo route (matching the `POST /api/review` pattern — non-blocking/best-effort is fine, mirroring `lib/sync.ts`'s try/catch-non-fatal treatment), or (b) if the cross-device case is being deliberately deferred, document that explicitly as a known limitation in `FreshnessWatcher.tsx`'s header comment (currently the comment only explains why the *RSC* half stays unconditional, not why the JSON half's trigger scope is narrower than what it gates).

### WR-03: `POST /api/activity` never bumps `dataVersion` — `/habits` backstop can serve stale streak/heatmap data

**File:** `app/api/activity/route.ts:21-38`
**Issue:** The `/habits` route's JSON backstop payload (`FreshnessWatcher.tsx:96-116`) is built from `GET /api/activity` (`days`, `dailyGoalSeconds`, `dayStartHour`) + `GET /api/stats` (`masteredCount`, `cardsByState`). The `days` field — the data driving the streak/heatmap UI — is written exclusively by `POST /api/activity`'s `prisma.studyDay.upsert()`. That route never calls `bumpDataVersion()`, and unlike the card-CRUD case above, this gap is not discussed anywhere in `33-RESEARCH.md` (its scope table only lists "sync completion and review writes" as the two in-scope write paths, with no mention of activity logging even though `/api/activity` is one of the three routes explicitly named as a backstop payload target).

`StudySession.tsx` flushes activity time to `POST /api/activity` on a time-based cadence, independent of whether the user completes a graded FSRS review in that window (e.g. `navigator.sendBeacon('/api/activity', ...)` on unmount/backgrounding — `components/StudySession.tsx:232-236`). In practice most study sessions also grade cards (which does bump the counter via the global flag), masking this most of the time, but any accumulation of study time without at least one completed review in the same version epoch — e.g. a session ended before any card is graded, or backgrounded mid-session — leaves `dataVersion` unmoved despite a real `StudyDay` write. A resume on `/habits` (this device or another) after that will incorrectly treat the payload as fresh and skip the re-fetch.

**Fix:** Add a `bumpDataVersion()` call (non-blocking is fine, matching the `catch` pattern elsewhere) to `POST /api/activity`'s success path.

### WR-04: `GET /api/version` has no error handling, deviating from the project's documented API route convention

**File:** `app/api/version/route.ts:1-7`
**Issue:** CLAUDE.md's Error Handling conventions state: "All route handlers wrap their body in `try { … } catch (e) { return NextResponse.json({ error: … }, { status: 500 }) }`." Every other route reviewed here (`app/api/review/route.ts`, `app/api/activity/route.ts`) follows this. `app/api/version/route.ts` does not — if `getDataVersion()` throws (e.g. a transient DB error), the handler throws unhandled and Next.js returns its generic framework-level error response instead of the project's structured JSON shape.
**Fix:**
```ts
import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  try {
    const version = await getDataVersion()
    return NextResponse.json({ version })
  } catch (e) {
    console.error('GET /api/version failed:', e)
    return NextResponse.json({ error: 'Failed to load version' }, { status: 500 })
  }
}
```
(Functionally low-impact today since `FreshnessWatcher`'s `fetch('/api/version').then((res) => (res.ok ? res.json() : null))` already treats any non-2xx as `null` and never parses the body — but a raw framework 500 vs. a structured JSON 500 is still an inconsistency worth closing, and matters if this endpoint gains other consumers, e.g. Phase 34's LOCAL-02 IndexedDB cache-key check mentioned in the doc comments.)

### WR-05: `runSync()` bumps `dataVersion`/`studyCacheVersion` even when a sync run creates zero new lessons and zero new cards

**File:** `lib/sync.ts:359-413`
**Issue:** The two unconditional end-of-function bumps (`bumpStudyCacheVersion()` at line 386-394 and `bumpDataVersion()` at line 405-413) run whenever `newLessonData.length > 0` at the top of the function — i.e. whenever there was *new content to try* — regardless of whether any of it actually persisted. If every lesson in the batch fails extraction (`Promise.allSettled` all-rejected) or every extraction returns 0 cards, `newLessons` stays `0` and no `Lesson`/`Card`/`CardDependency` row is created, yet both version counters still bump. The comments justify this for the *partial-failure* case ("the per-lesson inline edge/card creation earlier in this function can persist new cards and edges even on a run where the end-of-function auto-relink is gated off") — that reasoning doesn't apply to the fully-failed case, where nothing was created at all.

This is over-invalidation, not under-invalidation, so it's not a correctness bug — but it means every failed sync attempt (e.g. a transient Anthropic API outage, hit repeatedly by a user retrying) needlessly reopens the freshness gate for every open tab, costing an extra `/api/cards/due` / `/api/cards` / `/api/activity`+`/api/stats` fetch on the next resume for no actual data change.
**Fix:** Guard both bumps with `if (newLessons > 0) { ... }`, or accept as intentional (the current comments don't distinguish "some lessons succeeded" from "zero lessons succeeded" — worth an explicit note either way).

## Info

### IN-01: `idempotencyKey` uniqueness is global, not scoped per card

**File:** `app/api/review/route.ts:163-179`, `prisma/schema.prisma:114` (`idempotencyKey String @unique`)
**Issue:** The P2002/`isUniqueConstraintError` recovery branch treats *any* collision on the `idempotencyKey` column as "this exact request was already applied, read back and return 200" — but it reads back the state of `cardId` from the **current** request body, not the `cardId` that actually owns the colliding `ReviewLog` row. Since the unique constraint is global (not `@@unique([cardId, idempotencyKey])`), a client that ever reused the same `idempotencyKey` across two different cards would get a false-success 200 for the second card with its actual (unmodified) state, while genuinely believing the review was recorded. In practice this is unreachable today — `components/StudySession.tsx:458` generates `idempotencyKey = crypto.randomUUID()` fresh per grade action, so collision requires the same UUID being reused across different `cardId`s, which doesn't happen in the current client. Flagging only because the API's own defenses don't rule this out, and it predates this phase (unchanged by the VERS-01 diff) — not a required fix, just worth knowing if `idempotencyKey` generation strategy ever changes.

### IN-02: `FreshnessWatcher.tsx` TODO ties correctness to an unpinned Next.js version

**File:** `components/FreshnessWatcher.tsx:160-162`
**Issue:** `// TODO: 16.2.1 is the Next.js version this delivery flake and its gate were last verified against — re-test the backstop (and this version gate) after any Next.js upgrade before considering either for removal.` This is a reasonable engineering note, but per repo convention TODOs should ideally be tracked somewhere more durable than an inline comment (e.g. a backlog item) so a future Next.js upgrade doesn't silently skip the re-verification step. No action required now; flagging for visibility.

### IN-03: `registerRequestLog`/`newDataFetchesForRoute` duplicated verbatim across three e2e spec files

**File:** `e2e/freshness-fresh-paths.spec.ts:41-56`, `e2e/freshness-version-gate.spec.ts:36-51` (and `e2e/freshness-router-cache.spec.ts`, not in this review's file list)
**Issue:** Both reviewed spec files contain byte-identical copies of `registerRequestLog()` and `newDataFetchesForRoute()`, each with a comment explaining the duplication is deliberate ("copied verbatim... see that file for why isRscRequest() must be called on the real Request object at capture time"). This is a defensible call for e2e test independence, but it's still classic DRY-violation risk: a future fix to one copy (e.g. a resourceType/isRsc detection bugfix) is easy to apply to only one of the three files and silently leave the others behind. Consider hoisting to a shared `e2e/helpers/request-log.ts` once a third near-identical copy accumulates (it already has).

---

_Reviewed: 2026-08-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
