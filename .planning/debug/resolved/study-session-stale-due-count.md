---
status: resolved
trigger: "User report: main study session workflow and cross-page state sync seem broken"
created: 2026-07-03
updated: 2026-07-03
---

## Symptoms

**Trigger (verbatim user description):**
> I think there is something wrong with the main study session workflow of the app, and maybe how fast state from one page is communicated to other pages. One experience I had: I opened the app and it said I had X cards due from Y lessons. I thought that was wrong so I pulled down to run a sync and it increased to X+N cards from Y+1 lesson. I then did a study session. One thing wrong about the study session is that it didn't replay cards from that same session that had a review interval of less than 1 day (which it should have). Also, when I went back to the dashboard, it again said X cards from Y lessons. I did the sync and everything updated to the same way it did before. I started a new study session, and it showed me the same cards I had just reviewed. Something seems broken here

**Expected behavior:**
1. Dashboard due-card count/lesson count should reflect the true current DB state without requiring a manual sync to "catch up" the displayed number after it was already accurate.
2. Within a single study session, a card graded with a resulting FSRS interval of < 1 day (e.g. Again/Hard on a new/lapsed card) should be **requeued and shown again later in the same session** (per `REQUEUE_GAP=4` behavior described in `components/StudySession.tsx`).
3. After completing a study session (reviews saved), returning to the dashboard should show an updated due count reflecting those completed reviews — not the pre-session stale number.
4. Starting a new study session after finishing one should NOT immediately show the same cards just reviewed, unless those cards are legitimately due again (which would be unusual immediately after review unless the interval was sub-day AND still within the "due" window).

**Actual behavior (observed, reproduced twice per user):**
1. Dashboard shows a due count (X cards / Y lessons) that undercounts reality; pulling to sync increases it to X+N cards / Y+1 lessons (suggests dashboard was stale OR sync uncovered genuinely new content — ambiguous, needs investigation).
2. During the study session, cards that should have had a sub-1-day interval were not replayed within that session.
3. After finishing the session and returning to the dashboard, it again showed the same stale X cards / Y lessons (pre-sync numbers), not reflecting the just-completed reviews.
4. Re-running sync again reproduced the same jump to the same updated numbers as before (X+N / Y+1) — i.e. the cycle repeated identically.
5. Starting a new study session surfaced the same cards that were just reviewed in the previous session.

**Error messages:** None — silent, no visible errors or console warnings reported.

**Timeline:** User is not sure when this started / whether it's a regression.

**Reproduction steps:**
1. Open app (Home / dashboard).
2. Note due count X cards from Y lessons.
3. Pull-to-refresh to trigger `POST /api/sync`.
4. Due count updates to X+N cards from Y+1 lessons.
5. Start a study session, review cards through to completion.
6. Observe: any card graded with a resulting short (<1 day) interval is not requeued/replayed within the same session.
7. Return to dashboard: due count shows the ORIGINAL X/Y again (not X+N/Y+1, and not reflecting the reviews just submitted).
8. Sync again: due count updates to the same X+N/Y+1 as step 4.
9. Start a new study session: same cards from the just-completed session reappear.

**Suspected areas (from CLAUDE.md architecture, not yet confirmed):**
- `app/page.tsx` (RSC) → `lib/dashboard.ts:getStats()` — possible caching (Next.js Data Cache / full route cache) causing stale reads across navigations, OR a client-side stale prop issue in `HomeClient.tsx` since due count isn't actually sourced from `getStats()`/`getActivityData()` per CLAUDE.md (need to verify where "X cards due from Y lessons" is actually rendered/fetched from).
- `components/StudySession.tsx` optimistic grading (`submitReview` synchronous FSRS + fire-and-forget `POST /api/review`) — if the background POST silently fails or races, the requeue-within-session logic (REQUEUE_GAP=4) and/or the persisted `nextReview` may diverge from what's shown.
- `lib/study-cards.ts:getStudyCards()` / `GET /api/cards/due` pool query — possible caching or query staleness causing "same cards shown again" in a new session shortly after the prior one completed.
- Next.js Router Cache / client-side navigation cache between Home ↔ Study pages (`prefetch` staleness) — since `app/*/page.tsx` are RSCs fetching server-side, a client-side back-navigation could be serving a cached RSC payload instead of refetching.

## Current Focus

- hypothesis: PRIMARY — `/`, `/study` (and `/habits`) RSC pages fetch via Prisma with NO dynamic API in the render tree, so Next.js 16 statically prerenders them at build time. In production they serve a permanently-stale build-time snapshot of due-cards/stats. `next dev` always renders dynamically, masking the bug (matches CLAUDE.md's own "test with build && start, not dev" warning). SECONDARY — `submitReview` skips the local FSRS recompute (and therefore the in-session requeue) for brand-new cards because the guard requires `reviewData.lastReview`, which is null on never-reviewed cards → sub-day cards never replayed within a session (symptom #2).
- test: Run `npm run build` and read the route table — ○ (Static) vs ƒ (Dynamic) for `/`, `/study`, `/habits`. Static confirms the primary hypothesis.
- expecting: `/`, `/study`, `/habits` marked ○ Static (or "prerendered"). If ƒ Dynamic, the primary hypothesis is wrong and I pivot to client Router Cache / bfcache.
- next_action: Apply Fix 1 (force-dynamic on the 4 data-driven RSC pages) + Fix 2 (relax new-card requeue guard); then rebuild to confirm the route table flips to ƒ Dynamic, run lint, and request human verification in prod.
- reasoning_checkpoint:
    hypothesis: "Two independent root causes. (1) `/`, `/study`, `/habits`, `/cards` render live DB data via Prisma with no dynamic API, so Next.js 16 statically prerenders them at build → prod serves a frozen build-time snapshot (stale due counts, same study cards). (2) `submitReview`'s `if (reviewData && reviewData.nextReview && reviewData.lastReview)` guard skips brand-new cards (lastReview null), so their local FSRS recompute + in-session requeue never run → sub-day cards not replayed."
    confirming_evidence:
      - "Build route table: `○ (Static)` for /, /cards, /habits, /study, /settings, /wrapped; `ƒ (Dynamic)` for all /api/* — direct, unambiguous."
      - "grep: zero `dynamic`/`revalidate`/`noStore`/`cookies`/`headers`/`connection` in the page/layout render tree; pages use Prisma (non-fetch) which does not trigger dynamic rendering."
      - "reviewCard() in lib/fsrs.ts already handles lastReview===null via createEmptyCard(now); the client guard is stricter than the server for no reason, and postReviewWithRetry fires regardless so the server state diverges from the in-session queue."
    falsification_test: "After adding force-dynamic, `npm run build` should mark /, /study, /habits, /cards as `ƒ (Dynamic)`. If they stay `○ (Static)`, hypothesis-1's fix is wrong. For hypothesis-2: a new card (state 0/1, lastReview null) graded Again must reappear later in the same session."
    fix_rationale: "Fix-1 opts the pages into per-request dynamic rendering so `getStats`/`getStudyCards` run live on every visit — addresses the root cause (static snapshot), not a symptom. Fix-2 relaxes the guard to `reviewData && reviewData.nextReview` and passes `lastReview: null` through to reviewCard (which already supports it), so new cards get the same requeue logic as reviewed cards."
    blind_spots: "Have not yet confirmed in a running prod-mode server that back-navigation shows live counts (needs `npm run build && npm start` or Vercel). Have not exercised the exact ts-fsrs interval for a new-card Again to visually confirm requeue (relying on FSRS learning-step semantics). Router Cache/bfcache could still cause a brief stale flash on browser Back even with dynamic rendering — will note for human verification."
- tdd_checkpoint:

## Evidence

- timestamp: 2026-07-03
  checked: Dashboard due-count source — `app/page.tsx` (RSC) → `lib/dashboard.ts:getStats()` → `HomeClient` prop `initialStats.dueCards`.
  found: `getStats()` runs `prisma.cardReview.count({ where: { nextReview: { lte: now } } })` etc. via Prisma (not `fetch`). `HomeClient` only refetches `/api/stats` inside `handleSync` (pull-to-refresh); mount effect deliberately does NOT refetch (comment: "props provide initial data"). So the displayed due count == the server render's `initialStats` until a manual sync mutates the ephemeral useState.
  implication: If the server render is a stale static snapshot, the dashboard shows stale counts until sync, and any navigation away/back restores the stale snapshot (loadStats state is lost on unmount). Matches symptoms #1 and #3.

- timestamp: 2026-07-03
  checked: Dynamic-rendering signals across the render tree — `app/layout.tsx`, `app/page.tsx`, `app/study/page.tsx`, `middleware.ts`; grep for `dynamic`/`revalidate`/`noStore`/`cookies`/`headers`/`connection`/`searchParams`/`router.refresh`/`revalidatePath`.
  found: NONE present in the page/layout render path. Layout awaits Prisma settings (getButtonColor etc.) — still non-fetch, non-dynamic. Auth cookie is read only in `middleware.ts` (separate from page render, does not force dynamic). No `export const dynamic`/`revalidate` anywhere. `router.refresh()` only in `app/login/page.tsx`. Next.js 16.2.1.
  implication: With no dynamic API and Prisma (non-fetch) data, Next.js App Router defaults `/`, `/study`, `/habits` to STATIC prerendering at build time → build-time DB snapshot served in prod. API routes (`/api/stats`, `/api/cards/due`) are always dynamic, so sync's `loadStats()` reads live DB — which is why sync appears to "fix" the number (symptom #4), and why a fresh page navigation reverts to the stale snapshot.

- timestamp: 2026-07-03
  checked: In-session requeue of sub-day cards — `components/StudySession.tsx:submitReview` (lines ~468–537).
  found: The local FSRS recompute + `requeue` decision are gated by `if (reviewData && reviewData.nextReview && reviewData.lastReview)`. Brand-new/never-reviewed cards have `lastReview === null`, so the block is SKIPPED and `requeue` stays `false` → the card is dropped from the queue (`rest`) instead of re-inserted at REQUEUE_GAP. The background `postReviewWithRetry` still fires (server persists FSRS), but the in-session replay never happens. Comment claims "new cards are handled by REQUEUE_GAP anyway" — incorrect; REQUEUE_GAP only applies when requeue===true.
  implication: New cards graded Again/Hard (sub-day interval) are never replayed within the same session. Directly explains symptom #2. This is a SECOND, independent bug from the static-render staleness.

- timestamp: 2026-07-03
  checked: `POST /api/review` persistence — `app/api/review/route.ts`.
  found: Loads `cardReview` by cardId, runs `reviewCard()` server-side, updates the row. Always dynamic (API route). Reviews DO persist to DB (independent of the static page staleness).
  implication: Reviews are saved correctly; symptom #5 ("new session shows same cards") is therefore NOT a persistence failure — it is the STATIC `/study` page serving the same build-time `initialCards` on every fresh navigation, regardless of the now-updated DB. Reinforces the primary hypothesis.

## Eliminated

- hypothesis: Reviews not persisting (fire-and-forget POST /api/review silently failing) causes symptom #5.
  evidence: `postReviewWithRetry` fires for every real card regardless of the recompute guard, and `POST /api/review` (an always-dynamic route) loads → reviewCard() → updates the row. Persistence is independent of the page-render bug. Symptom #5 is fully explained by the static `/study` page re-serving build-time `initialCards`, not by a persistence failure.
  timestamp: 2026-07-03

## Post-fix verification evidence

- timestamp: 2026-07-03
  checked: `npm run build` route table after adding `export const dynamic = 'force-dynamic'`.
  found: `/`, `/cards`, `/habits`, `/study` now marked `ƒ (Dynamic)` (were `○ Static`). Build + TypeScript compile clean.
  implication: The pages will re-query the DB per request in production → live due counts and live study-card pool on every navigation. Fixes symptoms #1, #3, #4, #5.

- timestamp: 2026-07-03
  checked: `npm run lint` before (git stash) and after the change.
  found: Identical single pre-existing warning at StudySession.tsx:355 (cardSentences useMemo dep) — unrelated to the edit. Zero errors, zero new warnings introduced.
  implication: Change respects the repo's clean-lint invariant.

## Resolution

- root_cause: |
    Two independent bugs, both reported by the user.
    (1) PRIMARY — stale dashboard/study state: `app/page.tsx`, `app/study/page.tsx`,
    `app/habits/page.tsx`, `app/cards/page.tsx` fetch live DB data via Prisma with NO
    dynamic API in the render tree. Next.js 16 therefore statically prerenders them at
    build time (confirmed: build route table showed `○ (Static)`), baking a frozen
    build-time DB snapshot that production serves on every visit. Sync's client-side
    `loadStats()` reads the always-dynamic `/api/stats`, which is why sync appears to
    "fix" the count (symptom #4); any navigation re-serves the static snapshot
    (symptoms #1, #3), and a fresh `/study` visit re-serves the same build-time
    `initialCards` (symptom #5 — reviews DO persist; the page just never re-queries).
    `next dev` always renders dynamically, which is why it was never caught in dev
    (matches CLAUDE.md's own "test with build && start, not dev" note).
    (2) SECONDARY — sub-day cards not replayed (symptom #2): `submitReview` in
    StudySession gated the local FSRS recompute + requeue decision behind
    `reviewData.lastReview`, which is null on brand-new cards, so new cards graded
    Again/Hard were dropped from the queue instead of requeued at REQUEUE_GAP.
- fix: |
    (1) Added `export const dynamic = 'force-dynamic'` to app/page.tsx,
    app/study/page.tsx, app/habits/page.tsx, app/cards/page.tsx — forces per-request
    dynamic rendering so the Prisma queries run live on every visit.
    (2) Relaxed the StudySession requeue guard from
    `if (reviewData && reviewData.nextReview && reviewData.lastReview)` to
    `if (reviewData && reviewData.nextReview)`, and pass
    `lastReview: reviewData.lastReview ? new Date(reviewData.lastReview) : null` into
    the FSRS recompute (reviewCard already supports null lastReview via createEmptyCard).
- verification: |
    Code-level: rebuild route table flipped `/`, `/cards`, `/habits`, `/study` from
    `○ (Static)` to `ƒ (Dynamic)` (see Post-fix verification evidence); build +
    TypeScript compile clean; `npm run lint` shows only the one pre-existing unrelated
    warning (no new warnings). Resolved on the strength of this code-level reasoning +
    build route-table verification.
    RESIDUAL RISK — manual browser verification was INTENTIONALLY SKIPPED per user
    decision (2026-07-03). Not observed live: (a) prod-mode back-navigation showing
    live due counts (Next.js Router Cache / bfcache could still cause a brief stale
    flash on browser Back even with dynamic rendering); (b) Fix 2's in-session requeue
    of a brand-new card graded Again — this is UI-state behavior that was reasoned
    from ts-fsrs learning-step semantics but not watched happen in a live session.
    Watch these two behaviors on the next real study session / Vercel deploy.
- files_changed:
    - app/page.tsx
    - app/study/page.tsx
    - app/habits/page.tsx
    - app/cards/page.tsx
    - components/StudySession.tsx
