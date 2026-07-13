---
phase: quick-260713-imz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/study-cards.ts
  - tests/study-cards.test.ts
  - lib/cards-list.ts
  - app/cards/page.tsx
  - app/api/cards/route.ts
  - lib/settings.ts
  - app/layout.tsx
  - app/api/settings/route.ts
  - lib/dashboard.ts
  - app/wrapped/page.tsx
  - components/WrappedClient.tsx
  - app/settings/page.tsx
  - components/SettingsClient.tsx
  - prisma/schema.prisma
  - scripts/apply-sentence-index-ddl.mjs
  - lib/sync.ts
  - lib/relink-dependencies.ts
  - app/api/review/undo/route.ts
  - app/api/cards/[id]/route.ts
  - app/api/gloss/route.ts
  - components/GlossProvider.tsx
  - components/FreshnessWatcher.tsx
autonomous: true
requirements: [PERF-PASS-01]

must_haves:
  truths:
    - "/study session build does one lightweight pool query in a single parallel batch (sessionSize + pool + edges + knownLemmas), then a second full fetch for only the chosen cards — session content and order identical to before"
    - "app/layout.tsx resolves its 4 settings in ONE prisma.setting query; /api/settings GET and lib/dashboard.ts getActivityData likewise batch their Setting lookups"
    - "/wrapped and /settings render populated on first paint via the RSC + *Client.tsx pattern — no useEffect data fetch, no loading flash; theme control stays localStorage-only client-side"
    - "Sentence.cardId is indexed on the live Turso DB (verified via PRAGMA index_list)"
    - "Sync path uses one batched lesson-hash lookup and batched edge creation with identical return shapes and per-lesson failure handling"
    - "npm run lint and npm test pass after every task"
  artifacts:
    - "lib/cards-list.ts — shared select-trimmed cards query used by both app/cards/page.tsx and GET /api/cards"
    - "components/WrappedClient.tsx and components/SettingsClient.tsx — client shells receiving server-fetched props"
    - "scripts/apply-sentence-index-ddl.mjs — one-off CREATE INDEX script (already run against Turso when committed)"
    - "prisma/schema.prisma — Sentence model carries @@index([cardId])"
  key_links:
    - "getStudyCards second findMany uses id IN orderedIds; result MUST be re-ordered via a Map because findMany with `in` does not preserve order"
    - "app/cards/page.tsx and app/api/cards/route.ts both call the same lib/cards-list.ts function (DRY pattern matching lib/study-cards.ts / lib/dashboard.ts)"
    - "app/layout.tsx settings injection (--button/--reward/--reading-scale/hangul-spaced) must produce byte-identical <html> attrs/styles after batching"
---

<objective>
Performance pass across the app: cut serial Turso round-trips (each is a real ~60-200ms network hop at current scale: 1056 Card / 1616 Sentence / 2176 CardDependency rows) on the hottest paths — /study session build, /cards, every-route layout settings, /wrapped + /settings first load, sync — plus one missing DB index and optional API-mutation micro-fixes.

Purpose: squeeze /study further and improve page-load times app-wide. The orchestrator already diagnosed each fix via direct code reading; this plan executes that diagnosis verbatim — do not re-investigate.

Output: 9 tasks mapping to the 8 approved numbered items (item 4 split into two per-page tasks). Each task = one atomic commit, in order, item 1 first (highest impact). Tasks 8 and 9 are optional/best-effort — do only if tasks 1-7 are done and clean.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.claude/CLAUDE.md

Critical project constraints for this plan:
- NO staging environment. Turso is the real production DB, shared with local dev via DATABASE_URL. Task 6 (DDL) and Task 7 (sync path) must never run destructive operations.
- No CI — the executor is the only quality gate. Run the verify commands for real, every task.
- `prisma db push`/`migrate` do NOT work against libsql:// — follow the CLAUDE.md "Schema changes (Turso gotcha)" procedure exactly (Task 6).
- ESLint strict: react-hooks/purity (no Date.now()/Math.random()/no-arg new Date() in render) and react-hooks/set-state-in-effect (no synchronous setState in effect bodies). Lint must stay clean throughout.
- RSC convention: app/*/page.tsx stays a thin async server component (fetch + render one *Client.tsx); all hooks/state live in the client shell. DTO contract (lib/dto.ts): no raw Date crosses the server→client prop boundary — ISO strings only.
- Known debt, do not chase: tests/study-cards.test.ts:132,169 have pre-existing implicit-any tsc errors (vitest still runs; npm run build still passes in production).
</context>

<tasks>

<task type="auto">
  <name>Task 1: [item 1] lib/study-cards.ts — two-phase pool fetch</name>
  <files>lib/study-cards.ts, tests/study-cards.test.ts</files>
  <action>
    Read tests/study-cards.test.ts FIRST to understand what is covered and how prisma is mocked — the query shape changes below require updating the mock shapes while keeping every existing behavioral assertion passing.

    Restructure getStudyCards() from its current shape (serial `await getSessionSize()`, then a Promise.allSettled batch containing a heavy pool query with `take: 1000` and full `include: { review, lesson, sentences }`) into a two-phase fetch:

    Phase A — one Promise.allSettled batch containing ALL FOUR of: (1) getSessionSize(), (2) a LIGHTWEIGHT pool query using `select: { id: true, review: { select: { nextReview: true } }, lesson: { select: { orderIndex: true } } }` with the same where/take as today (confirmed: selectSessionCards/sequenceCards in lib/sequence.ts only touch id / review.nextReview / lesson.orderIndex), (3) the CardDependency edges query (it does not depend on the pool result — currently sequenced after it for no reason), (4) the knownLemmas query. Rejection handling: pool failure still throws (500, as today); knownLemmas falls back to empty Set (as today); sessionSize falls back to DEFAULT_SESSION_SIZE from lib/habit.ts; edges fall back to [].

    Run selectSessionCards + sequenceCards on the lightweight results to produce orderedIds.

    Phase B — a second `prisma.card.findMany({ where: { id: { in: orderedIds } }, include: ...exactly the include the pool query used before... })` for just the chosen cards (~sessionSize, not 1000). findMany with `in` does NOT preserve order: build a Map from id to record and re-map over orderedIds to restore sequence order. Then annotate sentences with unknownCount (lib/known-words.ts) and serialize via lib/dto.ts exactly as before — output DTO shape and ordering must be byte-identical to the current implementation.

    Update the prisma mocks in tests/study-cards.test.ts to the new two-call shape; keep all assertions passing. Do not fix the pre-existing implicit-any debt at lines 132/169 unless the mock rewrite touches those lines anyway.

    Commit atomically: perf(study): two-phase pool fetch in getStudyCards.
  </action>
  <verify>
    <automated>npm test && npm run lint</automated>
  </verify>
  <done>getStudyCards issues one parallel batch (sessionSize + light pool + edges + knownLemmas) then one full fetch for chosen ids only, with Map-based re-ordering; sessionSize/edges rejections fall back (DEFAULT_SESSION_SIZE / []); npm test and npm run lint pass; single commit for this item.</done>
</task>

<task type="auto">
  <name>Task 2: [item 2] lib/cards-list.ts — shared select-trimmed cards query</name>
  <files>lib/cards-list.ts, app/cards/page.tsx, app/api/cards/route.ts</files>
  <action>
    app/cards/page.tsx and GET app/api/cards/route.ts currently run an identical unbounded `prisma.card.findMany` with full `include: { review, lesson, sentences }` and no select. Create lib/cards-list.ts (server-only, mirroring the lib/study-cards.ts / lib/dashboard.ts extraction pattern) exporting one function that both callers use.

    Before writing the select: read components/CardsClient.tsx to confirm which Card/CardReview/Sentence/Lesson fields the UI actually reads (front, back, type, notes, lesson.orderIndex/title, the review fields it displays, sentences' korean/targetForm/translation), AND read lib/dto.ts — CardDTO's type contract may require more fields than the UI renders. The select must satisfy CardDTO fully; only drop columns that are genuinely unused by both the UI and the DTO contract (candidates: `distractors`, and the three deprecated cloze columns `clozeSentence`/`clozeAnswer`/`clozeTranslation` — drop them only if CardDTO does not require them for other consumers).

    app/cards/page.tsx stays a thin async RSC calling the new function; app/api/cards/route.ts GET delegates to the same function (POST unchanged). Do NOT add pagination or a `take` cap — explicitly out of scope; this task only trims payload width via select.

    Commit atomically: perf(cards): extract shared select-trimmed cards query into lib/cards-list.ts.
  </action>
  <verify>
    <automated>npm run lint && npm run build</automated>
  </verify>
  <done>Both /cards RSC and GET /api/cards call the single lib/cards-list.ts function; select drops unused columns without breaking the CardDTO contract; no pagination added; lint and build pass; single commit.</done>
</task>

<task type="auto">
  <name>Task 3: [item 3] Batch Setting lookups (layout, settings API, dashboard)</name>
  <files>lib/settings.ts, app/layout.tsx, app/api/settings/route.ts, lib/dashboard.ts</files>
  <action>
    Each getter in lib/settings.ts does its own `prisma.setting.findUnique`, so app/layout.tsx's Promise.all of 4 getters = 4 Turso round-trips on EVERY route render; app/api/settings/route.ts GET = 8; lib/dashboard.ts getActivityData = 2.

    Add a batched helper to lib/settings.ts — `getSettings(keys: string[]): Promise<Map<string, string>>` backed by one `prisma.setting.findMany({ where: { key: { in: keys } } })`. To avoid duplicating each key's default/validation/fallback logic, refactor each existing getter's parse-and-default step into a small pure parse function (raw string-or-undefined in, validated value out) that BOTH the standalone getter and the batched call sites share. Every existing getter (getDailyGoalSeconds, getButtonColor, getRewardColor, getReadingTextScale, getReadingAid, etc.) must keep its exact current signature and standalone behavior — other callers (scripts, other routes) must not break.

    Rewire exactly three call sites to one query each: app/layout.tsx (4 keys — resulting html attributes/inline styles for --button/--reward/reading scale/reading aid must be identical to today, including error-fallback defaults), app/api/settings/route.ts GET (8 keys), lib/dashboard.ts getActivityData (its 2 Setting lookups; leave its non-Setting query as-is).

    Check whether lib/settings.ts has existing tests (none found in tests/ as of planning — confirm) and keep npm test green.

    Commit atomically: perf(settings): batch Setting lookups into single findMany per call site.
  </action>
  <verify>
    <automated>npm test && npm run lint && npm run build</automated>
  </verify>
  <done>getSettings(keys) exists; layout=1 query, settings GET=1 query, getActivityData Setting reads=1 query; all standalone getters keep signatures and defaults; test/lint/build pass; single commit.</done>
</task>

<task type="auto">
  <name>Task 4: [item 4a] /wrapped — RSC hydration migration</name>
  <files>app/wrapped/page.tsx, components/WrappedClient.tsx</files>
  <action>
    app/wrapped/page.tsx is currently a client page that useEffect-fetches /api/activity + /api/stats after mount (extra round-trip + cold start). Migrate to the established RSC pattern (model: app/page.tsx + components/HomeClient.tsx, app/habits/page.tsx + HabitsClient.tsx):

    New app/wrapped/page.tsx: thin async server component (no client directive, no hooks) calling getStats() + getActivityData() from lib/dashboard.ts via Promise.all, rendering a new components/WrappedClient.tsx with the results as props. Add `export const dynamic = 'force-dynamic'` with the same explanatory comment convention app/page.tsx uses. Respect the DTO contract: only ISO-string dates cross the prop boundary (StatsDTO/ActivityDTO already comply).

    components/WrappedClient.tsx: client shell containing ALL the existing /wrapped UI and logic moved verbatim — ProficiencyArc, streak/longest streak, mastered cards, total study time, goal-met days, next-milestone card, navigator.share with clipboard fallback. It starts in its populated state from props (delete the fetch effect and any loading state). This is a data-fetching relocation, NOT a UI rewrite — preserve all behavior and markup.

    Commit atomically: perf(wrapped): migrate /wrapped to RSC hydration.
  </action>
  <verify>
    <automated>npm run lint && npm run build && grep -c "export default async function" app/wrapped/page.tsx | grep -qx 1</automated>
  </verify>
  <done>/wrapped page.tsx is a thin async RSC with force-dynamic; WrappedClient.tsx receives StatsDTO/ActivityDTO props and renders populated on first paint with zero data-fetch effects; share + milestone behavior unchanged; lint/build pass; single commit.</done>
</task>

<task type="auto">
  <name>Task 5: [item 4b] /settings — RSC hydration migration</name>
  <files>app/settings/page.tsx, components/SettingsClient.tsx</files>
  <action>
    Same migration as Task 4, for /settings, using Task 3's batched getSettings. New app/settings/page.tsx: thin async RSC fetching only the DB-backed settings server-side — dailyGoalSeconds, habitDayStartHour, sessionSize, buttonColor, rewardColor, readingTextScale, readingAid, lastAutoSyncedAt — in ONE batched call, rendering components/SettingsClient.tsx with them as initial props. Add `export const dynamic = 'force-dynamic'` per convention.

    CRITICAL carve-out: the theme value is client-only (localStorage via lib/theme.ts getStoredTheme) and MUST stay that way — keep the theme useState/effect logic in SettingsClient.tsx exactly as it exists in the current page today; do not move theme resolution server-side.

    SettingsClient.tsx receives initial props and starts populated (no loading flash). Preserve ALL existing behavior verbatim: save debouncing, palette grid + Customize disclosure color pickers, the Advanced section housing SyncPanel, appearance control. Data-fetching relocation only, not a UI rewrite. Watch react-hooks/set-state-in-effect when removing the old fetch effect — initialize state directly from props (useState(initialX)), matching the CardsClient.tsx pattern.

    Commit atomically: perf(settings-page): migrate /settings to RSC hydration.
  </action>
  <verify>
    <automated>npm run lint && npm run build && grep -c "export default async function" app/settings/page.tsx | grep -qx 1</automated>
  </verify>
  <done>/settings page.tsx is a thin async RSC (one batched settings query, force-dynamic); SettingsClient.tsx starts populated from props; theme logic still localStorage-only in the client shell; debounce/pickers/sync panel unchanged; lint/build pass; single commit.</done>
</task>

<task type="auto">
  <name>Task 6: [item 5] prisma/schema.prisma — Sentence.cardId index (Turso DDL procedure)</name>
  <files>prisma/schema.prisma, scripts/apply-sentence-index-ddl.mjs</files>
  <action>
    Add `@@index([cardId])` to the Sentence model in prisma/schema.prisma (ReviewLog/CardDependency/Card already index their FKs; Sentence is the gap).

    Follow the CLAUDE.md "Schema changes (Turso gotcha)" procedure EXACTLY — prisma db push/migrate cannot talk to libsql://:
    1. Edit schema.prisma, run `npx prisma generate`.
    2. Run `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (flag is --to-schema) and hand-identify ONLY the new CREATE INDEX statement for Sentence.cardId (expected name Sentence_cardId_idx). Do NOT run the full DDL — every table already exists in production.
    3. Write scripts/apply-sentence-index-ddl.mjs in the established one-off style of scripts/apply-graph-ddl.mjs / scripts/apply-sentence-ddl.mjs: @libsql/client createClient from DATABASE_URL + DATABASE_AUTH_TOKEN (dotenv from .env), executeMultiple() containing ONLY that single CREATE INDEX statement (add IF NOT EXISTS for idempotency). Absolutely no DROP/ALTER/DELETE — this runs against the live production Turso DB.
    4. Run the script once against Turso, then verify through the same libsql client that `PRAGMA index_list('Sentence')` lists the new index.

    Commit schema.prisma + the new script together. Commit message must note the DDL has already been applied to the live Turso DB, e.g.: perf(db): index Sentence.cardId (DDL applied to live Turso).
  </action>
  <verify>
    <automated>npx prisma generate && node -e "import('dotenv').then(d=>{d.config();return import('@libsql/client')}).then(async m=>{const c=m.createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_AUTH_TOKEN});const r=await c.execute(\"PRAGMA index_list('Sentence')\");console.log(JSON.stringify(r.rows));process.exit(r.rows.some(x=>String(x.name).includes('cardId'))?0:1)})"</automated>
  </verify>
  <done>Sentence model has @@index([cardId]); prisma client regenerated; the index exists on live Turso (PRAGMA check passes); one-off script committed alongside schema with DDL-already-applied note; nothing destructive was executed; single commit.</done>
</task>

<task type="auto">
  <name>Task 7: [item 6] lib/sync.ts serial loops + lib/relink-dependencies.ts parallel reads</name>
  <files>lib/sync.ts, lib/relink-dependencies.ts</files>
  <action>
    Three fixes on the sync path. This path (/api/sync, cron, local-resync.mts, full-resync.mjs) has no live-DB test coverage — preserve exact behavior and return shapes, and read the full diff twice before committing. Do not regress the per-lesson Promise.allSettled failure handling that exists elsewhere in the sync flow.

    (a) lib/sync.ts ~lines 42-48: a per-lesson `await prisma.lesson.findUnique({ where: { contentHash } })` inside a for-loop over ALL doc lessons. Replace: hash all lessons first, then ONE `prisma.lesson.findMany({ where: { contentHash: { in: hashes } } })`, then classify new/existing from the result set (e.g. a Set of found hashes). Identical downstream decisions for every lesson.

    (b) lib/sync.ts ~lines 287-300: a per-edge `await prisma.cardDependency.upsert(...)` in a for-loop. Before writing new batching, read lib/relink-dependencies.ts computeMissingEdges usage (lib/link-dependencies.ts) — the codebase already solves this exact edge-linking problem with a batch-diff (reads + one createMany of only-missing edges); reuse or adapt that instead of fresh logic. Result must be idempotent and produce the same final edge set as the upsert loop.

    (c) lib/relink-dependencies.ts ~lines 46-52: two independent sequential findMany awaits (cards, then edges) — wrap in Promise.all.

    Run the full test suite — tests/link-dependencies.test.ts and tests/relink-dependencies.test.ts cover parts of this area and must stay green.

    Commit atomically: perf(sync): batch lesson-hash lookup and dependency-edge writes.
  </action>
  <verify>
    <automated>npm test && npm run lint</automated>
  </verify>
  <done>Lesson dedup uses one findMany-in over hashes; edge linking is batched (reusing/adapting computeMissingEdges) and idempotent; relink's two reads run via Promise.all; return shapes and failure handling unchanged; test/lint pass; single commit.</done>
</task>

<task type="auto">
  <name>Task 8: [item 7 — OPTIONAL, best-effort] Minor API mutation round-trip fixes</name>
  <files>app/api/review/undo/route.ts, app/api/cards/[id]/route.ts, app/api/gloss/route.ts</files>
  <action>
    Do this task ONLY if Tasks 1-7 are done, committed, and clean. Skip without guilt otherwise — lower priority by explicit user/orchestrator direction.

    (a) app/api/review/undo/route.ts ~lines 28-33: findUnique-then-update → collapse into fewer round-trips where safely equivalent (keep the try/catch + prevState validation added in Phase 27 commit c6147e3 intact).

    (b) app/api/cards/[id]/route.ts ~lines 79-82: transaction-then-refetch → fold the refetch into the transaction ONLY IF the libSQL adapter's array-form transaction supports returning the updated row; otherwise leave as-is. Do NOT change the transaction form itself (array-form vs interactive is adapter-sensitive per CLAUDE.md).

    (c) app/api/gloss/route.ts ~lines 26/41/54: three serial lookups on the cache-miss path — parallelize only the ones that are genuinely independent of each other; preserve the documented resolution order semantics (corpus → stem → Setting cache → LLM).

    If all three land, one commit: perf(api): trim mutation round-trips in undo/cards/gloss routes. If only a subset is safe, commit the subset and note what was left and why in the SUMMARY.
  </action>
  <verify>
    <automated>npm test && npm run lint</automated>
  </verify>
  <done>Either: the safe subset of (a)/(b)/(c) is applied with test/lint green and behavior semantics preserved, committed once — or the task is explicitly skipped/partially skipped with rationale recorded in the SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 9: [item 8 — OPTIONAL, best-effort] Client polish: FreshnessWatcher note + GlossProvider preload guard</name>
  <files>components/GlossProvider.tsx, components/FreshnessWatcher.tsx</files>
  <action>
    Do this task ONLY if everything else is clean and committed.

    (a) components/FreshnessWatcher.tsx ~lines 102-110: it re-fetches the full /api/cards payload on every foreground/popstate while on /cards. After Task 2's select trim this is materially cheaper — assess and RECORD in the SUMMARY whether further capping/debouncing is still worth a future pass; only change code here if a trivially safe debounce presents itself (default: no code change).

    (b) components/GlossProvider.tsx ~lines 232-241: a preload fetch fires on every navigation. If safe and low-risk, add a sessionStorage guard so the preload runs once per browser session (mind react-hooks/set-state-in-effect — perform the sessionStorage read/write inside the effect/async callback, not render). If any doubt about correctness, skip and note it.

    If (b) lands, commit: perf(gloss): once-per-session preload guard in GlossProvider. If only the (a) assessment happened, no commit — SUMMARY note only.
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>GlossProvider preload guarded once-per-session (committed) or explicitly skipped with rationale; FreshnessWatcher follow-up worthiness recorded in SUMMARY; lint clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local dev → production Turso | No staging; DATABASE_URL points at the live DB — Task 6 DDL and Task 7 sync changes execute against real data |
| client → API routes | Unchanged — no new endpoints, no new input surfaces, no new packages in this pass |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | scripts/apply-sentence-index-ddl.mjs (prod DDL) | high | mitigate | Script contains exactly one CREATE INDEX IF NOT EXISTS statement, no DROP/ALTER/DELETE; verified post-run via PRAGMA index_list('Sentence'); committed with DDL-already-applied note |
| T-quick-02 | Tampering | lib/sync.ts batching rewrite (prod writes) | high | mitigate | Reuse existing tested computeMissingEdges batch-diff pattern; preserve return shapes + allSettled failure handling; npm test (link/relink suites) gates; read diff twice before commit |
| T-quick-03 | Information Disclosure | lib/cards-list.ts select | low | mitigate | Select strictly shrinks the payload relative to today; DTO contract check in Task 2 ensures no new fields exposed |
| T-quick-04 | Denial of Service | unbounded /api/cards fetch | low | accept | Payload width trimmed in Task 2; row-count cap/pagination deliberately out of scope per approved instructions (single-tenant app, 1056 rows) |

No package-manager installs in this plan — no supply-chain checkpoint required.
</threat_model>

<verification>
After all non-optional tasks (1-7):
- `npm test` — full Vitest suite green (study-cards, link-dependencies, relink-dependencies, review-route suites all pass with updated mocks)
- `npm run lint` — zero errors
- `npm run build` — production build succeeds (validates RSC migrations + prisma generate)
- Turso index check: PRAGMA index_list('Sentence') includes the cardId index (Task 6 verify command)
- Git log shows one atomic commit per completed numbered item, in item order (items 1,2,3,4a,4b,5,6 mandatory; 7,8 only if attempted)
</verification>

<success_criteria>
- /study session build: single parallel batch + narrow second fetch for chosen cards only; identical session output
- /cards + GET /api/cards share one select-trimmed query module
- Layout settings = 1 query per page view (was 4); settings GET = 1 (was 8); getActivityData Setting reads = 1 (was 2)
- /wrapped and /settings are RSC-hydrated with populated first paint; theme remains client-only
- Sentence.cardId indexed on live Turso; sync path batched with unchanged semantics
- Lint clean, tests green, build passing at every commit; no destructive operation touched production data
</success_criteria>

<output>
Create `.planning/quick/260713-imz-performance-pass-squeeze-study-further-a/260713-imz-SUMMARY.md` when done. Record: per-item commit hashes, any Task 8/9 skips with rationale, the FreshnessWatcher follow-up assessment, and the PRAGMA output proving the Sentence index exists.
</output>
