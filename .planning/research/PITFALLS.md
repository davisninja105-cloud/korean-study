# Pitfalls Research

**Domain:** Adding 3 features to an existing Next.js/Prisma/Turso personal SRS app — Vercel Cron auto-sync, a high-write `ReviewLog` audit table on top of an optimistic/retry/undo review flow, and a deterministic post-extraction filter on LLM-generated `components[]`
**Researched:** 2026-07-02
**Confidence:** MEDIUM (grounded primarily in direct codebase inspection of `middleware.ts`, `app/api/review/route.ts`, `app/api/review/undo/route.ts`, `components/StudySession.tsx`, `app/api/sync/route.ts`, `lib/extract-cards.ts`, `lib/sentence-match.ts`, `prisma/schema.prisma`; corroborated by LOW-confidence web search on general Vercel Cron / Prisma audit-log / optimistic-UI / Korean-morphology patterns — no single web source was authoritative enough to independently verify, so treat general claims as directional and the codebase-specific claims as the load-bearing ones)

## Critical Pitfalls

### Pitfall 1: Cron route falls under the existing auth matcher and gets 401'd by the app's own middleware — "fixed" by excluding it and forgetting the CRON_SECRET check

**What goes wrong:**
`middleware.ts` currently protects every path except `/login`, `/api/login`, and static/PWA assets, via a single negative-lookahead matcher requiring the `ks_auth` HMAC cookie. Vercel Cron does not send that cookie — it sends `Authorization: Bearer ${CRON_SECRET}`. A new `GET /api/cron/sync` route placed under the current matcher will 401 on every invocation, so the first "fix" developers reach for is widening the matcher's exclusion regex to skip the new route. If the `CRON_SECRET` check is not *also* added inside the route handler itself, the excluded route is now open to the public internet — anyone who finds the URL can `curl` it to trigger a real sync (burns Anthropic Opus tokens, writes lesson/card rows, can be hammered repeatedly since there's no other rate limit on `/api/sync`).

**Why it happens:**
The codebase's auth model is single-layered (one middleware gate, no per-route checks) — every existing route implicitly trusts the middleware to have already authenticated the request. Cron is the first case where a route must be *reachable without* the cookie but still *not open*, and that requires an explicit second auth mechanism the rest of the codebase has never needed. It's easy to solve "the 401" and stop there without re-adding equivalent protection inside the handler.

**How to avoid:**
- Keep the cron route matched by middleware's existing pattern OR exclude it — either way, check `req.headers.get('authorization') === \`Bearer ${process.env.CRON_SECRET}\`` **inside the route handler itself**, not only in middleware. Route-level checks are the actual security boundary here regardless of matcher configuration.
- Fail closed if `CRON_SECRET` is unset: `if (!process.env.CRON_SECRET) return 401` — never `if (process.env.CRON_SECRET && header !== expected)`, which silently disables auth entirely when the env var is missing (e.g. forgotten in Vercel prod env, or present only in Preview but not Production).
- Do not have the cron route `fetch()` the app's own `/api/sync` over HTTP (it would hit the cookie-gated middleware and 401 itself). Extract the sync body into a shared `lib/` function (matching this codebase's existing `lib/study-cards.ts`/`lib/dashboard.ts` extraction pattern) and call it directly from both `POST /api/sync` and the new cron handler.

**Warning signs:**
- Manually curling the cron path without any header returns 200 instead of 401.
- The matcher's negative-lookahead regex was edited to add the cron path but no `CRON_SECRET` string appears anywhere in the new route file.
- `CRON_SECRET` isn't set in Vercel's Production environment (only checked locally / in `.env`).

**Phase to address:**
The cron-sync phase, before wiring the actual sync-trigger logic — get auth right first since this route is reachable pre-login by design.

---

### Pitfall 2: `POST /api/review`'s retry loop double-applies FSRS state on the server, and adding a `ReviewLog` write there creates a duplicate log row for the same physical review

**What goes wrong:**
`submitReview` in `StudySession.tsx` is optimistic and fire-and-forget: it computes the FSRS result client-side, advances the UI queue immediately, and calls `void postReviewWithRetry(cardId, rating, onExhausted)` without awaiting it. `postReviewWithRetry` makes up to 3 attempts with an 8s per-attempt `AbortController` timeout, retrying on network error/5xx/timeout. Crucially, the server route (`POST /api/review`) is **not idempotent under retry**: it does `findUnique` to read *whatever CardReview state currently exists in the DB* and calls `reviewCard(cardReview, rating)` on it — it never receives or checks the client's already-computed result. If attempt 1 actually commits successfully server-side but the response is lost in transit (the classic "wrote successfully, ack didn't arrive" case that timeouts and aborts produce), the client's retry wrapper treats it as failed and fires attempt 2, which re-reads the *already-advanced* CardReview row and re-applies `reviewCard()` with the *same rating a second time* — corrupting the FSRS scheduling (an interval computed as if the card were reviewed twice) and, if `ReviewLog` insertion lives in this same route, writing two log rows for a single real study action.

This bug already exists today (before `ReviewLog`), but it's silent — nobody can see individual review events, only the current aggregate `CardReview` row, which absorbs the double-application without anyone noticing. `ReviewLog` is exactly the feature that makes this pre-existing bug visible and user-facing (a history page will show two "reviewed X" entries at the same timestamp for one tap).

**Why it happens:**
The retry wrapper was designed to make the *client's optimistic UI* resilient (REVIEW-04), not to make the *server write* idempotent — those are different problems, and the existing code only solved the first one. There is no idempotency key (e.g. a client-generated review-attempt UUID) threading through `postReviewWithRetry` → `POST /api/review` → a `ReviewLog` row that the server could use to deduplicate.

**How to avoid:**
- Give each review attempt a client-generated idempotency key (e.g. `crypto.randomUUID()` created once in `submitReview`, reused across all retry attempts for that one grading action) and pass it in the POST body.
- Make the `ReviewLog` insert `@@unique`-constrained on that key (or on `(cardId, clientReviewId)`) so a retried write becomes a Prisma `upsert`/no-op instead of a second row — this also protects the `CardReview` update: if the log write's uniqueness check fails, skip re-applying `reviewCard()` on that request.
- Wrap the `CardReview` update and the `ReviewLog` insert in a single `prisma.$transaction([...])` so a partial failure (log written, state not updated, or vice versa) can't happen — Turso/libSQL supports Prisma transactions.
- Do not build `ReviewLog` as a second best-effort `.catch(() => {})` write bolted onto the existing route with no relationship to the idempotency fix above — that reproduces the duplicate-row bug at the exact call site being added.

**Warning signs:**
- Two `ReviewLog` rows with the same `cardId` and near-identical `createdAt` (within the ~2s retry backoff window) appearing during normal (non-flaky-network) use.
- `CardReview.reps` incrementing by 2 for a single grade tap under a simulated slow/flaky connection (throttle network in devtools and grade a card during a Slow 3G profile to reproduce).

**Phase to address:**
The `ReviewLog` phase — this is the primary design decision for that phase, not a follow-on fix. Should be resolved before the history/view page is built, since the page's correctness depends on it.

---

### Pitfall 3: Undo racing an in-flight background retry silently "un-does" the undo

**What goes wrong:**
`handleUndo` POSTs to `/api/review/undo` with an absolute `prevState` snapshot (a set-to-exact-values write, not a delta) — this part is safe and idempotent by design. But `postReviewWithRetry`'s `AbortController` is created fresh *inside* the retry loop and is never exposed outside `submitReview` — there is no ref or handle `handleUndo` can use to cancel an in-flight retry attempt. If the user grades a card, the background save is mid-retry (e.g. attempt 2 of 3, waiting out its 1500ms backoff or an 8s timeout), and the user hits Undo before that attempt lands, two outcomes are both currently possible depending on arrival order at the server: (a) the undo POST lands first, restoring the pre-grade state, then the stale retry POST lands afterward and reads the just-restored row and reapplies `reviewCard(restoredState, rating)` — silently re-advancing the card past the state the user just undid, with zero UI indication anything happened; or (b) if `ReviewLog` logging is added to the retry path, this produces a `ReviewLog` row timestamped *after* the undo for a review the user explicitly reversed — a ghost entry on the history page for something that, from the user's perspective, never happened.

**Why it happens:**
`postReviewWithRetry` and `handleUndo` were built independently (different phases, per `PROJECT.md`'s Key Decisions) and neither is aware of the other's in-flight requests. The mount-guard (`isMountedRef`) protects against unmount races but not against undo-vs-retry ordering races, which is a different axis.

**How to avoid:**
- Hold the `AbortController` (or a per-card in-flight-request token) in a ref accessible to both `submitReview` and `handleUndo`; have `handleUndo` abort any in-flight retry for that `cardId` before firing the undo POST.
- If a `ReviewLog` write is added, prefer writing the log row only after the corresponding `CardReview` write has been confirmed successful server-side (same transaction, per Pitfall 2) — and have `POST /api/review/undo` also delete/mark-superseded any `ReviewLog` row it can identify as belonging to the state it's reverting (e.g. by the same idempotency key, if the client passes it to undo too).
- At minimum, document this as a known race in the `ReviewLog` phase rather than treating the pre-existing undo flow as unaffected — the question of "what does the history page show when undo is used" needs an explicit answer, not an implicit one.

**Warning signs:**
- Rapidly grade + immediately hit Undo on a throttled connection; check whether the card's `nextReview` reverts correctly after the retry's backoff window elapses (not just immediately after Undo).
- A `ReviewLog` row appears with a timestamp after a corresponding "undo" action for the same card.

**Phase to address:**
The `ReviewLog` phase (this is where the risk becomes visible/consequential); the underlying cancellation fix can be scoped as a small addition to `StudySession.tsx` alongside the `ReviewLog`-write wiring.

---

### Pitfall 4: Naive substring containment filtering drops nearly all grammar-pattern `components[]` and most conjugated-vocabulary components, because the filter and the text it checks against use different notations

**What goes wrong:**
`lib/extract-cards.ts`'s prompt is explicit that `components[]` entries are **base-form/abstract-notation lemmas** — `먹다` (dictionary form, not `먹어요`), `은/는`, and grammar patterns written as `~(으)면`, `~고 싶다`, `~아/어야 하다`. Meanwhile a card's own `sentences[].korean` text is **natural, fully conjugated Korean** (e.g. `저는 매일 학교에 가요`), and `notes` contains free-text explanation, not a checklist of forms. A deterministic filter that drops `components[]` entries not found verbatim (or as a simple substring) inside a card's own `sentences`/`notes` will filter out:
- Every grammar-pattern component, since `~(으)면` or `~고 싶다` (with `~`, parens, and spacing) never appears character-for-character in a natural sentence — the sentence has the pattern *inflected and attached to a stem* (e.g. `가면`, `먹고 싶어요`), not the abstract notation.
- Most conjugated-vocabulary components for the same reason `sentence-match.ts` already documents for `targetForm`/particle splitting: `먹다` as a component won't appear as the substring `먹다` inside a sentence like `먹어요` or `먹었어요`.

This is the exact class of problem `lib/sentence-match.ts`'s `splitParticle` already documents as unsolved ("orthographic ambiguity... no available morphological analyzer is error-free" per general Korean-NLP literature) — except here the mismatch is worse, because `components[]` isn't even surface-form Korean for grammar patterns, it's the app's own invented pattern notation (`~`/parens), which has no morphological relationship to conjugated sentence text at all. A naive filter would gut the very knowledge graph the milestone is trying to clean up — trading "some hallucinated edges" for "almost no edges."

**Why it happens:**
"Does the LLM's claimed prerequisite actually appear in the card's own material" sounds like a reasonable sanity check and maps naturally to `String.includes()`, but it silently assumes prerequisites are always literal vocabulary in citation form matching sentence surface forms — which contradicts the prompt's own documented convention (components are deliberately abstracted, not verbatim).

**How to avoid:**
- Do not check containment against **this card's own** sentences/notes at all as the primary signal — a card's prerequisites are typically words used *implicitly* to build understanding, not words that literally co-occur in its example sentences. The stronger, already-available signal is: does a `components[]` entry resolve to an *existing card* in the deck (via `normalizeFront()` → `CardDependency` matching, which `app/api/sync/route.ts` already does)? A hallucinated component is one that doesn't correspond to any real card and/or is nonsensical relative to the deck, not one that's merely absent from this card's own two sentences.
- If checking against sentence text specifically is still wanted (e.g. as one signal among several), separate the two component shapes and apply different logic: for grammar patterns (contains `~` or is wrapped in `~(...)`-style notation), strip notation and check for the *stem* using the same conservative particle/ending logic as `splitParticle` — never raw `includes()`. For vocabulary lemmas, check against the sentence's own `targetForm` (already extracted per-sentence) rather than raw substring search, since `targetForm` is the inflected form the extraction already committed to matching.
- Treat the deterministic filter as one input to a decision, not a hard drop-silently rule — log/flag filtered-out components (e.g. keep them in a `notes`-adjacent field or console warning during sync) so a wrongly-dropped legitimate prerequisite is discoverable and correctable, mirroring the existing `find-duplicates.mjs`/`relink-dependencies.mjs` pattern of "run a script to inspect and fix retroactively" rather than "silently mutate and hope."
- Test the filter explicitly against real grammar-pattern components (`~(으)면`, `~고 싶다`) pulled from the actual deck, not just plain vocabulary — the milestone context explicitly asks for this and it's the case most likely to be missed if development starts from vocabulary examples.

**Warning signs:**
- After the filter ships, `CardDependency` edge count drops sharply for `grammar`-type cards specifically (spot check with a query grouping edges by the dependent card's `type`).
- Running the filter against the existing corpus (dry-run, no writes) shows it would drop >50% of currently-linked components — a strong signal the filter is checking the wrong thing, not that the corpus is that hallucination-heavy.

**Phase to address:**
The extraction-filter phase — this should be the first thing validated (dry-run against the real corpus before wiring it into the write path), since `app/api/sync/route.ts`'s two-phase linking already runs after upsert and any filter inserted before that point needs to not regress the working parts of the existing dependency-resolution logic.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|-----------------|
| `ReviewLog` insert as a second best-effort `.catch(() => {})` write bolted onto `POST /api/review`, uncoordinated with the retry idempotency fix | Fast to ship, matches existing fire-and-forget style elsewhere in the codebase | Duplicate/missing rows under retry (Pitfall 2); undermines the log's value as a trustworthy history — a history page nobody can trust is worse than no history page | Never — this is the one place fire-and-forget is the wrong pattern, since the entire point of the feature is an accurate record |
| Cron route re-implements sync logic instead of calling a shared `lib/` function | Avoids touching `app/api/sync/route.ts` | Two copies of extraction/upsert/dependency-linking logic drift apart over time; violates the codebase's own established RSC/API-shared-`lib/` convention (`lib/study-cards.ts`, `lib/dashboard.ts`) | Never — extraction is a ~20 minute refactor and the convention already exists to copy |
| Post-extraction filter checks `card.front.includes(component)` / raw substring against sentences as "good enough" hallucination detection | Ships fast, no morphology work needed | Silently drops nearly all grammar-pattern and conjugated-vocabulary components (Pitfall 4), regressing the knowledge graph the milestone exists to fix | Never, given the prompt's documented notation convention — the mismatch is structural, not an edge case |
| `CRON_SECRET` check written as `if (secret && header !== expected)` (only enforced when the env var happens to be set) | Avoids breaking cron if the env var isn't configured yet in a given environment | Silently open endpoint in any environment where the var is unset (most dangerous in Production, the one that matters) | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Vercel Cron Jobs | Route handler implements `POST` (matching the app's other mutating routes) but `vercel.json`'s `crons[].path` is invoked by Vercel via `GET` — cron silently never fires (or 405s) in production | Implement the cron route as `GET`, verify against Vercel's cron docs/dashboard "Run" button in a Preview deployment before relying on the schedule |
| Vercel Cron Jobs | Testing only locally (`next dev`) and assuming it works — Vercel's cron scheduler only fires in Production, not in local dev or Preview | Use the Vercel dashboard's manual "Run" trigger on a deployed cron job to test end-to-end before waiting on the schedule; don't gate merge on local reproduction |
| Existing `middleware.ts` auth matcher | Widening the negative-lookahead exclusion pattern for the cron path via a broad glob (e.g. `api/cron.*`) that unintentionally also excludes future unrelated routes added under `/api/cron*` later | Scope the matcher exclusion to the exact literal cron path, not a wildcard prefix; re-verify the regex against the existing pattern each time a route is added nearby |
| Turso/libSQL DDL for `ReviewLog` | Running `prisma db push`/`migrate` against the `libsql://` URL (documented existing gotcha, but easy to re-trip on a brand-new table since it "feels like" a normal schema change) | Same manual DDL path as every other schema change in this repo: edit `schema.prisma` → `prisma generate` → `prisma migrate diff --from-empty --to-schema ... --script` → run only the new `CREATE TABLE` via `@libsql/client executeMultiple()` |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| `ReviewLog` history page does an unbounded `findMany()` with no `take`/cursor | Page load time grows monotonically with total lifetime review count; no symptom at launch | Cap the default query (e.g. most-recent 100 or a date-range window) and paginate/cursor beyond that, same posture as the existing `take: 1000` pool-query bound in `lib/study-cards.ts` | A single active daily user doing 3 sessions/day accumulates low-thousands of rows within a year — noticeable page slowdown is a matter of months, not a hypothetical |
| No index on `ReviewLog(cardId)` or `ReviewLog(createdAt)` | Per-card history lookups (if the card detail view ever shows "review history for this card") or the date-ordered history page do full table scans | Add `@@index([cardId])` and `@@index([createdAt])` in the same DDL step that creates the table — cheap to do upfront, expensive to retrofit against Turso later | Scales with total review count, same timeline as the trap above |
| Retry loop causes up to 3x write attempts per grade action if `ReviewLog` isn't idempotency-keyed | `ReviewLog` row count grows faster than actual review count under any network flakiness (mobile use, Vercel cold starts) | Idempotency key + unique constraint (see Pitfall 2) — this is a correctness fix that also happens to bound write amplification | Any session on a flaky connection, not scale-dependent |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Cron route reachable without a route-level `CRON_SECRET` check (relying on matcher exclusion alone, or on "nobody will guess the URL") | Anyone can trigger `/api/sync` externally — burns Anthropic Opus tokens per call, can corrupt lesson ordering if hammered repeatedly since `orderIndex` allocation reads `aggregate({_max})` per request | Explicit `Authorization: Bearer` check inside the route handler; fail closed when `CRON_SECRET` is unset |
| `CRON_SECRET` logged or echoed in an error response during debugging (e.g. `console.error` including the full request headers, or a 401 body that echoes what was received) | Low severity here (bearer token, not a DB credential) but still avoidable | Log only a boolean match/no-match, never the header value itself |
| `ReviewLog` exposed via a new `GET /api/review-log` (or similar) route added *outside* the existing middleware matcher by copy-pasting the cron route's exclusion pattern instead of leaving it under the default protected matcher | The history endpoint becomes publicly readable — leaks the user's full study history/timing patterns | New `ReviewLog` API routes should NOT be added to the middleware's exclusion list; they should inherit default cookie-gated protection exactly like every other existing `/api/*` route |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| History page renders every individual review row with no aggregation/filtering | Overwhelming wall of rows within weeks of daily use; hard to find anything meaningful | Default to a recent window (e.g. last 7/30 days) with drill-down, mirroring the existing `HabitHeatmap`'s `weeks`-parameterized pattern already established in this codebase |
| Cron sync runs silently once/day with no visible confirmation anywhere in the UI | If lesson-format edge cases repeatedly break extraction (as `SYNC-01`'s failure-naming work anticipated for manual sync), the user has no way to notice the deck has gone stale without opening Settings ▸ Advanced and manually syncing to see an error | Surface "last cron run" status (success/lesson-name-on-failure, reusing `lib/lesson-excerpt.ts`) somewhere visible — at minimum in the same Settings ▸ Advanced sync panel that already surfaces manual-sync failures |
| Undo silently "un-undoes" itself if a stale retry lands after it (Pitfall 3) with no visible error | User believes their undo worked; card scheduling quietly reverts again minutes later with zero feedback | At minimum, cancel in-flight retries on undo; if that's deferred, disable/hide Undo while a background save for that card is still in flight rather than allowing the race |

## "Looks Done But Isn't" Checklist

- [ ] **Cron route:** Confirm `vercel.json`'s `crons[].path` uses the HTTP method Vercel actually dispatches (GET) — a POST-only handler will silently never fire in production even though it works when manually curled locally with POST.
- [ ] **Cron auth:** Confirm the route 401s when `CRON_SECRET` is *unset*, not just when it's set-but-mismatched — test by temporarily removing the env var in a Preview deployment.
- [ ] **`ReviewLog` write:** Confirm it happens in the same transaction/request as the `CardReview` update it logs (not a decoupled best-effort call), and confirm it's idempotent under the existing 3-attempt retry wrapper — simulate with devtools network throttling + a slow-3G profile while grading a card.
- [ ] **Undo + retry interaction:** Confirm grading a card, letting a retry begin, then hitting Undo before the retry resolves does not silently re-apply the graded rating after the undo completes.
- [ ] **Post-extraction filter:** Confirm it's been dry-run (no writes) against the real existing corpus and does not drop grammar-pattern (`~(으)면`-style) components at a materially higher rate than plain vocabulary components — a large asymmetry there means the filter logic, not the corpus, is broken.
- [ ] **History page pagination:** Confirm the page doesn't fetch the full `ReviewLog` table unbounded — test with a seeded few-thousand-row table locally, not just the current (small) real dataset.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| `CRON_SECRET` leaked (committed, logged, or shared accidentally) | LOW | Rotate the value in Vercel env vars, redeploy — it's a bearer token, not a DB credential; no data was necessarily exposed unless the endpoint was actually invoked |
| Duplicate `ReviewLog` rows discovered post-launch (retry double-write) | MEDIUM | Write a one-off dedup script (`scripts/`-style, following the existing `find-duplicates.mjs` precedent) keyed on `(cardId, near-identical timestamp cluster)`; add the idempotency-key unique constraint retroactively before re-enabling writes |
| Post-extraction filter over-drops real prerequisite components on already-synced cards | LOW | The retroactive-rebuild pattern already exists for this exact class of problem — fix the filter logic, then re-run `scripts/relink-dependencies.mjs` (or an equivalent extended to re-derive `components[]` where the filter under-populated it) against the corpus |
| Cron job silently stopped firing (misconfigured path/method) discovered weeks later via a stale deck | LOW | Manually trigger `POST /api/sync` (or the shared `local-resync.mts` path) to catch up the backlog; fix the cron config; no data loss since `MAX_LESSONS_PER_SYNC=1` + `remaining` reporting already handles backlog draining gracefully |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Cron route open/unauthenticated (Pitfall 1) | Cron-sync phase | Curl the deployed cron path with no/wrong `Authorization` header → expect 401; with correct header → expect 200 and a real sync attempt |
| Retry double-applies FSRS + duplicate `ReviewLog` rows (Pitfall 2) | `ReviewLog` phase | Network-throttle + grade a card; assert exactly one `ReviewLog` row and one FSRS state transition per grade tap |
| Undo races an in-flight retry (Pitfall 3) | `ReviewLog` phase (or a small StudySession addition scoped alongside it) | Grade → immediately Undo before backoff elapses → assert final `CardReview`/`ReviewLog` state matches the pre-grade snapshot, not a re-applied rating |
| Naive substring filter drops grammar-pattern components (Pitfall 4) | Extraction-filter phase | Dry-run the filter against the real corpus; assert drop rate for `grammar`-type components is not dramatically higher than for `vocabulary`-type components; spot-check a handful of `~(으)면`-style patterns survive |

## Sources

- Direct codebase inspection: `middleware.ts`, `lib/auth.ts`, `app/api/review/route.ts`, `app/api/review/undo/route.ts`, `components/StudySession.tsx` (`postReviewWithRetry`, `submitReview`, `handleUndo`), `app/api/sync/route.ts` (two-phase dependency linking, `MAX_LESSONS_PER_SYNC`), `lib/extract-cards.ts` (components[] notation convention), `lib/sentence-match.ts` (`splitParticle` documented ambiguity), `prisma/schema.prisma` — HIGH confidence, primary source for all codebase-specific claims
- [Managing Cron Jobs — Vercel Docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — LOW confidence (single web search, not independently cross-verified), general CRON_SECRET bearer-header mechanism
- [How to Secure Vercel Cron Job routes in Next.js 14 — CodingCat.dev](https://codingcat.dev/post/how-to-secure-vercel-cron-job-routes-in-next-js-14-app-router) — LOW confidence, corroborating pattern only
- [Nextjs Middleware Matcher Exclude — Medium](https://medium.com/@turingvang/nextjs-middleware-matcher-exclude-e37b74f4a426) — LOW confidence, general matcher-exclusion pitfall pattern
- [Implementing Entity Audit Log with Prisma — Medium](https://medium.com/@gayanper/implementing-entity-audit-log-with-prisma-9cd3c15f6b8e) — LOW confidence, general audit-log-at-scale framing
- [SQLite + journal_mode=wal — Prisma GitHub Discussion #15966](https://github.com/prisma/prisma/discussions/15966) — LOW confidence, general SQLite write-volume caveat (not verified against Turso specifically)
- [Concurrent Optimistic Updates in React Query — tkdodo.eu](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) — LOW confidence, general optimistic-update race framing (this app doesn't use React Query, so only the conceptual idempotency-key point transfers)
- General web search on Korean morphology/agglutination and substring matching — LOW confidence, used only to corroborate the already-codebase-documented `splitParticle` ambiguity, not as an independent primary source

---
*Pitfalls research for: Korean Study v1.4 milestone (Vercel Cron sync, ReviewLog, extraction filter)*
*Researched: 2026-07-02*
