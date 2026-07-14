# Milestones

## v1.6 Freshness, Performance & E2E Testing (Shipped: 2026-07-14)

**Phases completed:** 4 phases, 14 plans, 31 tasks

**Key accomplishments:**

- 16-cell route x navigation-path matrix (4 routes x 4 paths) run against a production build, cleanly splitting Router Cache reuse (5 cells, zero re-fetch) from client-shell `useState(initialProps)` non-resync (4 cells, RSC re-fetch observed but UI unchanged) — with the exact prior-regression scenario (grade session → Home → Study) now reproducing Fresh, isolating the confirmed-stale surface to `/habits`'s post-mutation-return path plus all four routes' back-forward/resume paths.
- Playwright harness with an isolated file:-SQLite DB, allow-list DB guard, setup-project auth via real /api/login, and a D-13 seed fixture — first full production-build boot verified green (`npx playwright test --project=setup` exits 0)
- Ported retry-safe per-route DOM readers into e2e/helpers/readers.ts and wrote a 4-route smoke spec (E2E-04) asserting FIXTURE-traceable seeded values plus informational Navigation Timing — no vacuous 200-only checks
- Ported isRscRequest/simulateResume + DB mutators into e2e/helpers/, encoded 24-DIAGNOSIS.md's full 16-cell freshness matrix as three real Playwright spec files (9 genuinely red, 7 genuinely green), and retired scripts/diagnose-freshness.mts after human-verified trace/reporter proof
- Re-verified the live 16-cell freshness baseline on pristine code (all 8 red cells now present as 0-fetch Router-Cache-reuse; /habits post-mutation-return confirmed genuinely fresh), then flipped the two red spec files to assert the fixed-behavior contract via a new `waitForRscFetch` deterministic-wait helper — all 8 rewritten tests fail cleanly at the missing-boundary-fetch timeout, the true red→green bar for Plans 26-02/26-03
- New `FreshnessWatcher` client component mounted app-wide fires `router.refresh()` at every real staleness boundary (resume/back-forward/bfcache), and `HomeClient`/`HabitsClient` now adopt the fresh props that refresh delivers — flipping 4 of the 8 red acceptance tests green (`/ back-forward`, `/ resume`, `/habits resume`, `/habits back-forward`) while the full regression net (7 fresh-paths + 4 smoke) stays green
- Added gated `initialCards` prop-adoption to `StudyClient` and `CardsClient` (matching 26-01-PLAN.md's design decisions 4c/4d exactly — adopt only when no in-flight interaction needs protecting, always consume the delivered reference); a full-suite sweep produced a genuinely clean 17/17 + 5/5 run, but repeated runs surfaced a pre-existing, out-of-scope Next.js 16.2.1 reliability issue in the already-shipped `FreshnessWatcher` mechanism that intermittently drops `router.refresh()` updates on routes with `loading.tsx` (worst on `/study`) — root-caused via a controlled experiment and logged to `deferred-items.md`, not patched in-scope
- Two new Playwright cells (`e2e/freshness-gate.spec.ts`) that drive a real mid-session boundary refresh and a real open-sheet boundary refresh, proving StudyClient's and CardsClient's adoption gates discard the delivered payload while an in-flight interaction is protected — closing 26-VERIFICATION.md's only `behavior_unverified` gap for FRESH-02.
- Added a Suspense-independent JSON re-fetch backstop to `FreshnessWatcher` (React context + `useFreshPayload()` hook) so `/study`, `/cards`, `/habits` boundary freshness no longer depends on Next.js 16.2.1 successfully applying a `router.refresh()`-fetched RSC payload to the mounted client tree — closing the previously 0/7-passing `/study resume` cell to a clean 5/5 across repeated isolated runs
- Post-merge formal acceptance sweep at the exact bar 26-VERIFICATION.md measured the phase against: 2x combined 4-file sweep (19/19 both times, now including Plan 26-04's 2 new FRESH-02 gate cells) plus 3x5 isolated reruns of every previously-flaky cell — all 15/15 — and a full clean regression net. No flake observed anywhere in this run; the phase's reliability gap appears closed.
- Closed the Phase 25 KNOWN-FRAGILE locator gap with a data-testid pass, shipped the E2E-05 grade-flow spec with a subprocess DB persistence backstop, and fixed a genuine production FSRS bug (learning_steps never persisted) discovered while writing the spec — cards were permanently stuck at a 10-minute review interval and could never graduate to long-term review.
- Shipped `e2e/perf.spec.ts` (PERF-04 + PERF-05): 4 page-load budget tests (median-of-5 Navigation Timing DCL < 3000ms) and 3 API round-trip budget tests (median-of-5 authenticated fetch timing < 1000ms), both with per-sample vacuity guards and logged samples, falsifiability-proven live via a 1ms-budget probe, and verified green in the full 7-spec-file suite alongside Plan 01's grade-flow spec.
- Registered the `playwright` Claude Code MCP server (approved unpinned `@latest` via a blocking package-legitimacy checkpoint) and documented the exploratory-QA workflow in a new CLAUDE.md section, human-verified end-to-end in a fresh session against the real dev server.

---

## v1.5 Extraction Quality & Reliability (Shipped: 2026-07-10)

**Phases completed:** 4 phases, 9 plans, 20 tasks

**Key accomplishments:**

- Rewrote `parseExtractionResponse` for the `{ cards: [...] }` wrapper with depth-2 truncation salvage, extracted a shared pure `normalizeExtractedCards()`, and added code-enforced blank-safety (safe-first partition + zero-safe whole-card rejection) — no card can reach the DB without a verified blank-safe first sentence, and the parser only accepts the new wrapper contract.
- Migrated `extractCardsFromNotes` from "ask for JSON in prose and salvage-parse it" to native Anthropic structured outputs — `output_config.format: zodOutputFormat(ExtractionSchema)` on the existing stream call, reading `message.parsed_output` on the happy path, with truncation salvage reached only through a pre-registered `stream.on('text')` accumulator and an `AnthropicError` catch.
- Pure, Vitest-covered `lib/audit-checks.ts` with 11 named exports covering all six audit check classes by delegating to production helpers (sentenceMatch/normalizeFront/filterComponents) — 60 tests, full suite 209 green
- Read-only `scripts/audit-cards.mts` (env-first dynamic-import preamble, single findMany, delegates to runAuditChecks) producing the dated `.planning/audits/card-audit-2026-07-07.md` evidence report — 1039 cards scanned, findings non-empty as expected for a legacy deck
- TDD-driven rewrite of the `sentenceMatch()` single-char branch: isolated 1-char targetForms (string-edge/whitespace/punctuation on both sides) are now blank-safe; embedded ones (Hangul-adjacent) stay unsafe — resolving the audit's one zero-safe finding (card 다) by rule change with zero DB mutation.
- Revised the exhaustive-extraction prompt per four audit error classes (PROMPT-01), fixed a gating bug in the PROMPT-02 eval script's verdict computation, and validated the revised prompt against the pre-edit baseline on real lessons 4/12/17 — PASS: frontRomanization 4→0, zeroSafe/zeroSentence held at 0.
- Applied all 9 audit-flagged front rewrites and 3 new 철 sentences in place by id against the live Turso production deck via a dry-run-gated script, proved the findings cleared with a post-fix audit re-run verified by card id, and closed the phase's findings loop with a fix report documenting every accepted residual.
- Additive `[study-cards]`-prefixed console.error makes the silent known-lemmas query failure observable in Vercel logs before the existing empty-Set fallback, with a 3-test vitest regression suite locking both the new log and the unchanged degradation contract
- Idempotent full-deck auto-relink inside runSync closes RELIABILITY-02/03: every clean sync with new lessons now resolves forward-reference CardDependency edges via a pure computeMissingEdges → resolveDependencyEdges chain, retiring the manual relink script and consolidating three duplicated relink loops onto one shared helper

**Closeout type:** override_closeout — Known verification overrides: 3 (see STATE.md Deferred Items). Phase 20 verification report absent; Phase 21 verification human_needed (6/6 truths verified structurally, 2 manual-only items deferred) + 2 pending UAT scenarios. All 12 requirements satisfied per plan SUMMARY evidence.

**Delivered:** Audited and hardened the card-extraction pipeline (native structured outputs + code-enforced blank-safety), acted on audit findings (prompt revision + in-place corpus fixes), and closed two known reliability bugs (observable known-lemmas degradation + automatic forward-reference edge relinking).

**Git range:** v1.4..v1.5 — 100 commits, 153 files, +13740/-12350 lines. Timeline: 2026-07-05 → 2026-07-10 (5 days).

---

## v1.4 Knowledge Graph Quality & History (Shipped: 2026-07-05)

**Phases completed:** 4 phases, 15 plans, 35 tasks

**Key accomplishments:**

- Pure `filterComponents()` deck-lookup filter (normalizeFront + splitParticle stem fallback, mirrors lib/known-words.ts) plus a read-only `dry-run-filter.mjs` corpus diagnostic — human-reviewed and APPROVED against the live corpus (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5% drop rate), unblocking the downstream wiring plan.
- Tightened the `components[]` extraction prompt with an explicit prerequisite-dependency rule (GRAPH-01) and extracted a pure, unit-tested `parseExtractionResponse(text: string): ExtractedCard[]` that structurally rejects malformed cards on receipt while preserving the existing truncation-salvage logic byte-for-byte (GRAPH-02).
- Wired the plan 16-01 deck-lookup filter into `parseExtractionResponse` (single integration point inside `extractCardsFromNotes`) and fixed the pre-existing `keyToId` scoping bug in both `app/api/sync/route.ts` and `scripts/local-resync.mts` so leaf-node cards are resolvable as prerequisites — together closing GRAPH-03 Success Criterion 1.
- Dry-run-by-default `scripts/retro-filter-cleanup.mts` re-filtered every persisted `Card.components` row and reconciled `CardDependency` edges using an all-cards `keyToId`; the human-approved production run rewrote 511 cards, pruned 2 stale edges, and added 4 newly-valid edges, closing GRAPH-03 Success Criterion 1 against the existing corpus.
- Added the append-only `ReviewLog` Prisma model with a UNIQUE `idempotencyKey` index, regenerated the Prisma client, and applied the new table live to production Turso via a one-time manual DDL script.
- Hardened `POST /api/review` into an idempotent, transactional write path: validates a client-supplied `idempotencyKey`, writes `CardReview.update` + `ReviewLog.create` inside one atomic array-form `$transaction`, and catches a duplicate-key `P2002` collision as an idempotent 200 replay instead of double-applying FSRS state.
- Threaded a client-generated `crypto.randomUUID()` idempotency key through `postReviewWithRetry`'s 3-attempt loop and added an undo-triggered `AbortController` so `handleUndo` cancels any in-flight background retry before it can re-apply a rating after undo.
- Widened the POST /api/review idempotent-retry catch to also recognize the raw, unclassified `DriverAdapterError` that `@prisma/adapter-libsql` throws for a duplicate `idempotencyKey` inside an interactive transaction — closing the Phase 17 UAT Test 6 gap via a new pure `lib/db-errors.ts` helper.
- Extended `isUniqueConstraintError` to a bounded BFS that also descends into `meta.driverAdapterError`, closing the classified-P2002-without-`meta.target` gap for duplicate `idempotencyKey` POSTs, and added a persisted `tests/review-route.test.ts` that invokes the real route handler twice against a local SQLite file DB to protect the fix going forward.
- Shared `getReviewHistory()` cursor-paginated query (Prisma `skip:1` + compound `orderBy`) plus `GET /api/reviews` route and DTO/type plumbing, mirroring the existing `lib/study-cards.ts` shared-function pattern.
- Added a real-data FSRS-state breakdown ("Card progress": New/Learning/Review/Relearning) to the Habits page as a single whole-section `<Link href="/history">`, backed by a new `cardReview.groupBy` in `getStats()`.
- `/history` RSC page + `HistoryClient` feed (reverse-chron, grade-colored rows, IntersectionObserver infinite scroll, single-card filter chip) plus a "View history →" deep-link from `CardEditor`, completing the phase's HIST-04..07 surface on top of 18-01's data pipeline and 18-02's Habits entry point.
- Moved the entire POST /api/sync handler body into lib/sync.ts:runSync(), leaving app/api/sync/route.ts as a thin wrapper — no behavior change.
- Persisted a `lastAutoSyncedAt` ISO-string setting (no schema change), exposed it read-only via GET /api/settings, and rendered it as a passive status line in Settings > Advanced next to SyncPanel.
- Added a fail-closed CRON_SECRET bearer check (TDD, unit-tested), wired it into middleware.ts ahead of the cookie gate without touching the matcher, and shipped `GET /api/cron/sync` + `vercel.json` so a daily Vercel Cron job triggers the shared `runSync()` and only advances `lastAutoSyncedAt` on success.

---

## v1.3 Reliability & Hardening (Shipped: 2026-07-03)

**Phases completed:** 3 phases, 6 plans, 15 tasks

**Key accomplishments:**

- Hardened POST /api/review with a rating range guard (400) + try/catch generic 500, and mapped PUT /api/cards/[id] Prisma P2002 collisions to a friendly 400 — no unhandled throws or raw schema leaks on the two authenticated write routes.
- Bounded silent-retry wrapper for the background POST /api/review with a hand-rolled token-styled toast only on exhaustion, plus a mount-guarded atomic undo restoration — live-verified across offline-grade, undo-during-flux, and dark-mode checks.
- Hoisted the sync dependency-resolution map to once-per-request and named failed lessons by a content excerpt with raw error text confined to server-side logs.
- Mount-time preload of the persistent DB gloss cache into GlossProvider's in-memory map (keyed by `normalizeFront` to match the DB key) so previously-glossed words resolve instantly on a fresh load with no LLM round-trip.
- Pure `lib/sentence-selection.ts` (selectSentence + single-source hashStr) with 8 Vitest cases, and a memoized `chosenIdx` `useMemo` in StudySession — behavior preserved, Phase 13 hardening untouched
- Three presentational `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` client components carved out of `StudySession.tsx`'s 300-line inline conditional; parent slimmed to header + progress + a three-way mode dispatch — human-verified with zero behavior regression

---

## v1.2 Performance & Snappiness (Shipped: 2026-07-01)

**Phases completed:** 4 phases, 9 plans, 12 tasks

**Key accomplishments:**

- Every navigation to /cards, /study, or /habits shows an instant content-shaped skeleton (`bg-surface-2 animate-pulse` only) — zero blank-flash transitions
- Cards, study, home, and habits pages all converted to the async RSC + client-shell + DTO pattern: real data now arrives in the initial HTML, eliminating every empty-state/blank-loading flash on first paint
- `/api/cards/due` parallelizes its pool + known-lemmas queries via `Promise.allSettled`, saving roughly one Turso round-trip per study-session start, with graceful degradation on partial DB failure
- Grade-button jitter eliminated — `submitReview` is now synchronous and optimistic (client-side FSRS via `reviewCard()`, fire-and-forget save); undo correctly restores the pre-grade unrevealed state
- Shared `lib/dto.ts`, `lib/study-cards.ts`, and `lib/dashboard.ts` modules extracted as single sources of truth, reused by both the new RSC pages and the API routes they used to power exclusively
- Zero new npm packages — every pattern (RSC, `loading.tsx`, `Promise.allSettled`, DTO serialization) built into the existing Next.js 16 + React 19 stack

**Known verification overrides: 4** (see `.planning/STATE.md` Deferred Items — Phase 9 has no VERIFICATION.md but 4/4 automated requirement checks pass; Phases 10/11 are `human_needed` for RSC paint-timing checks, largely covered in practice by Phase 11's live UAT session; Phase 11's UAT bug was root-caused and fixed pre-close)

---

## v1.0 Foundation-First Study (Shipped: 2026-06-27)

**Phases completed:** 2 phases, 3 plans, 6 tasks

**Key accomplishments:**

- Pure `selectSessionCards` selector — a cycle-safe, downward-closed DFS closure that pulls each chosen card's still-due in-pool prerequisites into the session and caps at `sessionSize` during selection — wired into `GET /api/cards/due` over the whole eligible pool.
- 1. [Rule 3 - Blocking] vitest path alias @/ not configured
- Server-annotated unknownCount per sentence + client bare-word-first gate that shows sentences when context is already known

## v1.1 UI/UX Polish (Shipped: 2026-06-29)

**Phases completed:** 7 phases (3–8 + 8.1), 12 plans, 20 commits

**Key accomplishments:**

- Full code-only UI/UX audit: 27 severity-classified findings (F-01..F-27) across 7 screens × 6 dimensions; P0 gate confirmed all critical issues resolved before downstream phases
- Complete design-system token sweep: `--muted`, `--border` tokens added to all 3 globals.css blocks; dark-mode sentence highlight fixed (reversed amber pairing); zero ad hoc gray-* utilities remaining across 20+ files
- Study session visual polish: "Card N of Total" progress counter, warm haptic grade differentiation (correct → success, needs-review → selection), Korean line-height 1.7, smooth 0.12s inter-card fade with reduced-motion gate
- Home dashboard three-state hero: due/goal-met/caught-up states derived from parallel activity+stats fetch; elevated greeting; active press states throughout
- iOS safe-area fix: `--sab` CSS variable frozen at mount via useEffect (survives Next.js `<Link>` navigation); extended to Nav, layout, Sheet, StudySession; 44px touch targets across nav tabs and secondary interactive elements
- Full accessibility baseline: aria-labels on all interactive icon buttons, reduced-motion counterparts for all animations, global `-webkit-tap-highlight-color: transparent`, 14-screen dark-mode regression approved by operator

**Known verification overrides: 2** (see `.planning/milestones/v1.1-MILESTONE-AUDIT.md` — Phases 3/4 no VERIFICATION.md; NAV-01 unverified on physical device)

---
