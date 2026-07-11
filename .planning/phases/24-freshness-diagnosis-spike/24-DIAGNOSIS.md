# Phase 24: Freshness Diagnosis — Empirical Results

**Phase:** 24-freshness-diagnosis-spike
**Date:** 2026-07-11
**Method:** Production build (`npm run build` + `next start -p 3200`, never `next dev`), driven headlessly by `playwright@1.61.1` (raw library, no `@playwright/test`) against an isolated local `file:` SQLite test database (`scripts/.tmp/24-diagnosis.db`, WAL journal mode) — never the real Turso `DATABASE_URL`. Script: `scripts/diagnose-freshness.mts` (throwaway, Plan 24-01 + 24-02). Next.js 16.2.1 (Turbopack). All four routes under test (`/`, `/cards`, `/study`, `/habits`) confirmed `ƒ` (dynamic) in the build output before any browser work, per the Pitfall-4 sanity gate.

Zero production code changes were made to produce this diagnosis (Phase Boundary, CONTEXT.md) — every finding below comes from real network + DOM evidence captured by the throwaway script, not from reading source and guessing.

## RSC Request Signature (empirically confirmed)

Resolves RESEARCH Open Question #1. Captured via `npx tsx scripts/diagnose-freshness.mts --log-requests` (Plan 24-02 Task 1) against this app's real traffic on Next.js 16.2.1, production build.

- **Distinguishing signal:** a lowercase `rsc: 1` request header, present on every client-side RSC data fetch (both real click-triggered navigation fetches and Next's own Link-prefetch requests).
- **Secondary signal (also present in every observed case, not required for detection):** an `_rsc=<hash>` query parameter on the URL.
- **Sample captured request** (Link-click leg, `/` → click "Study"):
  ```
  URL:     http://localhost:3200/study?_rsc=1knnb
  Headers: rsc: 1
           next-router-state-tree: %5B%22%22%2C%7B%22children%22%3A...
           next-url: /
  ```
- **Distinguishing a real navigation fetch from Next's own prefetch:** prefetch requests additionally carry a `next-router-prefetch` header; real click/back-triggered fetches do not. Both count as "a data fetch occurred" for this diagnosis's classification purposes — only whether the server was hit at all matters, not which kind of fetch it was.
- **Full-document navigation** (`page.goto`, hard reload) carries neither header nor query param and has `resourceType: 'document'`.
- **Sanity gate (RESEARCH Pitfall 1):** the Link-click leg to `/study` (a force-dynamic route, `staleTimes.dynamic = 0`) registered 17 matching requests out of 24 total under the locked predicate — confirming the filter is not vacuously matching zero requests. This gate re-runs and re-passes at the top of every full matrix run (Plan 24-02 Task 2 acceptance criteria).
- **Capture date:** 2026-07-11.

The locked predicate (`isRscRequest()`, `scripts/diagnose-freshness.mts`) checks only the `rsc: 1` header — this is what Phase 25's E2E-06 spec should use to detect a real RSC re-fetch on the wire.

## Summary Matrix

| Route | Navigation path | Verdict | Root cause | Evidence pointer |
|-------|------------------|---------|-------------|-------------------|
| `/` | plain `<Link>` | Fresh | — | Confirmed-Fresh Paths #1 |
| `/` | back/forward | Stale-RouterCache | Router Cache reuse — no RSC re-fetch observed | [/ back-forward](#-back-forward) |
| `/` | tab/PWA resume | Stale-RouterCache | Router Cache reuse — no RSC re-fetch observed | [/ resume](#-resume) |
| `/` | post-mutation return (primary, D-05) | Fresh | — | Confirmed-Fresh Paths #5 |
| `/study` | plain `<Link>` | Fresh | — | Confirmed-Fresh Paths #2 |
| `/study` | back/forward | Stale-ClientShell | client-shell state non-resync — RSC re-fetch observed, UI unchanged | [/study back-forward](#study-back-forward) |
| `/study` | tab/PWA resume | Stale-RouterCache | Router Cache reuse — no RSC re-fetch observed | [/study resume](#study-resume) |
| `/study` | post-mutation return (primary, D-05) | Fresh | — | Confirmed-Fresh Paths #6 |
| `/cards` | plain `<Link>` | Fresh | — | Confirmed-Fresh Paths #3 |
| `/cards` | back/forward | Stale-ClientShell | client-shell state non-resync — RSC re-fetch observed, UI unchanged | [/cards back-forward](#cards-back-forward) |
| `/cards` | tab/PWA resume | Stale-RouterCache | Router Cache reuse — no RSC re-fetch observed | [/cards resume](#cards-resume) |
| `/cards` | post-mutation return (D-06, DB-level) | Fresh | — | Confirmed-Fresh Paths #7 |
| `/habits` | plain `<Link>` | Fresh | — | Confirmed-Fresh Paths #4 |
| `/habits` | back/forward | Stale-ClientShell | client-shell state non-resync — RSC re-fetch observed, UI unchanged | [/habits back-forward](#habits-back-forward) |
| `/habits` | tab/PWA resume | Stale-RouterCache | Router Cache reuse — no RSC re-fetch observed | [/habits resume](#habits-resume) |
| `/habits` | post-mutation return (D-06, DB-level) | Stale-ClientShell | client-shell state non-resync — RSC re-fetch observed, UI unchanged | [/habits post-mutation-return](#habits-post-mutation-return) |

16 rows, one per route × path cell (4 routes × 4 paths, D-04). Every cell carries exactly one of the three verdict tokens; none is ambiguous (D-10). Tally: **7 Fresh, 5 Stale-RouterCache, 4 Stale-ClientShell.**

## Confirmed-Fresh Paths

Explicit list per ROADMAP Success Criterion 4 / D-09 — these paths must stay untouched by Phase 26's fix.

1. **`/` plain `<Link>`** — mutated one `CardReview.nextReview` to due, clicked the real Home nav `<Link>`. Expected due-count `2`, observed `2`. 1 RSC fetch captured (`http://localhost:3200/?_rsc=17jh7`).
2. **`/study` plain `<Link>`** — mutated due-count, clicked the real Study nav `<Link>`. Expected `1`, observed `1`. 1 RSC fetch captured (`http://localhost:3200/study?_rsc=1knnb`).
3. **`/cards` plain `<Link>`** — created a new card via direct Prisma insert, clicked the real Cards nav `<Link>`. Expected `Cards (4)`, observed `Cards (4)`. 1 RSC fetch captured (`http://localhost:3200/cards?_rsc=1l1qv`).
4. **`/habits` plain `<Link>`** — promoted one `CardReview` to mastered (`state=2`, `scheduledDays>=21`), clicked the real Habits nav `<Link>`. Expected `1`, observed `1`. 1 RSC fetch captured (`http://localhost:3200/habits?_rsc=1hoic`).
5. **`/` post-mutation return (primary D-05 scenario)** — graded all 3 seeded due cards to completion through the real Flashcards UI (Show Answer → Easy, repeated), then clicked the real "Back to Dashboard" `<Link>` from the completion screen. Expected `zero-due-state`, observed `zero-due-state` (Home hero correctly showed the "All caught up" / "Goal met" state, not the stale due-count). 1 RSC fetch captured (`http://localhost:3200/?_rsc=17v6m`).
6. **`/study` post-mutation return (primary D-05 scenario)** — same grading session as #5, then clicked the real Study nav `<Link>` back to select-mode. Expected `zero-due-state`, observed `zero-due-state` (select-mode correctly showed the empty-state copy, not a stale due-count). 1 RSC fetch captured (`http://localhost:3200/study?_rsc=1knnb`).
7. **`/cards` post-mutation return (D-06 cheap DB-level variant)** — visited `/cards`, navigated to Home, created a new card directly via Prisma (simulating a sync), navigated back to `/cards`. Expected `Cards (7)`, observed `Cards (7)`. 1 RSC fetch captured (`http://localhost:3200/cards?_rsc=1l1qv`).

## Stale-Path Scenario Blocks

### `/` back-forward

**Steps to reproduce:**
1. Navigate to `/` (`page.goto('/')`, full document load). Note the Home hero due-count text (`domBefore`).
2. Click the real Cards nav `<Link>` (client-side/soft navigation away from `/`).
3. Mutate the DB directly: flip one `CardReview.nextReview` between past/future to change the live due-count.
4. Trigger the browser's native back navigation (`window.history.back()` — equivalent to pressing the physical/PWA back button).
5. Observe the Home hero.

**Expected vs Actual:** Expected due-count `1` (live query at classification time). DOM before the back-nav showed `2`. DOM after the back-nav: `(unrecognized state)` — the frame transiently reported `about:blank` at read time under this script's automation load (see Notes for Phase 25/26 — Instrumentation Caveats). The verdict itself is **not** based on this DOM read; it is based on the fetch-count evidence below, which is untampered-with and unambiguous.

**Evidence:** **0 new network requests** for `/` were captured in the window after the triggering `history.back()` action (neither an `rsc: 1`-header fetch nor a `resourceType: 'document'` fetch). Per D-10, zero fetches at all is the exact definition of Router Cache reuse — Next.js served the previously-cached `/` segment straight from client memory with no server round-trip, so the mutated due-count was never seen.

### `/` resume

**Steps to reproduce:**
1. Navigate to `/`.
2. Mutate the DB directly: flip due-count (simulating a background sync landing while the PWA is backgrounded).
3. Simulate backgrounding: `page.evaluate()` overrides **both** `document.hidden = true` and `document.visibilityState = 'hidden'`, then dispatches a `visibilitychange` event. Wait ~150ms.
4. Simulate resume: override both properties back to `false`/`'visible'`, dispatch `visibilitychange` again. Wait ~250ms.
5. Observe the Home hero.

**Expected vs Actual:** Expected `zero-due-state` (the mutation flipped the seeded due card to not-due). Observed `1` — the hero still showed the pre-mutation due-count of `1`, not the post-mutation zero-due empty state.

**Evidence:** **0 new network requests** for `/` were captured after the `visibilitychange` dispatch cycle. There is no listener anywhere in `HomeClient.tsx` that re-fetches on visibility change — the app has no resume-detection code path for Home at all, so this is the most severe case of Router Cache reuse: not only does the client not resync, nothing even attempts to.

### `/study` back-forward

**Steps to reproduce:**
1. Navigate to `/` (starting point), then click the real Study nav `<Link>` to reach `/study` for the first time this session. Note the select-mode due-count text (`domBefore`).
2. Click the real Home nav `<Link>` (soft navigation away from `/study`).
3. Mutate the DB: flip due-count.
4. Trigger `window.history.back()`.
5. Observe `/study` select-mode.

**Expected vs Actual:** Expected `zero-due-state`. DOM before the back-nav showed `1`. DOM after: `(unrecognized state)` (same transient `about:blank` frame artifact as the `/` back-forward cell above — see Instrumentation Caveats). The verdict is driven by the fetch evidence below, not this DOM read.

**Evidence:** **1 new RSC fetch WAS captured** for `/study` (`http://localhost:3200/study?_rsc=183tn`, carrying the `rsc: 1` header). This is the opposite signature from the `/` back-forward cell: the server WAS hit and returned fresh data, but the mounted `StudyClient` component — which initializes `studyCards` via `useState<CardDTO[]>(initialCards)` with no prop-resync effect — never adopted the new payload. This is a textbook client-shell non-resync (RESEARCH Pitfall 2 / CONTEXT D-10's second category), distinct in root cause from Home's pure Router Cache reuse even though both present as "stale" to the user.

### `/study` resume

**Steps to reproduce:**
1. Navigate to `/study`.
2. Mutate the DB: flip due-count.
3. Simulate backgrounding + resume via the dual-property `visibilitychange` override (same technique as the `/` resume cell — `document.hidden` AND `document.visibilityState` both overridden, since `StudySession.tsx`'s existing listener reads `visibilityState`, not `hidden`).
4. Observe `/study` select-mode.

**Expected vs Actual:** Expected `1` (the mutation made a previously-not-due card due). Observed `zero-due-state` — select-mode still showed the pre-mutation empty state.

**Evidence:** **0 new network requests** for `/study` after the `visibilitychange` cycle. `StudyClient.tsx`'s select-mode has no visibility-driven re-fetch; the only listener in this subsystem (`StudySession.tsx`, mid-session time-tracking) is unrelated to due-count freshness. Router Cache reuse, same category as `/` resume.

### `/cards` back-forward

**Steps to reproduce:**
1. Navigate to `/`, click the real Cards nav `<Link>` to reach `/cards`. Note the "Cards (N)" toggle button text (`domBefore`).
2. Click the real Home nav `<Link>` (soft navigation away).
3. Mutate the DB: create a new card via direct Prisma insert (unique `normalizedFront`, one blank-safe sentence) — simulating a sync landing while away from the page.
4. Trigger `window.history.back()`.
5. Observe the "Cards (N)" toggle button on `/cards`.

**Expected vs Actual:** Expected `Cards (5)`. DOM before showed `Cards (4)`. DOM after: `(unrecognized state)` (transient `about:blank` frame — see Instrumentation Caveats; verdict is fetch-evidence-driven, not DOM-read-driven).

**Evidence:** **1 new RSC fetch WAS captured** (`http://localhost:3200/cards?_rsc=17s49`). Same pattern as `/study` back-forward: the server returned fresh data (5 cards) but `CardsClient.tsx`'s `useState<CardDTO[]>(initialCards)` never adopted it — client-shell non-resync, not Router Cache reuse.

### `/cards` resume

**Steps to reproduce:**
1. Navigate to `/cards`.
2. Mutate the DB: create a new card (same mutator as above).
3. Simulate backgrounding + resume via the dual-property `visibilitychange` override.
4. Observe the "Cards (N)" toggle button.

**Expected vs Actual:** Expected `Cards (6)`. Observed `Cards (5)` — the pre-mutation count, one card behind.

**Evidence:** **0 new network requests** for `/cards` after the `visibilitychange` cycle. No resume-driven re-fetch exists anywhere in `CardsClient.tsx`. Router Cache reuse.

### `/habits` back-forward

**Steps to reproduce:**
1. Navigate to `/`, click the real Habits nav `<Link>` to reach `/habits`. Note the Proficiency panel's "cards mastered" number (`domBefore`).
2. Click the real Home nav `<Link>` (soft navigation away).
3. Mutate the DB: promote one `CardReview` to mastered (`state=2`, `scheduledDays=30`).
4. Trigger `window.history.back()`.
5. Observe the Proficiency panel's "cards mastered" number on `/habits`.

**Expected vs Actual:** Expected `2`. DOM before showed `1`. DOM after: `(unrecognized state)` (transient `about:blank` frame — verdict is fetch-evidence-driven, see Instrumentation Caveats).

**Evidence:** **1 new RSC fetch WAS captured** (`http://localhost:3200/habits?_rsc=rdt8x`). Same client-shell non-resync pattern: `HabitsClient.tsx` initializes `masteredCount` via `useState(initialMasteredCount)` with no resync — the server returned the fresh count but the mounted component never re-read it.

### `/habits` resume

**Steps to reproduce:**
1. Navigate to `/habits`.
2. Mutate the DB: promote one `CardReview` to mastered.
3. Simulate backgrounding + resume via the dual-property `visibilitychange` override.
4. Observe the Proficiency panel's "cards mastered" number.

**Expected vs Actual:** Expected `3`. Observed `2` — one card behind the live value.

**Evidence:** **0 new network requests** for `/habits` after the `visibilitychange` cycle. Router Cache reuse — same category as the other three resume cells.

### `/habits` post-mutation-return

**Steps to reproduce (D-06 cheap DB-level variant — tagged as such per plan requirement, not UI-driven):**
1. Navigate to `/habits`.
2. Click the real Home nav `<Link>` (navigate away).
3. Mutate the DB directly: promote one `CardReview` to mastered (`state=2`, `scheduledDays=30`) — simulating what a real study session's server-side FSRS update would produce, without actually driving a grading UI flow for this secondary route.
4. Click the real Habits nav `<Link>` (navigate back).
5. Observe the Proficiency panel's "cards mastered" number.

**Expected vs Actual:** Expected `1`. Observed `0` — the pre-mutation value.

**Evidence:** **1 new RSC fetch WAS captured** (`http://localhost:3200/habits?_rsc=1hoic`) — the exact same URL/hash as the confirmed-fresh `/habits` plain-`<Link>` cell, since Next.js reused the same RSC payload URL for this segment. The server was hit and had the correct fresh data available; `HabitsClient.tsx`'s `useState(initialMasteredCount)` is the reason the UI never reflected it. This is the **only** post-mutation-return cell (of the four routes) that stayed stale — the `/` and `/study` primary D-05 scenario and the `/cards` D-06 variant all correctly resynced on this exact navigation path, so `/habits`'s client shell is uniquely affected here (see Notes below).

## Notes for Phase 25/26

**Two distinct root causes, cleanly separated by fetch-count evidence:**
- **Router Cache reuse** (no RSC re-fetch at all): every `resume` cell (`/`, `/study`, `/cards`, `/habits` — 4/4), plus `/` `back-forward`. 5 cells total. None of these routes has ANY resume-detection code path today; a `visibilitychange`-driven invalidation (e.g., `router.refresh()` on resume) would fix all 4 resume cells in one shared mechanism. `/` back-forward's Router Cache reuse is a separate mechanism (Next's client Router Cache serving the previously-visited segment on `popstate` with zero re-fetch) and needs its own fix (e.g., disabling/shortening the relevant `staleTimes` bucket for back/forward, or explicit `router.refresh()` on `popstate`).
- **Client-shell state non-resync** (RSC re-fetch DID happen, UI didn't adopt it): `/study` back-forward, `/cards` back-forward, `/habits` back-forward, `/habits` post-mutation-return. 4 cells total. Every affected shell (`StudyClient`, `CardsClient`, `HabitsClient`) initializes its due/count state via `useState(initialXxx)` with no prop-resync effect (RESEARCH Pitfall 2) — this is the exact category CONTEXT.md's "Established Patterns" section predicted for all four shells. **`HomeClient` is the only shell that never exhibited this failure mode** — its `back-forward` and `resume` cells were both pure Router Cache reuse (no fetch reached the client at all), so `HomeClient`'s own state-adoption logic was never actually put to the test by back-forward navigation; it also never needed to be, since Home's post-mutation-return path (the primary D-05 scenario) came back Fresh.

**Post-mutation-return asymmetry — the most actionable finding:** the primary D-05 scenario (real UI grade session → Home → Study) came back **Fresh for both `/` and `/study`** — the exact prior-regression scenario this phase was launched to re-diagnose is **not currently reproducing** as stale via a plain post-session `<Link>` return. The `/cards` D-06 variant was also Fresh. Only `/habits`'s D-06 variant stayed stale. This means: whatever caused the original regression report, it is either (a) already fixed by unrelated prior work, (b) specific to the `back-forward` / `resume` paths rather than plain post-session `<Link>` return, or (c) specific to `/habits`. Phase 26 should treat `/habits`'s `useState(initialMasteredCount)` non-resync as a confirmed, currently-reproducing bug, and should NOT assume the `/`/`/study` post-session return path needs a fix — that path is Confirmed-Fresh (see above) and Phase 26's fix must leave it untouched (ROADMAP Success Criterion 4).

**D-06 secondary scenarios' deferral status:** the card edit/delete Sheet UI flow and the review-undo flow (both listed as Deferred Ideas in CONTEXT.md) were **not** built or tested in this phase, exactly as scoped. Based on the pattern observed above (`CardsClient`'s `useState(initialCards)` already confirmed non-resync via the plain DB-mutation D-06 variant on `back-forward`), a card edit/delete through the real UI is expected to exhibit the same non-resync symptom on `back-forward` — but this is an extrapolation, not empirically confirmed, and Phase 25/26 should treat it as an assumption to verify, not a given.

**Instrumentation caveats:**
- **`visibilitychange` resume simulation is a proxy, not real PWA backgrounding** (per CONTEXT.md's Deferred Ideas) — actual OS-level app backgrounding/foregrounding on a real device was out of scope for this spike. The dual-property override (`document.hidden` AND `document.visibilityState`, both required since `StudySession.tsx` reads `visibilityState` specifically — RESEARCH Pitfall 2) reliably triggers this app's existing visibility listeners, but a real device could theoretically differ.
- **Transient `about:blank` frame during `back-forward` reads:** on 4 of the 5 `back-forward` cells (`/`, `/study`, `/cards`, `/habits`), `page.url()` reported `about:blank` at DOM-read time even though the fetch-count evidence (captured immediately after the triggering `history.back()` action, before this symptom appears) was already locked in and unaffected. This reproduced consistently across three full runs and is attributed to a Chromium/CDP quirk specific to same-document/`popstate`-only navigation under this script's sustained headless-automation load (multiple concurrent browser contexts + a production server under real DB traffic) — not app behavior a real user would ever see. A corrective re-navigation (`page.goto()`) was deliberately **not** used to paper over this, because a fresh `goto()` always produces a real server fetch and would have silently converted genuine Router Cache reuse / non-resync verdicts into false "Fresh" readings. The verdicts above are unaffected by this artifact; only the literal DOM-after evidence text for those specific cells is `(unrecognized state)` rather than the real stale value.
  - **⚠ Unverified caveat (24-REVIEW.md CR-01):** the 24-code-review pass found that `runStandardCell`'s `back-forward` branch (`scripts/diagnose-freshness.mts` ~lines 828-837) *does* contain a last-resort `page.goto()` recovery when `page.url()` is still `about:blank` after `history.back()` + settle — which runs after the fetch-count baseline (`preLen`) was already captured, so if that recovery path actually fired, its resulting server fetch would be counted as evidence, directly contradicting the "deliberately not used" / "unaffected" claim above. Whether this recovery path executed (vs. the page remaining stuck on `about:blank` through to the `domAfter` read, which is what the "(unrecognized state)" evidence text for these 4 cells suggests) was not confirmed from raw logs — the run log was not preserved per this plan's scope. **Phase 25's E2E-06 spec author should independently re-verify the 4 affected `back-forward` verdicts (`/`, `/study`, `/cards`, `/habits`) rather than encode them from this document alone.**
- **SQLite WAL journal mode was enabled on the isolated test DB** (`PRAGMA journal_mode=WAL`, `scripts/diagnose-freshness.mts`) purely to keep this script's own DB mutations and the `next start` server's concurrent reads from producing `P1008 SocketTimeout` errors under sustained load — a script-reliability fix with no bearing on the diagnosis findings themselves (Turso in production is unaffected; this only ever targeted the throwaway `scripts/.tmp/24-diagnosis.db` file).
- **The throwaway script (`scripts/diagnose-freshness.mts`) was kept, not discarded** — it accelerates Phase 25's initial E2E harness setup (env-isolation guard, prod-server orchestration, cookie-auth injection, and the now-confirmed `isRscRequest()` predicate are all directly reusable), per CONTEXT.md's Claude's Discretion note.
