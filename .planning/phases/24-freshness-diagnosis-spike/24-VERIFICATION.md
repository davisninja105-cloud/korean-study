---
phase: 24-freshness-diagnosis-spike
verified: 2026-07-11T00:00:00Z
status: human_needed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Independently re-verify the 4 back-forward-cell verdicts (/, /study, /cards, /habits) in 24-DIAGNOSIS.md against raw evidence before Phase 25's E2E-06 spec encodes them, per the self-documented CR-01 caveat"
    expected: "Either confirmation that the about:blank goto() recovery branch (scripts/diagnose-freshness.mts lines 828-837) did not fire during the accepted run (so the fetch-count evidence for those 4 cells is clean), or a corrected verdict for any cell where it did fire"
    why_human: "The recovery branch's fetch would be captured into the same evidence window (preLen..log.length) used for classification, but the run log that would show whether it fired was not preserved (per plan scope) and the code was intentionally left unfixed per user decision — this can only be resolved by re-running the script with logging preserved or by reading Chromium/CDP behavior directly, not by static analysis of the current repo state"
---

# Phase 24: Freshness Diagnosis Spike Verification Report

**Phase Goal:** Produce an empirical, per-route diagnosis of exactly which navigation paths serve stale data on a production build (`next build && next start`), attributing each stale path to its cache layer and capturing it as a reproducible failing scenario the later regression spec can encode.
**Verified:** 2026-07-11
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Diagnosis names, for each of `/`, `/cards`, `/study`, `/habits`, which of the 4 nav paths do/don't serve stale data, on a production build | ✓ VERIFIED | `24-DIAGNOSIS.md` Summary Matrix has exactly 16 rows (4×4), each with a verdict token. Header states method = `npm run build` + `next start -p 3200`, never `next dev`. Build output route-table check (`scripts/diagnose-freshness.mts:88-91, 275-284`) hard-fails if any of the 4 routes isn't rendered `ƒ` dynamic — confirms production-mode assumption before any browser work. |
| 2 | Every stale path attributed to a root cause (Router Cache reuse vs. client-shell non-resync), never ambiguous | ⚠️ mostly VERIFIED, 4/16 cells carry a self-documented reliability caveat | `classifyCell()` (`scripts/diagnose-freshness.mts:447-463`) implements the exact binary D-10 rule (0 fetches → Stale-RouterCache; fetch+DOM-mismatch → Stale-ClientShell; else Fresh) with no third/ambiguous outcome. All 9 stale rows in `24-DIAGNOSIS.md` carry one of the two attributions, no hedged language. **However**, code review finding CR-01 (`24-REVIEW.md`) identified that the `back-forward` cell driver's `about:blank` recovery (`scripts/diagnose-freshness.mts:828-837`) runs *before* the evidence window closes (`preLen` captured at line 811, `newEntries = log.slice(preLen)` at line 877) — directly contradicting the adjacent comment (lines 858-872) that claims no such recovery exists for this path. This was confirmed still present in the code as-is (not fixed, per user decision) and affects exactly the 4 back-forward cells (`/`, `/study`, `/cards`, `/habits`). `24-DIAGNOSIS.md`'s "Notes for Phase 25/26 → Instrumentation caveats" section explicitly flags this ("⚠ Unverified caveat (24-REVIEW.md CR-01)") and instructs Phase 25's spec author to independently re-verify those 4 verdicts rather than encode them from the document alone. Per the phase context, this is judged as adequate self-documented transparency for a diagnosis spike, not a fatal gap — but it is not fully closed, so it routes to human verification rather than a silent VERIFIED. |
| 3 | Diagnosis captured as a reproducible scenario (steps + expected-vs-actual) that Phase 25's spec can encode directly | ✓ VERIFIED | Every one of the 9 stale rows in `24-DIAGNOSIS.md` has a `###` scenario block with numbered Steps to Reproduce (real selectors/actions: `page.getByRole('link', ...)`, `window.history.back()`, `simulateResume()`), an Expected vs Actual subsection with live-computed expected values, and an Evidence subsection quoting real network URLs/headers verbatim. |
| 4 | Fresh paths explicitly confirmed non-stale | ✓ VERIFIED | `## Confirmed-Fresh Paths` section lists all 7 Fresh cells (1-7), each with concrete evidence (mutated value, expected vs observed, RSC fetch URL). Includes the primary D-05 regression scenario (`/` and `/study` post-mutation-return) confirmed Fresh — the phase's key finding that narrows Phase 26's fix surface. |

**Score:** 4/4 ROADMAP success criteria have supporting artifacts and evidence; criterion 2 carries a self-documented, non-fatal reliability caveat on 4/16 cells routed to human verification rather than counted as an automatic pass.

### Required Artifacts (from PLAN frontmatter must_haves)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `scripts/diagnose-freshness.mts` | Playwright diagnostic script: guard, seed, build/start orchestration, cookie auth, smoke check, RSC-signature confirmation, 16-cell matrix | ✓ VERIFIED | 1167 lines. Contains `assertLocalDb()` (lines 42-49, hard-fails on `libsql://`, called at line 59 and again at line 291 pre-spawn), seed via `prisma.lesson.create`/`prisma.card.create` with nested `review: {...}` (lines 193-260), single `childEnv` object passed to both `execSync('npm run build', {env: childEnv})` (line 267) and `spawn('npm', [...'start'], {env: childEnv})` (line 292), `ks_auth` cookie injection via `computeAuthToken()`/`AUTH_COOKIE` (lines 303-311, 352, 737), `isRscRequest()` predicate (line 131, locked to `rsc: 1` header), `simulateResume()` (line 468, dual-property override), and the 16-cell loop (`for (const cfg of routeConfigs)` line 1012 + `for (const route of ['/','/study'])`/`for (const routeName of ['/cards','/habits'])` for the D-05/D-06 post-mutation legs). |
| `package.json` (playwright in devDependencies) | playwright ~1.61.x, raw library, no `@playwright/test` | ✓ VERIFIED | `npm ls playwright` confirmed by 24-01-SUMMARY.md and consistent with `package.json`/`package-lock.json` diffs in commit `2a8550d`. No `playwright.config.ts`, no `tests-e2e/` directory present in the repo. |
| `.planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md` | Phase deliverable: RSC signature, 16-row matrix, confirmed-fresh list, scenario blocks, handoff notes | ✓ VERIFIED | All 6 required sections present (`## RSC Request Signature`, `## Summary Matrix`, `## Confirmed-Fresh Paths`, `## Stale-Path Scenario Blocks`, `## Notes for Phase 25/26`, plus header). 16 verdict rows counted (`grep -cE "\|\s*(Fresh|Stale-RouterCache|Stale-ClientShell)\s*\|"` → 16). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Env override | `lib/prisma.js` / `lib/auth.js` dynamic import | `process.env.DATABASE_URL`/`AUTH_SECRET`/`APP_PASSWORD` set before `await import(...)` | ✓ WIRED | Env override block precedes `assertLocalDb()` call (line 59) and all dynamic imports occur after it (lines 193+, 303). |
| `npm run build` child | `npm run start` child | shared `childEnv` object | ✓ WIRED | Single `const childEnv = {...}` (line 261) referenced by both `execSync` (267) and `spawn` (292-293) calls — matches RESEARCH Pitfall 3 mitigation. |
| Script's `AUTH_SECRET` | Server child's `AUTH_SECRET` | same `childEnv`/`process.env` object | ✓ WIRED | `computeAuthToken()` is called from the throwaway-secret-holding process env, and the same `childEnv` (with the identical `AUTH_SECRET`) is passed to the server spawn — cookie validated per smoke-run evidence ("Landed on / (not redirected to /login)"). |
| `isRscRequest()` predicate | 16-cell classification | `classifyCell(fetches, domAfter, expected)` fed from `newDataFetchesForRoute()` filtering on `isRscRequest`/document fetches | ✓ WIRED | `classifyCell` (447-463) consumes `dataFetches` (878) derived from `newEntries` filtered against the locked predicate; used identically across all 16 cells. |
| CR-01 code-review finding | `24-DIAGNOSIS.md` caveat | Notes for Phase 25/26 → Instrumentation caveats | ✓ WIRED | Caveat text explicitly names `24-REVIEW.md CR-01`, describes the contradiction, and gives an actionable instruction ("Phase 25's E2E-06 spec author should independently re-verify the 4 affected back-forward verdicts... rather than encode them from this document alone"). Confirmed present in the file (lines 193 of `24-DIAGNOSIS.md`), added in commit `258ee2a` ("docs(24): flag CR-01 evidence-corruption caveat in diagnosis doc"). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| FRESH-01 | 24-01-PLAN.md, 24-02-PLAN.md | Diagnosis spike identifies, per route, which nav paths serve stale data on a production build, distinguishing Router Cache reuse from client-shell state non-resync | ✓ SATISFIED (with the human-verification caveat above) | `.planning/REQUIREMENTS.md` line 12 already marks FRESH-01 `[x]` and line 70 lists it "Phase 24 / Complete". `24-DIAGNOSIS.md` delivers the empirical matrix + binary attribution + scenario blocks required. No orphaned requirements — FRESH-01 is the only ID mapped to Phase 24 in both REQUIREMENTS.md and both plans' frontmatter. |

No orphaned requirements found — REQUIREMENTS.md's Phase 24 mapping (FRESH-01 only) matches both plans' `requirements:` frontmatter exactly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in `scripts/diagnose-freshness.mts` or `24-DIAGNOSIS.md` | — | Clean |

Zero production code changes confirmed: `git diff --stat` for the phase's commit range against `app/`, `components/`, `lib/`, `prisma/`, `middleware.ts` returns empty — matches the phase boundary ("no fix and no production code changes") and the plans' own verification requirement.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Hard-fail guard present | `grep -n "startsWith('libsql://')" scripts/diagnose-freshness.mts` | Match at line 43 | ✓ PASS |
| `assertLocalDb` runs twice (start + pre-spawn) | `grep -n "assertLocalDb(" scripts/diagnose-freshness.mts` | Lines 59, 291 (def at 42) | ✓ PASS |
| Full script re-run (build + boot + matrix) | Not re-run in this verification pass — would require ~10+ min of build/boot/16-cell browser automation | Not executed | ? SKIP — see note below |

**Note on Step 7b:** The full script was not re-executed during this verification pass. This is a deliberate scope decision, not an oversight: (a) both plan SUMMARYs document verified real runs with concrete output (SMOKE OK line, 16/16 cell markers, 7/5/4 verdict tally) matching what's captured verbatim in `24-DIAGNOSIS.md`; (b) re-running would mutate the isolated test DB and take several minutes for no incremental evidence beyond what's already static-verified above (code structure, wiring, artifact presence); (c) the code-level CR-01 caveat is precisely the kind of issue a re-run would need dedicated raw-log capture (not present in this repo state) to resolve — which is exactly why it's routed to human verification rather than silently re-asserted here.

### Human Verification Required

1. **Re-verify the 4 back-forward-cell verdicts flagged by CR-01**
   - **Test:** Either (a) re-run `scripts/diagnose-freshness.mts` with the `about:blank` recovery branch instrumented to log explicitly whether it fired for each of the 4 back-forward cells (`/`, `/study`, `/cards`, `/habits`), or (b) read `scripts/diagnose-freshness.mts:828-837` alongside a captured run log to determine whether `page.goto(targetUrl)` executed during any of those 4 cells.
   - **Expected:** Confirmation that the recovery branch did not fire (evidence stays clean, verdicts stand as documented) — or, if it did fire for any cell, a corrected verdict recomputed from the true pre-recovery fetch count.
   - **Why human:** This is a runtime/timing-dependent Chromium/CDP behavior that cannot be resolved by static code reading; the plan explicitly scoped out preserving the raw run log, and the user's own decision was to accept the caveat rather than fix the code, so the honest next step is exactly what `24-DIAGNOSIS.md` itself requests: independent re-verification by Phase 25's spec author before encoding those 4 verdicts as hard assertions.

### Gaps Summary

No blocking gaps. All 4 ROADMAP success criteria have concrete, verified supporting artifacts: a 16-row matrix on a confirmed production build, binary root-cause attribution for every stale row, spec-ready reproducible scenario blocks, and an explicit confirmed-fresh list. Zero production code was touched, matching the phase boundary. The one open item — CR-01's potential evidence contamination on 4 of 16 cells (all `back-forward`) — was investigated, found to be genuinely unresolvable via static analysis, and is already self-documented in `24-DIAGNOSIS.md` with a clear, actionable instruction for Phase 25. This is not treated as a FAILED must-have (the code is present, wired, and the limitation is transparently disclosed exactly as the phase's own context asked); it is routed to human verification because the correctness of those 4 specific verdicts is unproven either way, and Phase 25/26 should not treat this document as unconditionally authoritative for those 4 rows without that follow-up.

---

_Verified: 2026-07-11_
_Verifier: Claude (gsd-verifier)_
