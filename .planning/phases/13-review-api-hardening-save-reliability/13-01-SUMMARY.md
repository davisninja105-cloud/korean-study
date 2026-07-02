---
phase: 13-review-api-hardening-save-reliability
plan: 01
subsystem: api
tags: [nextjs, prisma, fsrs, route-handlers, error-handling, validation]

# Dependency graph
requires:
  - phase: 12-rsc-hydration-perf
    provides: the existing /api/review and /api/cards/[id] route handlers hardened here
provides:
  - "POST /api/review validates rating ∈ {1,2,3,4} (REVIEW-02) and returns a structured generic 500 on any DB/FSRS failure (REVIEW-01)"
  - "PUT /api/cards/[id] returns a friendly 400 on a normalizedFront collision (REVIEW-03) instead of an uncaught 500"
affects: [14-sync-visibility-caching, 15-studysession-refactor]

# Tech tracking
tech-stack:
  added: []  # no new packages — Prisma namespace + PrismaClientKnownRequestError ship with the already-generated client
  patterns:
    - "Range-validate untrusted numeric input before any DB/engine call (Number.isInteger + bounds guard returns 400)"
    - "Wrap Prisma calls in try/catch; console.error the raw error server-side, return a generic client message to avoid internal-schema disclosure"
    - "Map Prisma P2002 (unique-constraint collision) to a domain-specific 400 before the generic 500 fallback"

key-files:
  created: []
  modified:
    - app/api/review/route.ts
    - app/api/cards/[id]/route.ts

key-decisions:
  - "Placed the rating range guard before the try block (not inside it) so an invalid rating short-circuits to 400 with zero DB/FSRS work — keeps the guard as pure validation alongside the existing missing-fields 400."
  - "Returned a generic 'Failed to record review' (not the raw Prisma message) on /api/review 500 — threat T-13-02; the cards route's existing 500 branch was left echoing e.message per the plan's no-scope-creep instruction (REVIEW-03 scopes only the collision branch)."
  - "Used the P2002-catch approach (not a pre-update findUnique) for the collision 400 — matches the codebase's existing catch-based error-handling idiom and avoids an extra query."
  - "Kept the 404 review-not-found return inside the try (findUnique is a DB call that can throw); the plan prose said 'outside the try' but the binding acceptance_criteria + must_have truths require findUnique inside the try so a DB hiccup is caught — the 404 still returns normally when findUnique yields null."

patterns-established:
  - "Authenticated write routes validate untrusted body fields with explicit 400s before any DB read or domain-engine call."
  - "DB/engine failures return a generic structured 500 (raw error logged server-side only); unique-constraint collisions return a domain-specific 400 with a user-facing message."

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "POST /api/review rejects ratings outside {1,2,3,4} with a 400 before any DB read or reviewCard() call (REVIEW-02)"
    requirement: REVIEW-02
    verification:
      - kind: other
        ref: "source grep: Number.isInteger + bounds guard at line 16 precedes reviewCard(cardReview,...) call at line 36; rating-400 return at line 21 precedes try block at line 30"
        status: pass
      - kind: other
        ref: "npm run build (TypeScript finished, no errors) + npm run lint (exit 0)"
        status: pass
    human_judgment: true
    rationale: "Control-flow proven by source ordering (guard returns before try, so rating 99/0 can provably never reach reviewCard), but the runtime HTTP behavior (POST rating:99 → 400 response body) was not exercised — the plan marks curl-based behavior verification as optional, requiring a running server + seeded DB + auth cookie not available in the build environment."
  - id: D2
    description: "POST /api/review wraps findUnique/reviewCard/update in try/catch and returns a generic 'Failed to record review' 500 (raw error logged server-side) on any DB/FSRS failure (REVIEW-01)"
    requirement: REVIEW-01
    verification:
      - kind: other
        ref: "source grep: try{ at line 30 / catch at line 44 encloses prisma.cardReview.findUnique (31), reviewCard(cardReview,...) (36), prisma.cardReview.update (38); catch returns { error: 'Failed to record review' } with status 500 and console.errors the raw e"
        status: pass
      - kind: other
        ref: "npm run build (TypeScript finished, no errors) + npm run lint (exit 0)"
        status: pass
    human_judgment: true
    rationale: "Structural proof that all three throwing calls are inside the catch and that the client message is generic (no Prisma/schema leak). The actual DB-failure → 500 path is not exercised at runtime without a forced Prisma failure against a live DB."
  - id: D3
    description: "PUT /api/cards/[id] returns a 400 'This front already exists (as a different variant of another card)' on a normalizedFront collision (Prisma P2002), with the generic 500 retained for all other errors (REVIEW-03)"
    requirement: REVIEW-03
    verification:
      - kind: other
        ref: "source grep: Prisma.PrismaClientKnownRequestError instanceof + e.code === 'P2002' branch (line 60) returns 400 with the friendly message (line 62) before the retained generic status:500 fallback (line 67); import { Prisma } added at line 4"
        status: pass
      - kind: other
        ref: "npm run build (TypeScript finished, no errors) + npm run lint (exit 0)"
        status: pass
    human_judgment: true
    rationale: "Structural proof that the P2002 branch precedes and is distinct from the generic 500 fallback, and the success path (return NextResponse.json(card)) is unchanged. The actual collision behavior (edit card A's front into card B's normalizedFront → 400) is not exercised at runtime — needs a seeded DB with two cards and an auth cookie."

# Metrics
duration: 5 min
completed: 2026-07-02
status: complete
---

# Phase 13 Plan 01: Review API Hardening Summary

**Hardened POST /api/review with a rating range guard (400) + try/catch generic 500, and mapped PUT /api/cards/[id] Prisma P2002 collisions to a friendly 400 — no unhandled throws or raw schema leaks on the two authenticated write routes.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T05:27:34Z
- **Completed:** 2026-07-02T05:32:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- POST /api/review now validates `rating` is an integer in {1,2,3,4} with a 400 before any DB read or `reviewCard()` call (REVIEW-02) — out-of-range/non-integer/non-number input can no longer reach the FSRS engine.
- POST /api/review wraps `prisma.cardReview.findUnique`, `reviewCard()`, and `prisma.cardReview.update` in a single try/catch that logs the raw error server-side and returns a generic `{ error: 'Failed to record review' }` 500 (REVIEW-01, threat T-13-02) — a DB hiccup no longer throws an unhandled 500 or leak schema details.
- PUT /api/cards/[id] catches `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` and returns a 400 `This front already exists (as a different variant of another card)` (REVIEW-03); the existing generic 500 fallback is retained for all other errors, and the DELETE handler + PUT update/transaction logic are untouched.
- Build and lint stay clean (TypeScript finished with no errors; `eslint` exit 0).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add rating validation + error handling to POST /api/review (REVIEW-01, REVIEW-02)** - `dbb8118` (feat)
2. **Task 2: Return a friendly 400 on card-front collision in PUT /api/cards/[id] (REVIEW-03)** - `9cadc09` (fix)

**Plan metadata:** committed after STATE/ROADMAP update (docs).

## Files Created/Modified
- `app/api/review/route.ts` — added `Number.isInteger` + bounds rating guard returning 400 before the try block; wrapped findUnique/reviewCard/update in try/catch returning a generic 500 with `console.error` server-side.
- `app/api/cards/[id]/route.ts` — added `import { Prisma } from '@/app/generated/prisma/client'`; added a P2002 branch in the PUT catch returning a friendly 400 before the retained generic 500 fallback.

## Decisions Made
- Placed the rating range guard **before** the try block (pure validation, like the existing missing-fields 400) so an invalid rating does zero DB/FSRS work; the 404 review-not-found return stays **inside** the try because `findUnique` is a DB call that can throw (the plan prose said "outside the try" but the binding acceptance_criteria + must_have truths require findUnique inside the catch — the 404 still returns normally when findUnique yields null).
- Returned a generic `Failed to record review` on `/api/review` 500 (threat T-13-02) but left the cards route's existing 500 branch echoing `e.message` — REVIEW-03 scopes only the collision branch, and changing the cards 500 behavior would be scope creep beyond the plan.
- Chose the P2002-catch approach over a pre-update `normalizedFront` findUnique — matches the codebase's existing catch-based error-handling idiom and avoids an extra query per edit.

## Deviations from Plan

None — plan executed exactly as written. (The one interpretive tension — "404 outside the try" vs. "findUnique inside the try" — was resolved in favor of the binding acceptance criteria and the REVIEW-01 must_have truth; documented in Decisions Made, not as a deviation.)

## Issues Encountered
- **Transient Turso `ECONNRESET` during `npm run build` (Task 1 verify):** the first build failed at the `/study` page prerender step with `request to https://...turso.io/v2/pipeline failed, reason: read ECONNRESET`. `/study` is prerendered `○ (Static)` and queries the hosted DB at build time; the build environment hit a transient network blip. Diagnosed and proved pre-existing by reverting only `app/api/review/route.ts` to HEAD, rebuilding (same `/study` page — which does not import `/api/review` — succeeded), then restoring the hardened version and rebuilding (succeeded with the network recovered). My edited file typechecked cleanly in isolation (`tsc --noEmit` reported no errors in `app/api/review/route.ts`). No code change resulted; the second and all subsequent builds (including Task 2's) succeeded. This is an environment/network condition, not a code defect.

## User Setup Required

None — no external service configuration required. The `Prisma` namespace and `PrismaClientKnownRequestError` class ship with the already-generated Prisma client (`app/generated/prisma/client.ts`); no package install was needed.

## Known Stubs

None — both routes are fully wired to their existing Prisma/FSRS data sources; no placeholder/empty/mock data introduced.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes were introduced beyond what the plan's `<threat_model>` already covers (T-13-01 through T-13-04 all mitigated as specified; T-13-SC accepted — no package-manager installs).

## Next Phase Readiness
- REVIEW-01, REVIEW-02, REVIEW-03 satisfied at the source-structure level; build + lint clean. Runtime behavior verification (curl against a live server with a seeded DB + auth cookie) is deferred to the Phase 13 verifier / UAT as the plan marked it optional.
- Plan 13-02 (REVIEW-04 retry + REVIEW-05 undo atomicity, both in `components/StudySession.tsx`) can proceed — this plan did not touch `StudySession.tsx` or `app/api/review/undo/route.ts` (the latter has the same missing-try/catch shape but is out of scope for REVIEW-01..05 per the plan, left for a future phase).
- No blockers for Plan 13-02.

## Self-Check: PASSED

- Files exist: `app/api/review/route.ts` ✓, `app/api/cards/[id]/route.ts` ✓, `13-01-SUMMARY.md` ✓
- Commits exist: `dbb8118` ✓ (feat, Task 1), `9cadc09` ✓ (fix, Task 2)
- Plan-level verification greps re-run: review route (Number.isInteger guard + try/catch + generic 500) PASS; cards route (P2002 → friendly 400 + retained 500 fallback) PASS
- `npm run build` succeeds, `npm run lint` exit 0 (re-confirmed during Task 2 verify)

---
*Phase: 13-review-api-hardening-save-reliability*
*Completed: 2026-07-02*
