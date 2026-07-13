---
phase: quick-260713-imz
plan: 01
subsystem: performance
tags: [prisma, turso, libsql, nextjs, rsc, promise-allsettled, indexing]

requires: []
provides:
  - Two-phase pool fetch in getStudyCards() (lightweight selection query + narrow full re-fetch)
  - Shared select-trimmed lib/cards-list.ts query for /cards + GET /api/cards
  - Batched Setting lookups (getLayoutSettings/getAllSettings/getActivitySettings) via getSettings(keys)
  - /wrapped and /settings migrated to the RSC hydration + *Client.tsx pattern
  - Sentence.cardId index on live Turso
  - Batched lesson-hash lookup and dependency-edge writes in the sync path
affects: [study, cards, settings, wrapped, sync, dashboard]

tech-stack:
  added: []
  patterns:
    - "Two-phase fetch: cheap selection query to pick/order rows, narrow full re-fetch by id for only the chosen set"
    - "Batched Setting lookup: getSettings(keys) findMany-in + per-setting pure parse* functions shared by standalone getters and batched call sites"
    - "Batch-diff-then-createMany for CardDependency edges (existing relink-dependencies.ts pattern reused in the per-lesson sync path)"

key-files:
  created:
    - lib/cards-list.ts
    - components/WrappedClient.tsx
    - components/SettingsClient.tsx
    - scripts/apply-sentence-index-ddl.mjs
  modified:
    - lib/study-cards.ts
    - tests/study-cards.test.ts
    - app/cards/page.tsx
    - app/api/cards/route.ts
    - lib/settings.ts
    - app/layout.tsx
    - app/api/settings/route.ts
    - lib/dashboard.ts
    - app/wrapped/page.tsx
    - app/settings/page.tsx
    - prisma/schema.prisma
    - lib/sync.ts
    - lib/relink-dependencies.ts

key-decisions:
  - "getStudyCards Phase A batches sessionSize + a lightweight pool query (id/nextReview/orderIndex only) + edges + knownLemmas via Promise.allSettled; Phase B re-fetches only the chosen/ordered ids with the full include shape, re-ordered via a Map since findMany with `in` doesn't preserve order"
  - "lib/cards-list.ts select drops only the 3 deprecated cloze columns (not part of CardDTO); distractors is kept in the select because CardDTO requires it and StudySession's multiple-choice mode consumes it"
  - "lib/settings.ts: each getter's default/validation logic extracted into a private parse* function shared by both the standalone getter (own findUnique) and the new batched getSettings(keys) call sites, so the two paths can never drift on defaults"
  - "Task 6 DDL followed the CLAUDE.md Turso procedure exactly: schema edit -> prisma generate -> migrate diff --to-schema -> hand-picked single CREATE INDEX IF NOT EXISTS statement -> ran once against live Turso -> verified via PRAGMA index_list"
  - "Task 7(b): CardDependency edge persistence in the per-lesson sync loop switched from N per-edge upserts to one findMany (existing edges among involved cardIds) + one createMany of only-missing edges, reusing the batch-diff pattern lib/relink-dependencies.ts already used for the whole-deck relink; a batch failure (e.g. concurrent-sync race) is non-fatal and self-heals via the end-of-sync relinkAllDependencies pass"
  - "Task 8 (optional) skipped in full: all three sub-items carry real behavioral/efficiency risk on single-row mutations for marginal gain — see Deviations for the per-item analysis"
  - "Task 9 (optional): no code change. FreshnessWatcher already has a 300ms coalesce debounce and its /api/cards re-fetch is materially cheaper after Task 2's select trim; GlossProvider's preload effect already only fires once per real page load (root layout persists across client-side navigation in the App Router, so `useEffect(..., [])` does not re-run per route change) — a sessionStorage guard would add no benefit for navigation and would incorrectly suppress a legitimate full-page-reload preload within the same tab session"

requirements-completed: [PERF-PASS-01]

duration: ~75min
completed: 2026-07-13
status: complete
---

# Quick Task 260713-imz: Performance Pass — /study + App-wide Page Loads Summary

**Cut serial Turso round-trips on /study (two-phase pool fetch), /cards (shared select-trimmed query), every-route layout settings (batched findMany), /wrapped + /settings (migrated to RSC hydration), and the sync path (batched lesson-hash + dependency-edge writes), plus added the missing Sentence.cardId index on the live Turso DB.**

## Performance

- **Duration:** ~75 min
- **Tasks:** 7 of 9 completed (Tasks 8 and 9 explicitly optional/best-effort; both assessed and skipped with documented rationale)
- **Files modified:** 17 (across 7 commits)

## Accomplishments

1. **`getStudyCards()` two-phase fetch (item 1, highest priority)** — Phase A batches `sessionSize` + a lightweight pool query (`select: id/review.nextReview/lesson.orderIndex` only, not the full `include`) + prerequisite edges + known-lemmas via a single `Promise.allSettled` (edges no longer waits on the pool for no reason). Phase B fetches the full `review`/`lesson`/`sentences` payload only for the ~sessionSize chosen/ordered cards, not the whole 1000-row safety-cap pool, re-mapped into session order via a `Map` (since `findMany` with `id: { in: ... }` does not preserve input order). Output DTO shape and session ordering are byte-identical to before.
2. **`lib/cards-list.ts`** — new shared select-trimmed query used by both the `/cards` RSC page and `GET /api/cards`, replacing two duplicated unbounded `findMany({ include })` calls. The select drops the three deprecated cloze columns (not part of `CardDTO`); `distractors` stays since `CardDTO` requires it. No pagination/take cap added (deliberately out of scope).
3. **Batched Setting lookups** — `getSettings(keys)` does one `prisma.setting.findMany({ where: { key: { in } } })` instead of N `findUnique` round-trips. Each getter's default/validation logic was extracted into a shared pure `parse*` function so the standalone getters and the new batched call sites (`getLayoutSettings`, `getAllSettings`, `getActivitySettings`) can never drift on defaults. Wired into `app/layout.tsx` (4 keys → 1 query, was 4), `GET /api/settings` (8 keys → 1 query, was 8), and `lib/dashboard.ts`'s `getActivityData` (2 keys → 1 query, was 2).
4. **`/wrapped` and `/settings` RSC hydration migration** — both pages converted from client-only `useEffect`-fetch shells to the established thin-async-RSC + `*Client.tsx` pattern (`WrappedClient.tsx`, `SettingsClient.tsx`), eliminating the extra client round-trip and loading flash on first paint. `/settings`' theme control stays strictly client-only (localStorage), never sourced from server props, per the project's theming architecture.
5. **`Sentence.cardId` index** — added to `prisma/schema.prisma` and applied to the live production Turso DB via `scripts/apply-sentence-index-ddl.mjs` (a single `CREATE INDEX IF NOT EXISTS` statement, hand-picked from `prisma migrate diff` output — no destructive DDL). Verified present via `PRAGMA index_list('Sentence')`.
6. **Sync path batching** — lesson dedup now hashes every lesson up front and does one `findMany({ contentHash: { in } })` instead of a per-lesson `findUnique` inside a loop. Per-lesson `CardDependency` edge persistence switched from N per-edge `upsert` calls to one `findMany` (existing edges among involved cardIds) + one `createMany` of only the missing edges — the same batch-diff pattern `lib/relink-dependencies.ts` already used for the whole-deck relink pass. `lib/relink-dependencies.ts`'s own two independent reads now run via `Promise.all`. Return shapes and the existing `Promise.allSettled` per-lesson failure handling are unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: `lib/study-cards.ts` two-phase pool fetch** — `c4fb5b6` (perf)
2. **Task 2: `lib/cards-list.ts` shared select-trimmed cards query** — `ca6caff` (perf)
3. **Task 3: Batch Setting lookups** — `78664d6` (perf)
4. **Task 4: `/wrapped` RSC hydration migration** — `5e2eb9f` (perf)
5. **Task 5: `/settings` RSC hydration migration** — `c6e7779` (perf)
6. **Task 6: `Sentence.cardId` index (Turso DDL applied)** — `b0219b6` (perf)
7. **Task 7: Sync path batching** — `05d4b55` (perf)

Tasks 8 and 9 (both explicitly optional/best-effort) were assessed and skipped — see Deviations below.

## Files Created/Modified

- `lib/study-cards.ts` — two-phase fetch (Phase A lightweight batch, Phase B full re-fetch for chosen ids)
- `tests/study-cards.test.ts` — mocks updated for the new three-call `prisma.card.findMany` shape (light pool / knownLemmas / full re-fetch), distinguished by `args.select` shape
- `lib/cards-list.ts` — new: `getCardsList()`, select-trimmed shared cards query
- `app/cards/page.tsx` — delegates to `getCardsList()`
- `app/api/cards/route.ts` — GET delegates to `getCardsList()`
- `lib/settings.ts` — `getSettings(keys)`, `SETTING_KEYS`, `parse*` functions, `getLayoutSettings`/`getAllSettings`/`getActivitySettings`
- `app/layout.tsx` — uses `getLayoutSettings()` (1 query instead of 4)
- `app/api/settings/route.ts` — GET uses `getAllSettings()` (1 query instead of 8)
- `lib/dashboard.ts` — `getActivityData()` uses `getActivitySettings()` (1 query instead of 2)
- `app/wrapped/page.tsx` — thin async RSC, renders `WrappedClient`
- `components/WrappedClient.tsx` — new: client shell, existing `/wrapped` UI moved verbatim
- `app/settings/page.tsx` — thin async RSC, renders `SettingsClient`
- `components/SettingsClient.tsx` — new: client shell, existing `/settings` UI moved verbatim; theme stays client-only
- `prisma/schema.prisma` — `Sentence` model gains `@@index([cardId])`
- `scripts/apply-sentence-index-ddl.mjs` — new: one-off DDL script (already run against live Turso)
- `lib/sync.ts` — batched lesson-hash lookup; batched per-lesson dependency-edge writes
- `lib/relink-dependencies.ts` — the two independent reads run via `Promise.all`

## Decisions Made

See `key-decisions` in the frontmatter above for the full list. Highlights:
- Phase B of `getStudyCards()` re-fetches by id and restores order via a `Map`, since `findMany({ id: { in } })` does not preserve input order.
- `lib/cards-list.ts` keeps `distractors` in its select (required by `CardDTO`, consumed by `StudySession`'s multiple-choice mode) — only the three unused deprecated cloze columns were dropped.
- The Task 6 Turso DDL procedure was followed exactly per `CLAUDE.md`: schema edit → `prisma generate` → `prisma migrate diff --to-schema` → hand-picked single `CREATE INDEX IF NOT EXISTS` → ran once → verified via `PRAGMA index_list`.
- Task 7(b)'s batched edge write accepts the same non-fatal-batch-failure/self-healing-via-relink tradeoff `lib/relink-dependencies.ts` already documents and accepts for its own `createMany` call — consistent with the established risk model in this codebase, not a new one.

## Deviations from Plan

### Tasks 8 and 9 — assessed, not implemented (as explicitly permitted: "optional/best-effort")

**Task 8 — Minor API mutation round-trip fixes: skipped in full.**

- **(a) `app/api/review/undo/route.ts`** — the current `findUnique`-then-`update` uses `prevState.field ?? exists.field` per-field fallback specifically to defend against a caller sending an explicit `null` for a non-nullable numeric column (documented inline via the WR-01/WR-02 fix history). Collapsing to a single `update` call relying on Prisma's "`undefined` field = don't touch that column" semantics is *almost* equivalent (an omitted key already behaves identically), but a client sending an explicit `null` for e.g. `state` would go from "gracefully falls back to the existing value" to "Prisma throws a validation error on a non-nullable Int column" — a real regression in the exact defensive behavior this route was hardened for. Skipped as not safely equivalent.
- **(b) `app/api/cards/[id]/route.ts`** — the plan's own carve-out ("fold the refetch into the transaction ONLY IF the array-form transaction supports returning the row post-mutation") does not hold here: `cardUpdate` is one array element and `sentenceOps` (delete + recreate) are later elements in the same array-form `$transaction([...])`. Each array-form operation's own `include`/`select` reflects DB state at the moment *that* operation runs, not after later operations in the same array — so including `sentences` on `cardUpdate` would return the *pre-delete* sentences whenever the payload replaces them, not the fresh set the client needs. Left as-is per the plan's own conditional.
- **(c) `app/api/gloss/route.ts`** — the three lookups (corpus, stem, cache) are independent of each other, but they are NOT independent of the *documented* short-circuit design: the corpus lookup is explicitly commented "instant" and is the common-case hot path. Parallelizing all three via `Promise.all` would remove that short-circuit and always fire the stem + cache queries even on a corpus hit — trading a marginal latency win on the uncommon cache-miss path for an extra query on every common-case request. Not a clear net win; left as-is.

**Task 9 — Client polish: no code change, assessment recorded.**

- **(a) `FreshnessWatcher.tsx`** — its `/api/cards` re-fetch is materially cheaper after Task 2's select trim (fewer columns per row). It already has a 300ms `COALESCE_MS` debounce collapsing rapid event bursts into a single refresh; no additional trivially-safe debounce presented itself without risking the carefully-tuned bfcache/visibilitychange/popstate coordination already in place. Recorded as: **still worth a future pass only if profiling later shows it's still hot** — no action needed right now.
- **(b) `GlossProvider.tsx`** — re-read the mount lifecycle: `GlossProvider` is mounted once in the root `app/layout.tsx`, which (per Next.js App Router's persistent-layout model) does not remount on client-side navigation between routes — only the page content below it re-renders. Its preload `useEffect(() => {...}, [])` therefore already only fires once per real page load, not "every navigation" as the plan's premise assumed. Adding a `sessionStorage` guard would (1) provide zero additional benefit for navigation, since there already is none to guard against, and (2) *regress* correctness: `sessionStorage` persists across a same-tab page reload (F5), so the guard would incorrectly suppress a legitimate, cheap, non-fatal preload refresh after a real reload. Per the plan's own instruction ("If any doubt about correctness, skip and note it"), skipped — no commit.

---

**Total deviations:** 0 auto-fixed (no Rule 1-3 fixes were needed — all 7 mandatory tasks executed as planned). 2 optional tasks (8, 9) assessed and skipped per their own explicit best-effort/skip-without-guilt instructions, with full rationale recorded above.
**Impact on plan:** None on the mandatory scope. All 7 required items (1-6, item 4 split into 4a/4b) shipped exactly as specified; the two optional items were correctly identified as net-negative or zero-benefit on closer analysis and left untouched.

## Turso Index Verification (Task 6)

DDL already applied to the live production Turso DB. `PRAGMA index_list('Sentence')` output after running `scripts/apply-sentence-index-ddl.mjs`:

```json
[
  {"seq":0,"name":"Sentence_cardId_idx","unique":0,"origin":"c","partial":0},
  {"seq":1,"name":"sqlite_autoindex_Sentence_1","unique":1,"origin":"pk","partial":0}
]
```

`Sentence_cardId_idx` is present. Independently re-verified by the orchestrator after merge — see Verification Summary.

## Issues Encountered

None blocking. The worktree initially had no `.env`/`.env.local` (gitignored, not copied on worktree creation) — copied from the main repo checkout to enable `npm run build` (settings page SSR needs `DATABASE_URL`) and Task 6's live Turso DDL run; no `.env*` content was modified or committed.

The executor's untracked `SUMMARY.md` draft blocked the automated worktree-merge cleanup helper (it flags any uncommitted/untracked file as "dirty"). Resolved by the orchestrator: copied the draft out, cleared it from the worktree, merged, then recreated this file on `main` post-merge — no content lost, no code file touched by this step.

## Verification Summary

Ran after every task (all green), and independently re-verified by the orchestrator after merging to `main`:
- `npm test` — 241/241 passing (18 test files), including the updated `tests/study-cards.test.ts` three-call mock shape
- `npm run lint` — 0 errors (1 pre-existing unrelated warning in `components/StudySession.tsx`, unchanged by this pass)
- `npm run build` — production build succeeds; `/wrapped` and `/settings` route table confirms `ƒ` (dynamic) rendering post-RSC-migration
- Turso `PRAGMA index_list('Sentence')` — `Sentence_cardId_idx` present on the live DB

## User Setup Required

None — no external service configuration required. The Task 6 DDL was already applied to the live Turso DB as part of this execution (not deferred to the user).

## Next Phase Readiness

- All 7 mandatory performance items shipped and verified; no known regressions.
- Tasks 8 and 9 are documented as deliberately not pursued with concrete rationale — a future pass could revisit `/api/gloss` parallelization or the undo-route round-trip collapse if profiling later shows either is genuinely hot, but neither showed a clear win today.
- `.planning/codebase/*.md` and the root `CLAUDE.md`/`.claude/CLAUDE.md` architecture notes were not updated by this quick task (out of scope — no ROADMAP.md update either); a future `/gsd-docs-update` pass should fold in the two new client shells (`WrappedClient.tsx`, `SettingsClient.tsx`) and `lib/cards-list.ts` into the Key Files list.

---
*Quick task: 260713-imz*
*Completed: 2026-07-13*

## Self-Check: PASSED

- All 17 modified/created files verified present on disk (lib/study-cards.ts, tests/study-cards.test.ts, lib/cards-list.ts, app/cards/page.tsx, app/api/cards/route.ts, lib/settings.ts, app/layout.tsx, app/api/settings/route.ts, lib/dashboard.ts, app/wrapped/page.tsx, components/WrappedClient.tsx, app/settings/page.tsx, components/SettingsClient.tsx, prisma/schema.prisma, scripts/apply-sentence-index-ddl.mjs, lib/sync.ts, lib/relink-dependencies.ts).
- All 7 task commit hashes verified present in `git log`: c4fb5b6, ca6caff, 78664d6, 5e2eb9f, c6e7779, b0219b6, 05d4b55.
- Orchestrator independently re-ran `npm test` (241/241), `npm run lint` (0 errors), and `npm run build` (succeeded, `/wrapped` + `/settings` confirmed dynamic) after merging to `main` — all green.
