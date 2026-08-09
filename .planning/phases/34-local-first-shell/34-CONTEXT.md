# Phase 34: Local-First Shell - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Stop first paint on Home/Study/Cards/Habits from depending on the network at all:

1. **Cache each route's DTO payload in IndexedDB** (`lib/local-cache.ts`, new), keyed by route + build ID.
2. **On mount, render the cached payload immediately** if one exists — no blocking skeleton when cached data is available.
3. **Revalidate in the background** against `/api/version`; reconcile silently if nothing changed, swap in fresh data if it did.
4. **Write-through on device-originated writes** (reviews, card edits, settings) — the cache updates in the same code path as the existing optimistic UI update, never trailing behind a stale read.
5. **Pull-to-refresh escape hatch** on all four routes, bypassing both the cache and the version check entirely.

**Not in scope:** the offline review queue and service worker precaching (Phase 35 — OFFLINE-01/02/03). This phase is about *speed via caching*, not about taking new reviews with no network. A user opening the app fully offline sees last-known data (LOCAL-05) but is not expected to be able to complete a graded study session offline yet — that's Phase 35.

</domain>

<decisions>
## Implementation Decisions

### Non-negotiable staleness rules (carried in, not discussed — already locked)
- **D-00: The 5 staleness rules from `lag_remediation_plan.md` §P3.6 are binding design constraints, not suggestions** (also recorded in `STATE.md` Blockers/Concerns for Phase 34): (1) classify writes by origin — device-originated writes (reviews/edits/settings) put the phone ahead of the cache via the same code path as the optimistic UI update; the only server-originated write is the daily cron; (2) version-check, never TTL — compare against `/api/version`, refetch only on change; (3) **replace layers, don't add one** — once IndexedDB is the client's source of truth, first paint stops depending on RSC-payload freshness, which is exactly the class of bug `FreshnessWatcher`'s JSON backstop exists to work around. **If this phase's cache doesn't let the backstop shrink, it has been implemented wrong.** (4) key the cache by build ID, so a DTO shape change becomes a cold start, not a render crash; (5) ship pull-to-refresh as the manual escape hatch. — **Reversibility:** one-way for rule 3's relationship to `FreshnessWatcher` — narrowing the backstop is a cross-cutting change touching `components/FreshnessWatcher.tsx`'s existing route-payload fetch logic (Phase 33 territory); getting the sequencing wrong there risks resurrecting the exact Next.js 16.2.1 Suspense/Segment-Cache flake the backstop was built to guard.
  - **Why:** the source design doc frames this explicitly as the answer to "doesn't this reintroduce the staleness bug `force-dynamic` was added to fix?" — these rules are that answer, already reasoned through before this milestone started.
- **D-00b: Do NOT delete `FreshnessWatcher`.** Narrow its JSON backstop (per rule 3 above) — it still guards a real, unfixed Next.js bug.
- **D-00c: No `prisma/schema.prisma` changes.** The cache lives entirely client-side in IndexedDB; nothing server-side changes shape.

### Background-refresh affordance
- **D-01: A small, quiet indicator (not a blocking skeleton, not a toast) shows only while a background revalidation is in flight, then disappears.** Content itself doesn't flash or shift — if the check finds new data, it silently swaps in; if not, the indicator just goes away. — **Reversibility:** reversible — purely visual, no data-shape implications.
  - **Exact placement/wording is UI-phase territory** (this phase has `UI hint: yes`) — visual detail belongs to `/gsd-ui-phase 34`, not this discussion. What's locked here is the *behavior*: subtle, transient, never blocking.

### Offline signal
- **D-02: A small persistent indicator appears while the device has no network connection**, distinguishing "you're looking at saved data" from a normal cached-but-online view. Disappears the moment connectivity returns. — **Reversibility:** reversible — visual/behavioral, uses the standard `navigator.onLine` + `online`/`offline` event pattern (no new dependency).
  - This is distinct from D-01 (background-refresh-in-flight) — a device can be online with a background check running, or offline with no check possible at all. Both states need their own signal; they should not collapse into one.

### Pull-to-refresh scope and semantics
- **D-03: Pull-to-refresh extends to all 4 routes** (Home already has it; Study/Cards/Habits currently have none). — **Reversibility:** reversible.
- **D-04: The four routes do NOT all mean the same thing when pulled.** Home's existing pull-to-refresh keeps its current behavior — trigger a full Google Doc sync (`POST /api/sync`, "Pull to sync" copy), which as a side effect must now also write the freshly-fetched data through to the cache and bypass the version check. Study/Cards/Habits get a lighter, route-local action — "Pull to refresh": bypass that route's cache + version check and re-fetch only that route's own data, with **no** Google Doc sync triggered. — **Reversibility:** costly — inverting this later (e.g. making every route trigger a full doc sync) means re-plumbing whatever escape-hatch function each `*Client.tsx` calls; keep the two behaviors (`handleSync` vs. a new route-local `handleRefresh`) as clearly separate functions from the start rather than one parameterized function, so this stays cheap to keep separate.
  - **Why:** a doc sync is a slower, heavier, semantically different action (pulls new lessons from an external source) than "this screen looks wrong, force it to refetch." Conflating them on Study/Cards/Habits would make the escape hatch slower than it needs to be and imply behavior (new lessons appearing) that isn't what the gesture is actually fixing.
  - Copy: Home keeps "Pull to sync" / "Syncing…"; Study/Cards/Habits use "Pull to refresh" / "Refreshing…" (exact wording still open to `/gsd-ui-phase 34` polish, but the two must read as different actions).

### Cards offline cache depth
- **D-05: The Cards cache accumulates whatever was loaded during the session (via Phase 31's incremental scroll-loading), not the full ~1056-card deck.** Offline/cached browsing shows exactly what had already been paginated in before going offline or before the cache was last written — no separate "cache everything" prefetch pass. — **Reversibility:** reversible — this is a scope choice about what gets written to IndexedDB, not a schema/architecture commitment; a later phase could add full-deck prefetching without restructuring the cache.
  - **Why:** matches the existing Phase 31 incremental-loading model with zero extra storage cost or new fetch behavior; solving "browse the entire deck offline" is closer to Phase 35's offline-usability territory than this phase's "make repeat visits instant" goal.

### Claude's Discretion
- Exact pixel/placement/copy detail for both the background-refresh indicator (D-01) and the offline indicator (D-02) — visual detail belongs to `/gsd-ui-phase 34`.
- How `FreshnessWatcher`'s backstop should shrink in response to this phase's cache (D-00 rule 3) — this is a technical integration question for research to resolve against the actual current `components/FreshnessWatcher.tsx` implementation, not a product decision.
- IndexedDB library choice (raw `indexedDB` API vs. a small wrapper like `idb`) — no such dependency exists in `package.json` today; this is architecture research's call, weighed against the project's general (not absolute) preference for zero new dependencies where reasonable.
- Exact cache eviction/size-bound policy for the Cards accumulation (D-05) if IndexedDB storage limits ever become a real concern — not discussed as a user preference; treat as an implementation default unless it surfaces as a real problem.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (locked)
- `.planning/REQUIREMENTS.md` §Local-First Shell (P3.6) — LOCAL-01 through LOCAL-05 full requirement text
- `.planning/ROADMAP.md` §Phase 34 — Goal, 5 Success Criteria, `Depends on: Phase 33 (needs /api/version), Phase 30`, `UI hint: yes`
- `.planning/ROADMAP.md` §v1.8 milestone-wide constraints — Tailwind dark-value mirroring rule, `react-hooks/purity`, no schema changes through Phase 35, iOS/WebKit-only target with no Background Sync API, do-not-delete-`FreshnessWatcher`

### Source design doc (load-bearing — origin of the staleness rules)
- `/Users/main/Documents/travel-fun/lag_remediation_plan.md` §P3.6 "Local-first shell" (lines ~298–369) — the stale-while-revalidate pattern, the 5 staleness rules (D-00 above), the acceptance criteria this phase's success criteria were adapted from, and the explicit file list (`lib/local-cache.ts` + the four `*Client.tsx` entry points). **Outside this repo** — read it directly before planning; it is more detailed than REQUIREMENTS.md/ROADMAP.md on the *why* behind the design and should be treated as authoritative for architecture intent, same standing as a research doc.

### State / accumulated decisions
- `.planning/STATE.md` §Blockers/Concerns — the Phase 34/35 entries: do-not-delete-`FreshnessWatcher`, no Background Sync API, "local-first reintroduces the staleness class... non-negotiable design constraints"
- `.planning/STATE.md` §Accumulated Context → Decisions — why P3.6/P3.7 are kept as separate phases (34 = speed via cache, 35 = offline usability)

### Project conventions
- `CLAUDE.md` §RSC server hydration + DTO pattern — the `app/*/page.tsx` thin-RSC / `*Client.tsx` shell / DTO-boundary pattern this phase's cache sits underneath, not instead of
- `CLAUDE.md` §Gotchas/conventions — `react-hooks/purity` (no `Date.now()`/`Math.random()` in render — relevant for any cache-timestamp or build-ID read)
- `CLAUDE.md` on `components/FreshnessWatcher.tsx` / `FreshPayloadContext` — the existing JSON backstop this phase's cache must let shrink (D-00 rule 3), and the existing per-route backstop-fetch pattern (`fetchRoutePayload`) that a route-local pull-to-refresh (D-04) should likely reuse or sit beside
- `CLAUDE.md` on `lib/usePullToRefresh.ts` — the existing touch-gesture hook (`PULL_THRESHOLD`, resistance curve, top-of-scroll gating) this phase reuses for Study/Cards/Habits (D-03), not reimplements
- Phase 32's `32-CONTEXT.md` — precedent for how this project handles narrow, research-flagged technical forks (D-00's Claude's Discretion items follow the same pattern: locked product behavior, open technical means)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/usePullToRefresh.ts` — existing touch pull-to-refresh hook (engages only at scroll-top, with resistance, `PULL_THRESHOLD = 70`). Currently mounted only in `components/HomeClient.tsx`. D-03 needs it mounted in `StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx` too, each wired to its own route-local refresh function (D-04) rather than `handleSync`.
- `components/HomeClient.tsx`'s `handleSync` (lines ~149+) — the existing Home pull-to-refresh handler: `POST /api/sync`, then `loadStats()`/`loadActivity()` refetch. Keeps its current behavior per D-04, but must additionally write fresh data through to the new cache and bypass the version check as part of this phase's wiring.
- `components/FreshnessWatcher.tsx` — owns `FreshPayloadContext`/`useFreshPayload()` and the existing per-route `fetchRoutePayload()` JSON backstop fetches (`/api/cards/due` for `/study`, etc.). This is the mechanism D-00 rule 3 says must shrink once the new cache exists — read this file in full before designing the cache/backstop interaction.
- `app/api/version/route.ts` — `GET /api/version` already exists (shipped Phase 33), returns `{ version }` from `getDataVersion()`. This phase's version-check (D-00 rule 2, LOCAL-02) reads this directly.
- `lib/dto.ts` — `CardDTO`, `CardsPageDTO`, `StatsDTO`, `ActivityDTO`, `LessonDTO` etc. — the exact payload shapes that get cached; the build-ID cache key (D-00 rule 4) exists specifically to guard against these shapes changing between deploys.
- Toast pattern (`components/Toast.tsx`, `role="status" aria-live="polite"`) — available if either the D-01 or D-02 indicator ends up needing an announced (not just visual) state, though the discussed intent for both is a persistent small marker, not a transient toast.

### Established Patterns
- RSC + client-shell + DTO pattern: `app/*/page.tsx` (thin async RSC) → `*Client.tsx` (`'use client'`, owns state). This phase's cache-read-on-mount logic belongs in each `*Client.tsx`, reading from `lib/local-cache.ts`, not in the RSC page.
- Gated prop adoption (`prevInitialX`/`prevFreshX` pattern already in `CardsClient.tsx`/`StudyClient.tsx`/`HabitsClient.tsx` from the Phase 26 freshness fix) — never clobber an active study session or open editor sheet. Whatever mounts the IndexedDB-cache-read must respect the same guards; it is not a green field.
- `react-hooks/purity`: no `Date.now()`/`new Date()`/`Math.random()` in render — any cache-timestamp comparison, build-ID read, or `navigator.onLine` check belongs in an effect or event handler.

### Integration Points
- The 4 `*Client.tsx` entry points named explicitly in the source design doc: `HomeClient.tsx`, `StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx`.
- `lib/sync.ts:runSync()` and `lib/relink-dependencies.ts:relinkAllDependencies()` — the two places `dataVersion` is bumped server-side (Phase 33); this phase's version-check reads that counter but does not add new bump sites.
- `/api/stats`, `/api/activity`, `/api/cards/due`, `/api/cards` (paginated) — the existing per-route fetch endpoints whose responses become what's written to and read from the new IndexedDB cache.

</code_context>

<specifics>
## Specific Ideas

No additional specific references beyond the decisions above — the source design doc (`lag_remediation_plan.md` §P3.6) already specifies the architecture and staleness rules in detail; discussion focused on the genuinely open product-feel questions it leaves unresolved (background-refresh affordance, offline signal, pull-to-refresh scope and semantics, Cards offline depth).

</specifics>

<deferred>
## Deferred Ideas

- **Full-deck offline prefetch for Cards** (caching all ~1056 cards regardless of what's been scrolled) — considered and explicitly deferred in favor of D-05's session-accumulated scope; would belong with Phase 35's offline-usability work if ever wanted.
- **Offline review-taking / study sessions with no network** — explicitly Phase 35 (OFFLINE-01/02/03), not this phase. This phase only guarantees *viewing* last-known data offline (LOCAL-05), not completing a graded session offline.

</deferred>

---

*Phase: 34-local-first-shell*
*Context gathered: 2026-08-09*
