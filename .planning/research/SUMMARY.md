# Project Research Summary

**Project:** Korean Study — v1.6 Freshness, Performance & E2E Testing
**Domain:** Client-side cache invalidation + E2E test infrastructure for a single-tenant Next.js 16 RSC-hydrated hobby app
**Researched:** 2026-07-10
**Confidence:** MEDIUM-HIGH (HIGH for architecture patterns grounded in this codebase; MEDIUM-HIGH for Next.js/Playwright behavior, cross-verified against official docs)

## Executive Summary

The v1.6 milestone targets stale-data-after-back-navigation, a regression whose *prior* fix attempt destroyed first-load performance ("all tabs take forever"). Research conclusively identifies this as a **client-side Router Cache problem, not a server caching issue** — every main page already declares `export const dynamic = 'force-dynamic'`, so the server render is always fresh. The correct fix is **mutation-boundary invalidation via `router.refresh()` plus gated prop-sync in the four client shells** — a surgical intervention that preserves the v1.2 RSC/DTO performance architecture rather than fighting it.

The app already has all required freshness infrastructure — `next@16.2.1` ships all three invalidation APIs (`router.refresh()`, `revalidatePath` from a Server Action, and the Client Router Cache itself) with zero new production dependencies. The only new dependencies are **dev-only E2E infrastructure**: `@playwright/test` (`^1.61.1`) and, optionally, `@playwright/mcp` for interactive Claude Code browser driving. Critically, this milestone should stand up Playwright infrastructure and a red "freshness" spec *before* the fix lands — the prior regression went undetected precisely because it shipped with no automated regression baseline to catch the first-paint slowdown.

**Key risk:** repeating the prior regression by skipping empirical diagnosis of which navigation paths are actually stale (Pitfall 1), or by missing that `router.refresh()` re-renders client shells *without remounting* them — so any shell doing `useState(initialProps)` will silently ignore the refreshed props unless each shell adopts an explicit, gated prop-sync strategy (Pitfall 2). Both are avoidable if the plan is explicit about diagnosis-first and per-shell sync strategy before implementation begins.

## Key Findings

### Recommended Stack

No new production dependencies are required for the freshness fix — every mechanism needed already ships in the installed `next@16.2.1`. The staleness is a *client-side Router Cache* behavior that `staleTimes` config cannot address (explicitly documented as exempt for back/forward navigation). For E2E, two new **dev-only** dependencies cover the full need.

**Core technologies:**
- `router.refresh()` (built into `next@16.2.1`) — re-fetches the current route's RSC payload and merges without remounting; use at same-route mutation boundaries (e.g. after a study session ends)
- `revalidatePath('/', 'layout')` called from a **Server Action** (not a Route Handler) — purges the entire Client Router Cache including back/forward entries; Route Handler calls to `revalidatePath` do NOT affect the client cache, a documented trap this app must avoid since it mutates exclusively via Route Handlers today
- `@playwright/test` (`^1.61.1`) — E2E test runner; `webServer` config can boot `next build && next start` automatically and override `DATABASE_URL` to an isolated `file:` SQLite DB, keeping E2E runs off production Turso
- `@playwright/mcp` (`0.0.78`, optional, run via `npx`) — Microsoft's official MCP server giving Claude Code interactive accessibility-tree browser control against the running dev server, complementing the deterministic headless suite

### Expected Features

**Must have (table stakes for v1.6):**
- Diagnosis spike reproducing staleness against a production build (`next build && next start`, never `next dev` — dev mode never caches)
- Prop→state re-sync in all four `*Client.tsx` shells, gated so an active study session or open editor sheet is never clobbered mid-interaction
- `router.refresh()` fired at real mutation boundaries only (session-end, sync-completion, card CRUD) — never per-grade, to avoid reintroducing the v1.2-eliminated grade-button jitter
- Playwright E2E infrastructure: `playwright.config.ts`, prod-mode `webServer`, auth `setup` project (one API POST to `/api/login` → `storageState`), isolated `file:./e2e.db` test DB
- Smoke spec + study-flow spec + a dedicated freshness-regression spec that encodes the bug as a failing test until the fix lands

**Should have (v1.6.x):** Cards CRUD E2E spec, informational performance timings (behavioral proxies, generous budgets — not strict CI wall-clock gates), an MCP-driven exploratory workflow documented for future use.

**Defer (v2+):** WebKit/Firefox projects (Chromium-only is sufficient for a personal app), visual regression testing, cross-browser matrix, E2E cloud services (no CI budget need for a single-tenant hobby app).

### Architecture Approach

Two complementary mechanisms close the gap without touching the server-fetch architecture: a lightweight **FreshnessWatcher** component (mirrors the existing `ThemeWatcher` pattern) that listens for `pageshow` (with `event.persisted`) and `visibilitychange` and calls `router.refresh()` on resume/back-forward restore; and **gated render-phase prop-sync** inside each client shell — `HomeClient`/`HabitsClient` can re-derive from fresh props directly, while `CardsClient` only re-syncs when no editor sheet is open and `StudyClient` only re-syncs when `phase === 'select-mode'` (never mid-session).

**Major components:**
1. `components/FreshnessWatcher.tsx` (new) — mounted once in `app/layout.tsx`, triggers `router.refresh()` on back/forward restore and tab-resume
2. Gated prop-sync logic in the four existing `*Client.tsx` shells (modified, not rewritten) — reconciles refreshed server props into client state without clobbering in-flight interaction
3. `playwright.config.ts` + `e2e/` directory (new) — webServer lifecycle, auth setup project, seed script, specs
4. Mutation call sites (study session end, sync completion, card CRUD) — each fires `router.refresh()` at the right boundary, not on every write

### Critical Pitfalls

1. **Diagnosing the wrong cache layer before treating it** — reaching for `force-dynamic` or a Route-Handler `revalidatePath` call feels like progress but doesn't fix client-side back/forward staleness and does slow every request. Avoid by writing the diagnosis as a failing Playwright spec against a *production build* first, before touching any fix code.
2. **`useState(initialProps)` shells silently ignoring refreshed props** — `router.refresh()` re-renders without remounting, so a shell that only reads props once on mount never sees the update. Avoid by finalizing an explicit, documented prop-sync strategy per shell in the plan before implementation.
3. **Refreshing at the wrong moment** — per-grade or mid-session refreshes reintroduce jitter and can race the optimistic FSRS queue. Avoid by refreshing only at session/sync completion boundaries, never inside the active study loop.
4. **Regressing first-paint performance (the exact prior incident)** — any fix that reintroduces client-side fetch-on-mount or forces broader dynamic rendering undoes the entire v1.2 win. Avoid by having the E2E baseline (first-load content assertion + skeleton-only client nav) in place *before* the fix lands, so a regression is caught mechanically, not by feel.
5. **E2E tests running against production Turso** — CRUD/study specs would corrupt real FSRS history; sync specs would hit real Claude/Google APIs. Avoid with a host guard in Playwright global setup that fails fast on any `libsql://` URL, and inject `DATABASE_URL=file:./e2e.db` via `webServer.env`.

## Implications for Roadmap

Suggested five-phase structure, ordered by hard dependencies (diagnosis and E2E infrastructure must exist before the fix can be built and validated without repeating the prior regression):

### Phase 1: Diagnosis Spike
**Rationale:** The prior fix attempt failed because nobody empirically confirmed which navigation paths were actually stale before choosing a mechanism. Research strongly suspects back/forward restore and PWA resume, not plain `<Link>` navigation (already fresh via `staleTimes.dynamic = 0`), but this must be verified against a real production build, not assumed.
**Delivers:** A written diagnosis of exactly which paths are stale and why, encoded as a failing test scenario.
**Addresses:** The root-cause requirement underlying the whole milestone.
**Avoids:** Pitfall 1 (treating the wrong cache layer).

### Phase 2: E2E Infrastructure
**Rationale:** Needs to exist before the fix so the fix can be validated by a real regression test, and so the first-load performance baseline is protected mechanically rather than by feel.
**Delivers:** `playwright.config.ts`, prod-mode `webServer`, auth setup project, isolated `file:./e2e.db` test DB with host guard, Vitest/Playwright test-discovery separation, a passing smoke spec.
**Uses:** `@playwright/test`, Chromium only.
**Implements:** The `e2e/` directory and seed script.

### Phase 3: Freshness Fix
**Rationale:** Only attempted once diagnosis (Phase 1) and a validating test harness (Phase 2) exist, so the fix can't silently regress performance again.
**Delivers:** `FreshnessWatcher` component + per-shell gated prop-sync + `router.refresh()` calls at the correct mutation boundaries. Phase 2's freshness-regression spec turns from red to green; the first-load baseline spec stays green throughout.
**Implements:** The architecture's two-part invalidation approach.

### Phase 4: E2E Coverage Expansion
**Rationale:** With infrastructure and the fix both proven, broaden coverage to the other explicitly-requested flows.
**Delivers:** Cards CRUD spec, full study-session flow spec, trace-on-failure debugging docs.

### Phase 5: Performance & MCP Polish
**Rationale:** Non-blocking follow-on once functional correctness is locked in.
**Delivers:** Informational performance timings (behavioral proxies, generous budgets), `@playwright/mcp` workflow documentation for future agent-driven exploratory QA.

### Phase Ordering Rationale

- Diagnosis before fix: prevents repeating the exact regression this milestone exists to fix.
- E2E infrastructure before the fix (not after): the freshness-regression spec needs to exist as a red test the fix turns green, and the first-load performance spec needs to exist as a guard rail the fix must not break.
- Coverage expansion and perf polish are explicitly non-blocking follow-ons — they don't gate the core deliverable.

### Research Flags

Phases likely needing deeper research/verification during planning:
- **Phase 1 (Diagnosis):** Requires empirical verification against a real production build — which stale paths actually exist (back/forward vs. PWA resume vs. something else) can only be confirmed by testing, not inferred from docs alone.
- **Phase 3 (Fix):** The per-shell prop-sync strategy (which of the four shells need what gating condition) must be finalized explicitly in the plan before coding — this is the highest-risk implementation detail in the milestone.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 2 (E2E Infrastructure):** Playwright setup with Next.js is officially documented and this repo already has a precedent pattern (Phase-22's dry-run/host-guard script) to model the test-DB host guard on.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified directly against the npm registry and installed `package.json`; all freshness APIs confirmed already present in `next@16.2.1` |
| Features | MEDIUM-HIGH | Next.js and Playwright official docs cross-verified with no conflicts; some sources are practitioner blogs (LOW individually) but cross-consistent |
| Architecture | HIGH | Patterns grounded directly in this codebase (`ThemeWatcher` precedent, existing shell structure, existing DTO boundary) |
| Pitfalls | MEDIUM-HIGH | The core pitfall (regressing v1.2 performance) is grounded in a real, user-reported prior incident, not a hypothetical; cache-layer mechanics cross-checked against official docs and GitHub issues |

**Overall confidence:** MEDIUM-HIGH — ready to plan and execute. Two items need resolution during phase planning rather than now: the empirical diagnosis (Phase 1 output) and the finalized per-shell prop-sync strategy (Phase 3 input).

### Gaps to Address

- Which of the four routes actually exhibit staleness, and via which exact mechanism (back/forward cache vs. state non-resync vs. both) — resolved by Phase 1's diagnosis spike, not assumable up front.
- Whether `StudyClient`'s existing lesson-range-filter re-fetch could double-fetch against a route-level `router.refresh()` — flag for the Phase 3 plan to check explicitly.
- Whether the test DB seed should reuse `prisma/schema.prisma` DDL generation or a plain `prisma db push` against a `file:` URL — either is viable; decide during Phase 2 planning.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `package.json`, `app/*/page.tsx` (confirms `force-dynamic` already present), `components/*Client.tsx` shells, `middleware.ts`, `next.config.ts`
- npm registry direct query: `@playwright/test@1.61.1`, `@playwright/mcp@0.0.78`, `next@16.2.10` latest patch

### Secondary (MEDIUM confidence)
- Next.js official docs (v16.2.10): `staleTimes`, glossary (Client Cache / back-forward behavior), `useRouter`/`router.refresh`, `revalidatePath` (Server Action vs. Route Handler distinction), caching guide
- Playwright official docs: `webServer`, authentication (`storageState`/setup projects), parallelism/worker isolation
- `vercel/next.js` GitHub issues #69979, #52370/#54075, #43650/#44056 — real-world reports of the exact stale-after-navigation behavior and `router.refresh()` edge cases
- Project memory: `.planning/PROJECT.md` (v1.2 RSC/DTO decisions, UX-01 optimistic grading), `CLAUDE.md` (Turso `file:` vs `libsql://` DDL constraint, dev-vs-build RSC testing gotcha, fire-and-forget review-save pattern)

### Tertiary (LOW confidence)
- Practitioner blogs/guides: Checkly (perf budgets/medians), Builder.io (Playwright MCP + Claude Code workflow), joulev.dev (Router Cache behavior explainer), various Next.js+Prisma E2E dev.to/Makerkit guides — individually low-tier but cross-consistent with each other and with the official docs above

---
*Research completed: 2026-07-10*
*Ready for roadmap: yes*
