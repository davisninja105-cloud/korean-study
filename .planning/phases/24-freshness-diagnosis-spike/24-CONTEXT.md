# Phase 24: Freshness Diagnosis Spike - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce an empirical, per-route diagnosis of exactly which navigation paths serve stale data on a **production build** (`next build && next start`), attributing each stale path to its cache layer (client-side Router Cache reuse vs. `useState(initialProps)` client-shell non-resync). This phase makes **no fix and no production code changes** — its sole deliverable is a written diagnosis document that Phase 25's freshness-regression spec (E2E-06) will encode directly. Phase 25 (Playwright test infrastructure) does not exist yet — this phase cannot depend on it.

</domain>

<decisions>
## Implementation Decisions

### Diagnosis Methodology
- **D-01:** Reproduction is fully scripted, not manual. Install `playwright` as a throwaway/dev tool (not the Phase 25 harness — do not create `playwright.config.ts` or `tests-e2e/` conventions here) and write a one-off script that drives Chromium against `npm run build && npm start`, capturing per-path whether the RSC payload actually refetched (network-level evidence), not just visual inspection.
- **D-02:** The script is throwaway — it exists to produce the diagnosis, not to become Phase 25's suite. It does not need to follow Phase 25's future conventions (dedicated port, `webServer`, storageState setup project, etc.) but MUST still avoid the same production-DB landmine: never point it at the real `libsql://` `DATABASE_URL`. Use a local `file:` SQLite test DB, seeded with minimal fixture data (a card or two, at least one due for review) — reuse `prisma db push` against `file:` (works fine per Pitfall 7's finding; the Turso DDL gotcha doesn't apply to local SQLite).
- **D-03:** Auth: reuse the deterministic HMAC cookie approach documented in `PITFALLS.md` Pitfall 8 (`lib/auth.ts:computeAuthToken()` + inject the `ks_auth` cookie directly) rather than scripting UI login — faster and this is a throwaway script, not a suite that needs to cover the login flow itself.

### Navigation Paths & Mutation Scenarios
- **D-04:** Test all four ROADMAP-listed navigation paths, per route (`/`, `/cards`, `/study`, `/habits`): back/forward restore, tab/PWA resume, post-mutation same-route return, plain `<Link>`.
- **D-05:** Post-mutation scenario priority — **primary:** finish a study session (grade cards) → navigate to Home and back to Study select-mode → check due-count/stats refresh. This is the exact scenario from the prior regression incident and must be tested thoroughly.
- **D-06:** **Lower-priority, include if cheap:** sync (or direct-seed a new lesson/card to simulate one) → Home/Cards; card edit/delete → Cards list; review undo → Study. Script these only if the harness makes it cheap to add once the primary scenario's scaffolding exists — do not let them block finishing the primary diagnosis.

### Tab/PWA Resume Simulation
- **D-07:** Simulate backgrounding+resume via `page.evaluate()` dispatching `visibilitychange` (document `hidden` → `visible`) — the standard Playwright technique, and it exercises the actual resume-detection code path (which listens for `visibilitychange`), unlike closing/reopening a tab or browser context.

### Diagnosis Output Format
- **D-08:** Written diagnosis = **matrix + scenario blocks**. Lead with a summary table (route × navigation path × stale/fresh × root cause) for at-a-glance scanning, followed by one detailed scenario block per **stale** path: steps to reproduce + expected-vs-actual + evidence (e.g. network log showing RSC payload was/wasn't refetched, or refetched-but-UI-unchanged).
- **D-09:** Explicitly confirm and list paths that are **already fresh** (e.g. plain `<Link>` under `staleTimes.dynamic = 0`) in the summary table too — Success Criteria #4 requires this so the eventual fix (Phase 26) stays surgical and doesn't touch working paths.
- **D-10:** Root-cause attribution is binary and must be explicit per stale row: "Router Cache reuse" (no RSC re-fetch observed at all) vs. "client-shell state non-resync" (RSC re-fetch happened — network evidence shows it — but the mounted `*Client.tsx` shell's UI didn't reflect it, because of `useState(initialProps)`). Never leave a stale path "ambiguous" (ROADMAP Success Criteria #2).

### Claude's Discretion
- Diagnosis file name/location: no strong user preference — `24-DIAGNOSIS.md` in the phase directory is the natural GSD-convention choice.
- Whether the throwaway Playwright script itself gets committed to the repo (e.g., under a `scratch/` or scripts location) vs. run-and-discard is left to the planner/executor — it does not need to survive as a maintained artifact, but keeping it around costs little and could accelerate Phase 25's initial harness setup.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` (Phase 24 section, "Freshness Diagnosis Spike") — the 4 success criteria this phase must satisfy; also read the "Build-order invariant" note immediately above the phase list (diagnosis + E2E harness must both exist before the fix)
- `.planning/REQUIREMENTS.md` — FRESH-01 (the only requirement this phase covers)

### Diagnosis-specific research (read in full — written for this exact phase)
- `.planning/research/PITFALLS.md` — **Pitfall 1** ("Fixing the wrong cache layer (no diagnosis before treatment)") is this phase's entire rationale; **Pitfall 2** (`useState(initialProps)` non-resync) is the second root-cause category to attribute against; **Pitfall 7/8/9** cover the throwaway script's own DB-isolation, auth, and dev-vs-build traps even though this isn't the Phase 25 harness
- `.planning/research/FEATURES.md` line ~30, ~83, ~106, ~129 — "Diagnosis spike" feature entry: expected root causes (Router Cache reuse and/or `useState(initialProps)` non-resync), must test with `npm run build && npm start`, verify each of the 4 routes separately
- `.planning/research/ARCHITECTURE.md` line ~280–281 — describes the diagnosis as "a browser-navigation experiment" and sketches example failing-spec scenarios (grade → `page.goBack()` → assert; grade → `<Link>` nav → assert; `visibilitychange` dispatch to simulate PWA resume) — directly informed D-07
- `.planning/research/SUMMARY.md` — "Phase 1: Diagnosis Spike" section — confirms deliverable shape ("a written diagnosis... encoded as a failing test scenario")

### Architecture this phase is diagnosing
- `.planning/codebase/ARCHITECTURE.md` — "Client Shell Layer" and "RSC Page Layer" sections describe the exact pattern under test: `app/*/page.tsx` (`dynamic = 'force-dynamic'`) → `components/*Client.tsx` (`useState(initialProps)`, no resync effect)
- `CLAUDE.md` — "RSC server hydration + DTO pattern (2026-07 v1.2)" section; also the gotcha "`loading.tsx` only covers client-side navigation, not first load... Test RSC first-paint behavior with `npm run build && npm start`, not `next dev`"
- `.planning/PROJECT.md` — "Current Milestone: v1.6" decisions block: "Freshness is a client-side Router Cache problem, not a server caching issue — every main page already declares `dynamic = 'force-dynamic'`" and the Phase 26 blocker flags (out of scope for this phase, but context for why the diagnosis must be unambiguous)

No other external specs apply — requirements fully captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/auth.ts:computeAuthToken()` — deterministic HMAC cookie computation; the throwaway script can inject the `ks_auth` cookie directly instead of scripting a login form (per D-03)
- All four RSC pages (`app/page.tsx`, `app/study/page.tsx`, `app/cards/page.tsx`, `app/habits/page.tsx`) already declare `export const dynamic = 'force-dynamic'` — confirmed via grep; the "server cache is already maximally fresh" half of the hypothesis is pre-verified, narrowing the diagnosis to client-side behavior

### Established Patterns
- Every client shell (`HomeClient`, `CardsClient`, `StudyClient`, `HabitsClient`) initializes at least one piece of state via `useState<T>(initialXxx)` with no prop-resync effect — confirmed via grep (`CardsClient.tsx:37 cards`, `HomeClient.tsx:30-31 stats/activityData`, `StudyClient.tsx:31 studyCards`, `HabitsClient.tsx:60/62/63 days/goal/masteredCount`). This is the exact shape Pitfall 2 describes — the diagnosis should check each shell's specific stale-vs-fresh state independently since they may not all fail the same way.
- Local `file:` SQLite test DBs work with `prisma db push` (unlike Turso `libsql://`, which requires manual DDL) — confirmed in `PITFALLS.md` Pitfall 7 and consistent with `CLAUDE.md`'s Turso gotcha section.

### Integration Points
- None — this phase produces zero production code changes. Its only artifacts are the diagnosis document and (optionally, per Claude's Discretion) the throwaway reproduction script.

</code_context>

<specifics>
## Specific Ideas

- The diagnosis's summary table must include a row for *every* route × path combination in scope (4 routes × 4 paths = 16 cells minimum), not just the ones expected to be stale — Success Criteria #4 explicitly requires confirming which paths are already fresh.
- Evidence for each stale row should be concrete enough to become an E2E assertion later: e.g., "network tab showed no RSC fetch on `popstate`" vs. "RSC fetch fired (200, fresh JSON payload) but `StudyClient`'s due-count badge showed the pre-session value" — these are two different fixes in Phase 26 and must not be conflated.

</specifics>

<deferred>
## Deferred Ideas

- Sync → Home/Cards, card edit/delete → Cards list, and review undo → Study mutation scenarios are lower-priority for this phase (D-06) — if the throwaway harness doesn't make them cheap to add, defer their diagnosis to whenever Phase 26 touches those shells (the fix pattern learned from the primary study-session scenario likely generalizes).
- Full cross-browser or real-device PWA testing (actually installing the PWA and backgrounding it on a phone) is out of scope — `visibilitychange` dispatch (D-07) is the accepted proxy for this spike.

### Reviewed Todos (not folded)
None — no open todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 24-Freshness Diagnosis Spike*
*Context gathered: 2026-07-10*
