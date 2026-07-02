# Codebase Concerns

**Analysis Date:** 2026-07-02

## Tech Debt

### StudySession.tsx Component Size
- **Issue:** Single component file is 964 lines; owns three study modes (flashcard, multiple-choice, fill-blank), sentence selection, FSRS integration, activity tracking, undo logic, and UI rendering.
- **Files:** `components/StudySession.tsx`
- **Impact:** Difficult to test in isolation, high cognitive load during maintenance, risk of side-effect bugs when adding features.
- **Fix approach:** Break into smaller sub-components: `<FlashcardMode>`, `<MultipleChoiceMode>`, `<FillBlankMode>`. Extract sentence logic into a pure hook/module. Move activity tracking to custom hook.

### Optimistic Review Submission (Fire-and-Forget Save)
- **Issue:** `submitReview()` in `StudySession.tsx` updates client state immediately, then fires a background `POST /api/review` that is not awaited (`.catch(() => {})`). If the save fails silently, the client and server become out of sync.
- **Files:** `components/StudySession.tsx` (line ~474-478), `app/api/review/route.ts`
- **Impact:** User loses the review if network fails or server is down. Undo won't work correctly if the background save already partially succeeded. No user feedback on failure.
- **Fix approach:** Show a subtle "saving…" indicator. If `/api/review` fails, either queue for retry or roll back the optimistic state and notify the user. At minimum, log the error and surface it in a toast.

### Missing Error Handling in `/api/review` Route
- **Issue:** No `try/catch` wrapper around Prisma queries; any database error will throw an unhandled 500.
- **Files:** `app/api/review/route.ts`
- **Impact:** Inconsistent with other API routes (activity, cards, etc. all have error handling). Silent failures if the route crashes.
- **Fix approach:** Add `try/catch` around the Prisma calls with a proper error response.

### No Validation of Review Rating
- **Issue:** Review route does not validate that `rating` is in the range 1–4 (the valid FSRS grades).
- **Files:** `app/api/review/route.ts`
- **Impact:** Sending an invalid rating (e.g., `rating: 99`) will be passed to `reviewCard()`, potentially causing undefined FSRS behavior or a throw.
- **Fix approach:** Validate `rating in [1, 2, 3, 4]` before calling `reviewCard()`.

## Known Bugs

### Blank-Safety Guarantee Not Enforced
- **Symptoms:** If Claude's extraction prompt fails to meet the blank-safety guarantee (first sentence for every card must have targetForm 2+ chars, exactly once), fill-blank and Recall modes will either fail silently or show un-highlighted text.
- **Files:** `lib/extract-cards.ts` (prompt), `components/StudySession.tsx` (sentence selection)
- **Trigger:** Lessons where the tutor's sentence examples don't meet the safety criteria (e.g., single-char particles, ambiguous matches).
- **Workaround:** Manual card edit to add a blank-safe sentence. The prompt is exhaustive but not infallible.

### Card Front Normalization Race Condition
- **Symptoms:** If a user edits a card's `front` to a value that normalizes to an existing card's `normalizedFront`, the update will fail with a unique constraint violation (uncaught).
- **Files:** `app/api/cards/[id]/route.ts` (line 20-22), `lib/card-key.ts`
- **Trigger:** Edit card A's front to match (after normalization) an existing card B's front.
- **Workaround:** The UI doesn't prevent this; user sees a generic server error.
- **Fix approach:** Check for `normalizedFront` collision before update. Return a 400 with a user-friendly message like "This front already exists (as a different variant of another card)."

### Undo State Restoration Incomplete
- **Symptoms:** If `POST /api/review/undo` succeeds but the client-side state restoration is interrupted (e.g., component unmounts), some state (queue, seenCardIds, stats) may be left partially restored.
- **Files:** `components/StudySession.tsx` (line 511-540)
- **Impact:** Session stats or queue order could be inconsistent. Unlikely in normal use but possible if user navigates away during undo.
- **Fix approach:** Batch the state updates into a single `setState` callback or use a reducer to make it atomic.

## Security Considerations

### HMAC Auth Token Recomputation on Every Request
- **Risk:** `middleware.ts` computes `computeAuthToken()` for every request. If `AUTH_SECRET` is ever compromised, an attacker can forge valid cookies.
- **Files:** `middleware.ts`, `lib/auth.ts`
- **Current mitigation:** `AUTH_SECRET` is a single shared password; token is deterministic (no nonce or timestamp).
- **Recommendation:** Consider adding a timestamp or request ID to the HMAC so tokens are time-bound (e.g., valid for 1 hour). This is low-priority for a personal app.

### No Rate Limiting on `/api/sync`
- **Risk:** A malicious actor with the password could spam `/api/sync` calls to exhaust Vercel quota or Google Docs API quota.
- **Files:** `app/api/sync/route.ts`
- **Current mitigation:** Single-tenant app with a shared password; Vercel Hobby plan function timeout caps the damage.
- **Recommendation:** Add a basic rate limit (e.g., one sync per 5 minutes) or check the last sync time in Settings.

### Google Service Account Key in `.env.local`
- **Risk:** If `.env.local` is ever committed or exposed, the service account's identity is leaked.
- **Files:** `.env.local` (not committed, but exists locally)
- **Current mitigation:** `.gitignore` protects the file; GCP scopes limit what the key can do.
- **Recommendation:** Already in place; no action needed unless the key is rotated.

### TTS Blob Token Exposure
- **Risk:** `KOREAN_BLOB_READ_WRITE_TOKEN` (Vercel Blob) is used to cache audio. If leaked, an attacker can read/write arbitrary blobs.
- **Files:** `app/api/tts/route.ts`, `.env.local`
- **Current mitigation:** Token is only used server-side; blob access is set to `public` so the URLs themselves are already public.
- **Recommendation:** Use a read-only token if Vercel Blob supports it. Rotate the token annually.

## Performance Bottlenecks

### Sync Extraction Per-Lesson (1 lesson per request)
- **Problem:** Each `/api/sync` processes only 1 lesson to stay under Vercel's 60-second timeout. A 20-lesson backlog requires 20 sync taps, each taking 60–120s.
- **Files:** `app/api/sync/route.ts` (line 18), `lib/extract-cards.ts`
- **Cause:** Claude Opus + exhaustive extraction is slow; the prompt is large (32k tokens max); adaptive thinking adds latency.
- **Improvement path:** Consider batching 2–3 lessons per request if extraction time can be reduced. Cache the existing normalized fronts so the hint list is smaller for subsequent lessons. Use a background job queue (e.g., Vercel Cron, Bull) instead of per-request processing.

### CardDependency Query (Full Deck Lookup on Every Sync)
- **Problem:** After each lesson extraction, the sync route queries all cards with components (line 193–196 in sync route) and builds a full `Map` to resolve dependencies. On a 500+ card deck, this is expensive per lesson.
- **Files:** `app/api/sync/route.ts` (line 187–231)
- **Cause:** Two-phase linking needs the full deck to resolve forward references.
- **Improvement path:** Cache the `normalizedFront → cardId` map during the sync request, or build it incrementally per-lesson.

### GlossProvider In-Memory Cache Not Persistent
- **Problem:** Gloss lookups are cached in a `useRef<Map>` which is cleared on page reload or navigation. Popular words are re-fetched from the LLM every session.
- **Files:** `components/GlossProvider.tsx`, `lib/gloss.ts`
- **Cause:** Session-scoped memory cache; database cache (`Setting` table) is only written asynchronously.
- **Improvement path:** Pre-populate the cache from the database on mount. Use `localStorage` for a user-local persistent cache (separate from Settings which is for app config).

### Sentence Selection Loop (Per-Card, Every Review)
- **Problem:** `chosenIdx` calculation in `StudySession.tsx` (line 326–347) iterates through all sentences to find unknownCount tiers. On a card with 3 sentences, this is fine; but the logic runs during render.
- **Files:** `components/StudySession.tsx` (line 326–347)
- **Cause:** Pure computation is good, but could be memoized.
- **Improvement path:** Memoize the calculation with `useMemo` keyed by `[cardSentences, realCard?.review?.reps]`.

## Fragile Areas

### Card Editor Sentence Editing
- **Files:** `components/CardEditor.tsx`, `app/api/cards/[id]/route.ts`
- **Why fragile:** Sentence updates use an atomic transaction `prisma.$transaction([deleteMany, …create])`, but if the API response is lost after the update succeeds, the client won't know the new state. Also, no client-side validation that targetForm actually appears in korean.
- **Safe modification:** Before persisting, validate every sentence with `sentenceMatch()` to ensure targetForm is found and warn if not blank-safe.
- **Test coverage:** No tests for sentence CRUD operations.

### Google Docs API Tab Discovery
- **Files:** `lib/google-docs.ts` (line 124–141)
- **Why fragile:** Recursive tab search assumes all nested tabs are accessible; if a tab is locked or deleted, the function throws with no fallback. Also, the tab title match is exact-string (`.trim() ===`), so a tab with a trailing space won't match.
- **Safe modification:** Add tolerance for leading/trailing whitespace normalization. Catch tab-not-found and return a more helpful error listing available tabs.
- **Test coverage:** No tests for the Google Docs integration.

### Activity Logging Race Condition
- **Files:** `components/StudySession.tsx` (activity flush), `app/api/activity/route.ts`
- **Why fragile:** Multiple `POST /api/activity` calls from rapid session changes could race; the `upsert` with `increment` should be atomic, but concurrent increments could lose data if Prisma batches incorrectly.
- **Safe modification:** Ensure the database lock/transaction is held across the read-modify-write cycle. Verify with libSQL adapter.

### GlossProvider Portal Mount
- **Files:** `components/GlossProvider.tsx` (createPortal call)
- **Why fragile:** The popover portal mounts to `document.body`, but there's no guarantee `document.body` exists or won't be removed during the component lifecycle.
- **Safe modification:** Move the portal to a stable ref or guard against missing DOM.

## Scaling Limits

### Sentence Count Per Card
- **Current capacity:** 1–3 sentences per card (hardcoded max in `lib/extract-cards.ts`).
- **Limit:** If a card has 4+ potential example sentences, only the first 3 are stored. The learner can't see additional contexts.
- **Scaling path:** Increase the slice limit to 5–10 and let the UI paginate. Update the sentence rotation logic to handle more.

### Card Distractors Fallback
- **Current capacity:** 3 distractors per card. If fewer than 3 are generated, the system scrapes other cards' answers (line 250–257 in `StudySession.tsx`).
- **Limit:** On a small deck (<20 cards), fallback distractors may repeat or be irrelevant.
- **Scaling path:** As the deck grows, distractor quality improves. Pre-compute and cache distractors at sync time for all cards, not just extracted ones.

### Dependency Graph Depth
- **Current capacity:** No explicit limit. The sequence algorithm applies `depth − urgencyBoost` where depth is the longest in-session prereq chain.
- **Limit:** A deep dependency chain (e.g., 10+ levels) could cause a lesson to be permanently blocked if a root prerequisite is due.
- **Scaling path:** Cap the depth boost or implement a timeout on the prerequisite expansion in `selectSessionCards()`.

## Dependencies at Risk

### Claude API Model Pinning
- **Risk:** The app uses `claude-opus-4-8` for extraction (line 51 in `lib/extract-cards.ts`). If Anthropic deprecates this model, syncs will break.
- **Impact:** Extraction will fail; no new cards can be created.
- **Migration plan:** Add a fallback model (e.g., `claude-3-5-sonnet`) as a config option. Test the prompt with the fallback before Opus is sunset.

### Google Docs API v1
- **Risk:** Google deprecates APIs; v1 could be sunset.
- **Impact:** Sync will fail to fetch the document.
- **Migration plan:** Keep an eye on Google's API roadmap. The Docs API is mature and unlikely to be removed soon, but plan a migration to v2 if it becomes available.

### Vercel Blob Public Access
- **Risk:** If Vercel Blob changes its public access model, TTS audio URLs could become private.
- **Impact:** `AudioButton` won't load cached audio.
- **Migration plan:** Store MP3s in a dedicated S3 bucket with explicit public ACLs, or embed audio as data URIs for small files.

## Missing Critical Features

### No Explicit Sync Failure Reporting
- **Problem:** If a lesson fails to extract, the UI shows a generic "remaining" count but doesn't highlight which lessons failed. The user has to retry all remaining lessons to find out which one is problematic.
- **Blocks:** Debugging stalled syncs; knowing if the tutor's doc is malformed.
- **Fix:** Persist failed lesson indices or excerpts in the response and display them in the SyncPanel.

### No Background Sync / Scheduled Sync
- **Problem:** All syncs are triggered by user taps. If the user forgets to sync for a week, the content is stale.
- **Blocks:** Keeping the deck fresh without manual intervention.
- **Fix:** Add a Vercel Cron job (`app/api/cron/sync`) that runs daily (or weekly) and processes up to N lessons.

### No Card Retirement / Mastery
- **Problem:** Once a card reaches a high FSRS state, it's still studied. There's no way to "graduate" a card as truly mastered and remove it from the due pool.
- **Blocks:** Long-term learners can't reduce session size as they progress.
- **Fix:** Add a `mastered` boolean flag to Card. Filter out mastered cards from the due pool. Allow manual un-mastery.

### No Study History / Review Log
- **Problem:** Activity is tracked at the day level (StudyDay), but individual card reviews are not logged. The user can't see which cards they reviewed on a specific date.
- **Blocks:** Analyzing learning patterns, debugging spacing algorithm, exporting review data.
- **Fix:** Add a `ReviewLog` table with timestamp, cardId, rating, newState.

## Test Coverage Gaps

### API Routes Untested
- **Untested area:** All `app/api/*/route.ts` files (sync, cards, review, activity, tts, gloss, etc.).
- **Files:** `app/api/**/*.ts`
- **Risk:** Regressions in error handling, validation, database queries go unnoticed.
- **Priority:** High — API routes are the source of truth.
- **Recommendation:** Add integration tests using `vitest` with a test database (or in-memory SQLite). Mock external APIs (Google, Anthropic, Vercel Blob).

### UI Components Not Tested
- **Untested area:** All client components (StudySession, CardsClient, GlossProvider, AudioButton, etc.).
- **Files:** `components/**/*.tsx`
- **Risk:** Regressions in interactivity, state management, edge cases (e.g., empty card lists, network failures).
- **Priority:** Medium — high user-facing complexity, but users can catch bugs faster than integration tests.
- **Recommendation:** Add snapshot and interaction tests with `vitest` + `@testing-library/react` for critical components (StudySession, CardsClient).

### Google Docs Fetching Untested
- **Untested area:** Tab discovery, emphasis capture, paragraph parsing.
- **Files:** `lib/google-docs.ts`
- **Risk:** Changes to the API response structure could silently break the tab finder or emphasis capture.
- **Priority:** Medium — unlikely to change, but high-impact if broken.
- **Recommendation:** Add unit tests with mock Google Docs API responses.

### Extraction Prompt Not Validated
- **Untested area:** Claude's extraction prompt; only tested via live sync.
- **Files:** `lib/extract-cards.ts`
- **Risk:** Prompt drift; Claude returns malformed JSON or violates schema.
- **Priority:** Medium — the prompt is guarded by JSON parsing, but silent truncation could occur.
- **Recommendation:** Add a test that calls `extractCardsFromNotes()` with a real lesson and validates the output schema.

### Sequence Algorithm Edge Cases Partially Tested
- **Untested area:** Circular dependency detection, depth calculation on deep graphs.
- **Files:** `lib/sequence.ts`
- **Coverage:** Basic tests exist in `tests/sequence.test.ts`, but no tests for cycle safety or max-depth scenarios.
- **Priority:** Low — the algorithm is pure and unlikely to regress, but adding a few edge-case tests would increase confidence.

---

*Concerns audit: 2026-07-02*
