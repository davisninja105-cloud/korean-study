# Codebase Concerns

**Analysis Date:** 2026-07-05

## Tech Debt

**Complex JSON truncation handling in LLM extraction:**
- Issue: `lib/extract-cards.ts`'s `findLastTopLevelCardBoundary()` implements a depth-tracking parser to salvage truncated JSON responses from Claude when the model runs out of tokens mid-output.
- Files: `lib/extract-cards.ts` (lines 234–267, call sites at 281, 307)
- Impact: Salvage logic is relatively complex (220+ lines combined with parsing). If the JSON structure changes or nesting increases, the depth-tracking logic could fail silently, dropping partially-complete cards from a lesson without user visibility. Dense lessons over the token limit can still yield incomplete results.
- Fix approach: Unit test the truncation salvage logic explicitly with intentionally-truncated inputs at various nesting levels. Consider logging when salvage is triggered so the user knows some cards may be incomplete. Monitor token consumption in production to predict when truncation occurs.

**Prisma 7 + libSQL adapter unique-constraint error classification:**
- Issue: UNIQUE-constraint violations thrown inside an interactive `prisma.$transaction(async (tx) => {...})` callback surface as raw `DriverAdapterError` with `cause.kind: 'sqlite'`, not as a classified `Prisma.PrismaClientKnownRequestError` with `code: 'P2002'`. This was discovered during Phase 17 UAT and worked around, but the underlying issue remains in the driver/adapter interaction.
- Files: `lib/db-errors.ts` (single-source-of-truth workaround), `app/api/review/route.ts` (lines 149–153 show both P2002 check AND isUniqueConstraintError fallback)
- Impact: Error handling is now fragile — relies on a breadth-first traversal of error nested fields to detect constraint violations. If Prisma's error wrapping changes, the workaround may silently stop working. Array-form transactions (`prisma.$transaction([...])`) do not have this problem, so any future routes using interactive transactions face the same risk.
- Fix approach: Prefer array-form transactions where possible (they correctly classify errors). If interactive-form is necessary for read-then-conditional-write logic, ensure the custom error detector (`isUniqueConstraintError`) is tested against every constraint type used in that route, not just `idempotencyKey`. Monitor for Prisma/libSQL adapter updates that might resolve this upstream.

**Gloss cache unbounded insertion:**
- Issue: `lib/gloss.ts` caps gloss cache at `MAX_GLOSS_CACHE_ENTRIES = 2000` entries but the check is a soft limit — if the count is ≥2000 when `setCachedGloss` runs, the function silently returns without writing, but doesn't evict old entries either.
- Files: `lib/gloss.ts` (lines 40–57)
- Impact: Once 2000 entries are reached, no new glosses can be cached. Old entries are never evicted, so cache hits degrade over time if learners look up many unique words. The Setting table itself has no deletion strategy, so stale/corrupt gloss entries can accumulate indefinitely.
- Fix approach: Implement LRU eviction — track access order and delete oldest entries when at capacity. Alternatively, add a TTL to cached glosses (store a `createdAt` timestamp and expire entries after N days). Add a cleanup route to prune stale entries.

**StudySession.tsx component complexity:**
- Issue: The component is 964+ lines and owns three study modes (flashcard, multiple-choice, fill-blank), sentence selection, FSRS integration, activity tracking, undo logic, and retry handling for background saves.
- Files: `components/StudySession.tsx`
- Impact: High cognitive load during maintenance, difficult to unit test individual features, risk of cascading bugs when modifying state management or event handlers.
- Fix approach: Extract study modes into separate sub-components (`<FlashcardMode>`, `<MultipleChoiceMode>`, `<FillBlankMode>`). Move activity tracking to a custom hook. Extract retry logic into a service module.

## Known Bugs

**Undo racing with in-flight background retry:**
- Issue: `POST /api/review` submits asynchronously in the background via `postReviewWithRetry()` without exposing an AbortController to the undo handler. If a user grades a card and immediately hits Undo before the background retry completes, the retry's attempt may land after the undo POST, re-applying the graded state to a card that was already reverted.
- Files: `components/StudySession.tsx` (line 87 defines `postReviewWithRetry`, lines 218–226 store undo snapshot, lines 330+ define `handleUndo` which does NOT abort in-flight retries)
- Impact: Data corruption risk — card FSRS state can advance past a user-initiated undo, with zero UI indication. If ReviewLog is involved, a ghost review entry appears for an action the user explicitly reversed.
- Fix approach: Hold the `AbortController` for each card's in-flight review in a ref keyed by `cardId`, and have `handleUndo` abort any pending retry before firing the undo POST. Alternatively, have the undo POST include a flag that causes the server to abort any concurrent review for that card (race to the database), with the undo state winning.

**Sentence-match conservative particle-splitting limitations:**
- Issue: `lib/sentence-match.ts` (function `splitParticle`) can still mis-split multi-syllable verb stems with modifier endings (e.g. `기다리는` could be parsed as `기다리 + 는` or `기다 + 리는`), depending on how the function handles that specific ending. The codebase has no morphological analyzer, so this is a known limitation.
- Files: `lib/sentence-match.ts`, `components/HighlightedSentence.tsx`, `lib/sequence.ts` (uses the same logic for blank-safety)
- Impact: A sentence deemed "blank-safe" might still fail to render correctly if the substring-matching logic makes the wrong split, producing a wrong highlight or blank.
- Fix approach: Test `sentenceMatch()` against real card corpus data, especially grammar cards where particle attachment is ambiguous. If failures occur, consider adding a Korean morphological library (e.g. `node-mecab`, `hangul-js`), though this increases bundle size and external dependency risk.

**CardDependency edge resolution only works backward:**
- Issue: At sync time, Claude-generated `components[]` lemmas are resolved to CardIds via `normalizeFront()` lookup, creating directed edges. If a component refers to a card that doesn't exist in the deck yet (e.g., the prerequisite is taught in a later lesson), the edge silently fails to create. Re-running a full resync or using `relink-dependencies.mjs` fixes this, but it's a manual operation.
- Files: `lib/sync.ts` (lines 275–296), `lib/link-dependencies.ts`
- Impact: A learner's study session is missing prerequisite edges because the prerequisite card hasn't been synced yet. Foundation-first sequencing silently works with an incomplete graph.
- Fix approach: After creating edges for all lessons in a batch, run a second pass to detect any `components[]` entries that didn't resolve and log them as "forward references". Document the need to re-run `relink-dependencies.mjs` after a complete corpus sync.

**Known-lemmas query can fail silently:**
- Issue: `lib/study-cards.ts` (line 39) fetches the pool of due cards and the "known lemmas" set (cards with FSRS state ≥ 1) concurrently via `Promise.allSettled()`. If the known-lemmas query fails, it degrades to an empty Set (line 92), which means every sentence will report `unknownCount = total words - 1` (only the target word is "known"), losing ranking signals.
- Files: `lib/study-cards.ts` (lines 39–94)
- Impact: On a database query failure (temporary connection loss, busy database), sentence selection loses the "prefer sentences with known context" signal. Cards may be studied with unnecessarily difficult context, and the study experience degrades without user awareness.
- Fix approach: Log the known-lemmas failure so administrators can investigate. Implement a fallback cache (store the most-recent known-lemmas set in localStorage or a quick redis store) so a transient DB failure doesn't immediately degrade the signal. Consider returning 503 (Service Unavailable) instead of silently degrading for critical failures.

## Security Considerations

**Single-password authentication:**
- Risk: The app uses a single shared password (APP_PASSWORD) for all users. All access control is a single HMAC session cookie. If the password is compromised, all user data is accessible by anyone who knows it.
- Files: `lib/auth.ts`, `middleware.ts`, `app/api/login/route.ts`
- Current mitigation: HMAC is stateless and resistant to token forgery (requires AUTH_SECRET knowledge). The session cookie has no expiration (valid for the browser's lifetime).
- Recommendations: Add an optional session timeout (e.g., 30 minutes of inactivity). Implement rate limiting on `/api/login` to slow password-guessing attacks. Log authentication failures. Consider adding a second factor (e.g., TOTP) if multi-user access is added in the future.

**Cron auth bypass potential:**
- Risk: The `/api/cron/sync` route is excluded from the cookie-based middleware matcher and instead checks a `CRON_SECRET` bearer token. If `CRON_SECRET` is not set in production (env var missing, or only in Preview but not Production), the bearer-token check fails open — the route is still reachable without authentication.
- Files: `middleware.ts` (line 11–16), `app/api/cron/sync/route.ts` (line 18)
- Current mitigation: The cron route checks `if (!documentId)` and returns 500 if the env var is missing, preventing sync. But a clever attacker who sees this error can infer the auth check was skipped.
- Recommendations: Explicitly return 401 Unauthorized if `CRON_SECRET` is not set, not 500. Log all cron route access (successful and failed) separately from app logs. Verify `CRON_SECRET` is set in Vercel's Production environment during deployment.

**Gloss cache privacy leakage:**
- Risk: The gloss cache (`Setting` table with `gloss:` prefix keys) stores previously-resolved Korean words. If an attacker gains database access, they can infer which words the user has looked up, revealing study patterns.
- Files: `lib/gloss.ts`, `/api/gloss/preload` endpoint
- Current mitigation: The app is single-tenant and password-protected; database access requires breaking into Turso directly or compromising the app's database credentials.
- Recommendations: If multi-tenant access is added, ensure the gloss cache is scoped per-user (store userId or similar in the cache key). Consider clearing the gloss cache on logout. Document this privacy implication in the settings UI.

**No rate limiting on API routes:**
- Risk: Routes like `/api/sync`, `/api/review`, `/api/gloss` have no per-user or per-IP rate limits. A determined attacker can hammer these endpoints to burn Anthropic tokens (sync + gloss) or cause database load (review).
- Files: Multiple API route handlers
- Current mitigation: Single-tenant app with password protection; database rate-limiting depends on Turso's internal protections.
- Recommendations: Implement rate limiting middleware (e.g., using a rate-limit-safe library or Vercel's edge middleware) with a sliding-window bucket per IP/session. Set conservative limits (e.g., 10 syncs/hour, 100 reviews/minute, 300 gloss lookups/hour).

## Performance Bottlenecks

**Single lesson per sync due to Vercel Hobby 60-second timeout:**
- Problem: `MAX_LESSONS_PER_SYNC = 1` is hardcoded in `lib/sync.ts` (line 19) because Vercel Hobby plan hard-caps serverless functions at 60 seconds regardless of the `maxDuration` setting. Large lessons with exhaustive card extraction (Claude Opus + streaming) take 30–90 seconds each.
- Files: `lib/sync.ts` (line 19), `app/api/sync/route.ts` (line 7 documents `maxDuration = 300`)
- Impact: Syncing a large document with 20+ lessons requires 20+ separate sync taps. Users must repeatedly click "Sync" until `remaining = 0`. Bulk operations (e.g., a complete course import) are time-consuming.
- Improvement path: `local-resync.mts` bypasses this by running locally (no timeout), processing all lessons at once. Document this script as the recommended path for initial/bulk syncs. For production, evaluate upgrading Vercel plan (Pro plan allows up to 900 seconds). Alternatively, batch multiple lessons per-request by tracking elapsed time and aborting before the deadline.

**CardDependency query (full deck lookup on every sync):**
- Problem: After each lesson extraction, the sync route queries all cards to build a `normalizedFront → cardId` lookup map. On a 500+ card deck, this is expensive per lesson, and it happens for every lesson in the batch.
- Files: `lib/sync.ts` (lines 87–91)
- Cause: Two-phase linking needs the full deck to resolve forward references, and the map is built once per sync request (not per-lesson), but for large decks this is still a significant cost.
- Improvement path: Cache the lookup map across sync requests (store in a Setting row or a dedicated table). Pre-warm the cache during app startup. Consider building the map incrementally as cards are upserted, rather than upfront.

**Vercel Blob TTS cache misses fall back to browser speech:**
- Problem: If `/api/tts` returns non-200 (e.g., 503 when `KOREAN_BLOB_READ_WRITE_TOKEN` is unset, or a temporary Blob service outage), `AudioButton` falls back to `window.speechSynthesis` (ko-KR, rate 0.9). This fallback works but sounds robotic and loses the TTS provider's voice quality.
- Files: `components/AudioButton.tsx`, `lib/tts.ts`
- Impact: If Blob auth fails silently in production, learners hear the degraded browser voice instead of the configured TTS provider, without any indication that the premium TTS is down.
- Improvement path: Log TTS failures to the server so admins can detect Blob auth issues early. Show a toast notifying the user that TTS is temporarily unavailable (so they know it's not always this robotic). Cache the token validity and fail gracefully if it expires.

**RSC hydration assumes server query always succeeds:**
- Problem: Each RSC page calls an async server function (e.g., `getStudyCards()`) and passes the result directly to a client component. If the query fails (database down, Prisma error), the promise rejects and the entire page returns an error. There is no fallback UI (e.g., a "couldn't load" state) — the user sees a blank page or error boundary.
- Files: `app/cards/page.tsx`, `app/study/page.tsx`, `app/page.tsx`, `app/habits/page.tsx`
- Impact: A transient database failure makes the entire study/cards/home page unusable; the user must reload to retry.
- Improvement path: Wrap RSC fetches in try/catch and return a partial state on failure (e.g., `{ cards: [], error: 'Failed to load' }`). Pass the error to the client component and render a retry button. This is not done uniformly across the app.

## Fragile Areas

**LLM response format dependency:**
- Issue: Both `lib/extract-cards.ts` (Claude Opus) and `lib/gloss.ts` (Claude Haiku) assume the model returns a specific JSON structure. If Claude changes response format or omits expected fields, the JSON parsing will fail or return partial/malformed data.
- Files: `lib/extract-cards.ts` (lines 167–173, JSON validation at 185–197), `lib/gloss.ts` (lines 136–143, JSON extraction at 137)
- Trigger: Change in Claude's default response format, or a model version change that interprets the prompt differently
- Workaround: The extraction already has a `isValidExtractedCard` guard (lines 185–197) that drops malformed cards. The gloss lookup throws on parse failure, so Haiku failures bubble up to the caller. There is no automatic retry on format mismatch.
- Risk: Extraction can silently drop cards if Claude's output format drifts. Gloss lookups can fail entirely if Haiku returns non-JSON.

**Sentence-centric highlight logic:**
- Files: `lib/sentence-match.ts`, `components/HighlightedSentence.tsx`
- Why fragile: The rule "targetForm must be ≥2 chars and appear exactly once" protects against blanking a single-char particle or a word that appears twice. However, the implementation is conservative — it can still mis-split multi-syllable verb stems with modifier endings.
- Test coverage: No systematic tests against real grammar-card corpus data where particle attachment is ambiguous.

**Google Docs API rate limiting:**
- Risk: `lib/google-docs.ts` (line 100) fetches the Google Doc synchronously without rate-limit handling. If Vercel Cron runs every day and the document is large, Google Docs API rate limits (e.g., 300 requests/minute/project) could be hit.
- Impact: Sync fails with a 403 error from Google Docs API. No built-in retry logic; the sync must be manually retriggered.
- Mitigation path: Implement exponential backoff in `fetchGoogleDoc()` for 403/429 responses. Cache the fetched document (store the full response in a Setting row) so if the next sync hits a rate limit, it can re-use the cached copy. Add a `Last-Modified` check so re-fetches are cheap.

**CSS token consistency in dark mode:**
- Files: `app/globals.css`, `app/layout.tsx`
- Why fragile: Dark mode CSS tokens are defined in two places — inside `@media (prefers-color-scheme: dark)` and inside `:root[data-theme="dark"]`. If a token is added or updated, it must be mirrored in both places or dark mode will have inconsistent colors.
- Test coverage: Visual regression tests might catch this, but there are no explicit tests verifying token consistency across the two dark-mode paths.

**Sentence selection randomness is deterministic:**
- Files: `components/StudySession.tsx` (lines 182–191, 68–82)
- Why fragile: The seed is derived from the pool of due cards (line 183), so it's stable within a session but varies between sessions. For a learner who reviews the same card over many sessions, the sentence order is effectively deterministic across sessions.
- Impact: Learners may unconsciously memorize sentence order rather than meaning.

## Scaling Limits

**Gloss cache table unbounded growth:**
- Current capacity: Soft cap at 2000 `gloss:*` Setting rows; no TTL or eviction.
- Limit: Once 2000 entries are reached, new glosses stop being cached. The Setting table itself has no indexes on `key` prefix other than the primary key, so `startsWith` scans are O(n).
- Scaling path: Implement LRU eviction or TTL-based cleanup. Move gloss cache to a separate table with proper indexing (`CREATE TABLE GlossCache (word TEXT PRIMARY KEY, entry TEXT, createdAt DateTime)`).

**Study pool size capped at 1000 cards:**
- Current capacity: `lib/study-cards.ts` (line 56) fetches at most 1000 due cards per session.
- Limit: If a learner has >1000 cards due on a single day, only the first 1000 are considered for session selection. The remaining cards are inaccessible until a later session.
- Scaling path: Increase the cap to 10000 or higher if learner base grows. Monitor query performance; at 10000 cards, the per-session query cost grows but remains manageable on Turso.

**Prerequisite graph depth in sequencing:**
- Current capacity: DFS in `lib/sequence.ts` (lines 117–128) walks the entire prerequisite chain during sorting. No explicit depth limit.
- Limit: If a learner has a deep prerequisite chain (e.g., 20+ levels), DFS traversal scales linearly with depth. A circular dependency would be detected (visited-stack prevents infinite loops) but the DFS could still be expensive.
- Scaling path: Add memoization for depth (already done via `depthMemo`). Monitor real-world prerequisite graphs to see if depth exceeds 10 levels in practice. If circular dependencies arise, log them as data inconsistencies to be fixed via the offline `relink-dependencies.mjs` script.

**Sentence count per card (1–3 hardcoded max):**
- Current capacity: Cards have at most 3 sentences (capped in `lib/extract-cards.ts`, line 376).
- Limit: If a card needs more than 3 example contexts, only the first 3 are stored. The learner can't see additional perspectives.
- Scaling path: Increase the slice limit to 5–10 and let the UI paginate through sentences.

## Dependencies at Risk

**Claude API dependency for card extraction and gloss lookups:**
- Risk: Both extraction (Opus, exhaustive) and gloss (Haiku) rely on Claude API. If Anthropic has an outage or deprecates these models, the app cannot sync or provide tap-to-gloss.
- Impact: Extraction failures block lesson ingestion. Gloss failures fall back to corpus lookup or a 404, which is okay but degrades UX.
- Migration plan: Extract-cards already has a fallback corpus lookup (if normalizedFront exists in the deck, use that card's back field). Gloss has a three-tier fallback (corpus → cache → LLM). For extraction, maintain a local fallback prompt (e.g., Claude Mini or a smaller model) to keep syncs working at reduced quality if Opus is unavailable.

**Google Docs API availability:**
- Risk: `lib/google-docs.ts` (line 100) fetches the Google Doc synchronously. If Google Docs API has an outage, all syncs fail.
- Impact: No new lessons can be imported. Existing app data continues to work.
- Mitigation: Implement exponential backoff and a cached fallback (see Performance Bottlenecks above). Document manual import paths as a workaround (e.g., export-to-CSV then import).

**Vercel Blob TTS cache:**
- Risk: If Vercel Blob service has an outage or auth fails, TTS audio can't be cached. Falls back to browser speech synthesis.
- Impact: Degraded audio quality but still functional (via fallback).
- Mitigation: Implement local IndexedDB cache as a secondary fallback. Pre-generate TTS audio for common words during sync.

## Missing Critical Features

**No automatic cleanup of orphaned CardDependency edges:**
- Problem: If a card is deleted, its edges FROM the card (as a prerequisite) are not automatically pruned. A developer must manually run a cleanup script.
- Impact: Dead edges accumulate in the database, slowing foundation-first sequencing over time.
- Solution: Add a scheduled cleanup task (Vercel Cron) to prune CardDependency edges whose target card no longer exists. Or add an `ON DELETE CASCADE` to the `prerequisiteId` foreign key.

**No session timeout or rate limiting:**
- Problem: Routes like `/api/sync`, `/api/review`, `/api/gloss` have no rate limits. A malicious actor can spam requests.
- Impact: Cost overruns from repeated sync calls (Anthropic tokens). DoS risk.
- Solution: Implement per-IP/per-session rate limiting with sliding-window buckets.

## Test Coverage Gaps

**Untested LLM response handling:**
- What's not tested: Truncated JSON responses at various nesting levels (the salvage logic in `extract-cards.ts` is complex and handles depth-tracking).
- Files: `lib/extract-cards.ts` (lines 234–267 have no unit tests for truncation at depths 2, 3, 4, etc.)
- Risk: A future change to the prompt structure (e.g., adding nested arrays) could break the depth-tracking logic without detection.
- Priority: High.

**No end-to-end test of review undo racing with retry:**
- What's not tested: The race condition between `handleUndo` and an in-flight `postReviewWithRetry`. Current tests verify undo works in isolation, but not under network delay.
- Files: `components/StudySession.tsx` (no test simulates: grade card → POST /api/review starts but hasn't landed → user hits Undo immediately → retry POST lands after undo)
- Risk: Silent data corruption if this race occurs.
- Priority: High.

**API routes integration tests missing:**
- What's not tested: Sync, cards CRUD, review, activity, gloss, tts routes (all app/api/*.ts).
- Risk: Regressions in error handling, validation, database queries go unnoticed.
- Priority: High.

**Google Docs integration untested:**
- What's not tested: Tab discovery, emphasis capture, paragraph parsing.
- Files: `lib/google-docs.ts`
- Risk: Changes to the API response structure could silently break tab finder or emphasis capture.
- Priority: Medium.

---

*Concerns audit: 2026-07-05*
