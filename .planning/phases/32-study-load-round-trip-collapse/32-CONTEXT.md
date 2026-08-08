# Phase 32: Study Load Round-Trip Collapse - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning
**Note:** Full `/gsd-discuss-phase` was explicitly skipped (user confirmed) — this phase's goal/success-criteria are fully specified in REQUIREMENTS.md/ROADMAP.md and a source design doc, with no product/UI ambiguity. The two decisions below were surfaced and locked during research (32-RESEARCH.md flagged them as genuine forks needing a human call, not something research should silently resolve) rather than through a full discussion session.

<domain>
## Phase Boundary

Collapse `/study`'s DB round trips from a true baseline that research suspects is materially higher than REQUIREMENTS.md's stated "4-5" (SQLite has no single-query relation-JOIN strategy, so the existing `card.findMany({ include: {...} })` may already be 3-4 physical queries by itself) down to a cached, instrumented, provably-≤2 steady state — without changing which cards a session picks or what order they're shown in.

**In scope:** `lib/study-cards.ts` (Phase A/B query shape), the cache + version-counter invalidation wiring (`lib/sync.ts`, `lib/relink-dependencies.ts`), `app/study/page.tsx`'s separate lessons query, round-trip instrumentation/verification, `e2e/perf.spec.ts` budget tightening.

**Not in scope:** The freshness-backstop double-fetch (Phase 33 / VERS-01/VERS-02), IndexedDB/local-first caching (Phase 34), the service worker (Phase 35). Do not build Phase 33's general-purpose version counter here — STUDY-03's cache is scoped to sync-triggered invalidation only (see D-02).

</domain>

<decisions>
## Implementation Decisions

### Round-trip budget interpretation
- **D-01: The "≤2 round trips" target is a steady-state (warm-cache) guarantee, not an absolute per-request ceiling.** A single extra round trip is acceptable on the specific request that hits a cache miss — a cold Lambda/Fluid Compute instance, or the first `/study` load immediately after a sync or `relinkAllDependencies()` run. — **Reversibility:** cheap — this is a target-interpretation choice, not an irreversible architecture commitment; a later phase could tighten it further (e.g. by always folding the invariant reads as subqueries into the same live-pool query, trading DB compute for a hard guarantee) without redoing this phase's cache design.
  - **Why:** the alternative (an unconditional ≤2 on literally every request, including cache-miss) would require always recomputing `CardDependency`/lemma/lesson JSON aggregates on every single load regardless of whether anything changed — real DB work on the common case, and arguably not "caching" in the sense STUDY-03's "served from cache... invalidated on sync" wording describes. 32-RESEARCH.md's own recommended architecture (version-counter check inside the live-pool query, conditional refill on mismatch) was already built around this steady-state reading; this decision confirms it rather than forcing the more expensive always-recompute alternative.
  - **Verification implication:** the query-instrumentation test proving STUDY-01 (success criterion #1) must assert ≤2 on a warm-cache run, and may separately assert/document the cache-miss count (research's projected architecture: 3) rather than asserting ≤2 unconditionally on every call shape.

### Known-lemmas staleness scope
- **D-02: The known-lemmas cache invalidates on sync completion only — exactly as STUDY-03 is literally worded. It does NOT also invalidate on individual `POST /api/review` writes.** — **Reversibility:** cheap — Phase 33's future general-purpose version counter (VERS-01, "bumped by sync completion and review writes") can extend invalidation triggers later without re-architecting this phase's cache; this phase's counter is deliberately narrower-scoped.
  - **Why:** keeps Phase 32 self-contained (doesn't pull forward Phase 33 scope) and matches the requirement text exactly. The accepted tradeoff: a card graded to FSRS state ≥ 1 for the first time today won't count as "known" for *other* cards' `unknownCount` sentence-ranking / bare-word-first-gate signal until the next sync completes. This is a bounded, presentation-only staleness — it affects which example sentence is shown or whether a card's front shows bare vs. in-context, never session composition, prerequisite closure, or foundation-first ordering (all explicitly protected by success criterion #4, which must hold byte-for-byte).
  - **Warning sign if this assumption is wrong:** if a user actually notices/complains that a just-learned word still shows as "unknown" elsewhere in the same session, that's this decision surfacing as intended (bounded staleness), not a bug — do not "fix" it by adding review-write invalidation without revisiting this decision first.

### Claude's Discretion
- **Exact raw-SQL structure** (whether the cache-miss refill is one combined `json_group_array`-based query or several) — 32-RESEARCH.md's Pattern 1/Code Examples are a strong starting point, not a locked spec; the planner/executor should follow whichever shape passes the round-trip-count instrumentation.
- **Whether Phase B (`card.findMany({ include: {...} })`) actually needs to become raw SQL** is explicitly NOT decided here — 32-RESEARCH.md's Task 1 (instrument-first, measure the real current count) must run before this is committed to. If the empirical count shows Phase B is already 1 physical query, converting it to raw SQL is unnecessary extra risk and should be skipped.
- **Whether `json_group_array`/`json_object` behave identically on Turso's libSQL fork** (32-RESEARCH.md Pitfall 5, unverified this session) — the plan's first raw-SQL task should include a throwaway `turso db shell` smoke test before committing to the pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (locked)
- `.planning/REQUIREMENTS.md` §Study Session Load Performance (P3.3) — STUDY-01, STUDY-02, STUDY-03 full requirement text
- `.planning/ROADMAP.md` §Phase 32 — Goal, 4 Success Criteria, `Depends on: Phase 31` (complete)

### Research (this phase)
- `.planning/phases/32-study-load-round-trip-collapse/32-RESEARCH.md` — read in full before planning. Key load-bearing findings: `$transaction([...])` does NOT batch on this stack (verified from installed `@prisma/adapter-libsql`/`@libsql/client` source — do not implement the sibling design doc's suggestion as written); STUDY-02 is resolved as "confirmed non-duplicative, keep both queries" (verified by direct column comparison, `lib/sequence.ts` vs `lib/dto.ts`); cache invalidation must be DB-persisted (a `Setting`-table version counter), not in-memory-only, because `scripts/local-resync.mts` and `scripts/relink-dependencies.mts` run as standalone processes outside the Next.js server and cannot reach a `globalThis` cache.
- The sibling source doc (`lag_remediation_plan.md` § P3.3, outside this repo) that REQUIREMENTS.md was adapted from — background only, already superseded where 32-RESEARCH.md contradicts it (see above). Do not re-derive from it; trust 32-RESEARCH.md instead.

### Project conventions
- `CLAUDE.md` §Schema changes (Turso gotcha) — no `prisma db push`/`migrate` against `libsql://`; this phase should need zero schema changes (the existing `Setting` table covers the new version-counter key)
- `CLAUDE.md` §RSC server hydration + DTO pattern — `app/study/page.tsx` stays a thin RSC; `getStudyCards()` stays the shared pipeline function called by both the RSC page and `GET /api/cards/due`
- `CLAUDE.md` §Gotchas/conventions — `react-hooks/purity`; `local-resync.mts` env-loading gotcha (dynamic imports) if that script needs edits for invalidation wiring
- `.claude/CLAUDE.md` §Async Patterns — `Promise.allSettled()` precedent already used in `lib/study-cards.ts`; being replaced/supplemented per this phase's design, not blindly extended further

</canonical_refs>

<code_context>
## Existing Code Insights

See 32-RESEARCH.md's "Recommended Project Structure" and "System Architecture Diagram" for the full file-touch list and proposed data flow. Highlights not to re-derive:

- `lib/sequence.ts`'s `SeqCard`/`SeqEdge` interfaces (lines 58-72) define the ENTIRE column surface the light pool query needs — verified identical to `lib/study-cards.ts`'s existing `select` (STUDY-02 is settled, not open).
- `app/study/page.tsx` currently runs its own separate `prisma.lesson.findMany()` in parallel with `getStudyCards()` via `Promise.all` — this is a round trip STUDY-01's "a `/study` load" budget must account for (unlike `GET /api/cards/due`, which doesn't have this query at all). Research's Pitfall 4 flags a real correctness hazard here: folding lessons into the shared cache requires sequencing (`await getStudyCards()` THEN read the now-populated cache), not `Promise.all`, or the lessons read can race the cache population.
- Cache invalidation must be wired into BOTH `lib/sync.ts:runSync()` (unconditional bump at the end) AND `lib/relink-dependencies.ts:relinkAllDependencies()` (unconditional bump inside it) — verified as the only function actually shared, unconditionally, by all three real mutating code paths (the API sync route, `local-resync.mts`, `relink-dependencies.mts`).

</code_context>

<specifics>
## Specific Ideas

No additional specific references beyond the two decisions above — research surfaced exactly two genuine forks (round-trip-budget interpretation, known-lemmas staleness scope) and both were resolved via targeted questions rather than a full discuss-phase, since the rest of the phase is fully determined by the requirements + research.

</specifics>

<deferred>
## Deferred Ideas

- **Always-recompute (no cache-miss branch) architecture for a hard unconditional ≤2** — considered and explicitly rejected in favor of D-01's steady-state reading; noted here in case a future phase wants to revisit for a stricter guarantee.
- **Review-write-triggered lemma cache invalidation** — considered and explicitly rejected in favor of D-02's sync-only scope; Phase 33's VERS-01 is the natural home for this if it's ever wanted.

</deferred>

---

*Phase: 32-study-load-round-trip-collapse*
*Context gathered: 2026-08-08*
