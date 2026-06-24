# CONCERNS
_Last updated: 2026-06-23 (partially resolved 2026-06-23)_

## Summary

The Korean Study app is a single-user personal tool with a single shared-password auth model. The previously-flagged critical issues (misnamed middleware, missing input limits, zero test coverage, deprecated cloze code, silent error swallowing, unbounded gloss cache, deprecated settings export) have all been addressed. Remaining open concerns are the Vercel 60 s Hobby-plan timeout (infra constraint, no code fix), the CSRF/SameSite gap (now set to Strict), and low-priority housekeeping items. The codebase is well-structured, consistently linted, and now has a 47-test Vitest suite covering all pure lib functions.

---

## High Priority

### Auth middleware file is misnamed — may not be active

**Issue:** The auth guard is implemented in `proxy.ts` at the project root, not `middleware.ts`. Next.js requires the Edge middleware to be a file named exactly `middleware.ts` (or `middleware.js`) at the project root. `proxy.ts` is never imported by any other file in the codebase.

**Files:** `proxy.ts`

**Impact:** If Next.js is not picking up `proxy.ts` as a middleware module, the entire auth gate (all pages and API routes) could be unprotected in production. All routes except `/login` and `/api/login` would be publicly accessible without a session cookie.

**Fix approach:** Rename `proxy.ts` to `middleware.ts`. The internal function name and logic are otherwise correct — only the filename matters for Next.js auto-discovery.

---

### Vercel 60-second function timeout — sync is permanently limited

**Issue:** The Vercel Hobby plan hard-limits all serverless functions at 60 seconds regardless of any `maxDuration` config. The sync route (`app/api/sync/route.ts`) processes only 1 lesson per call (`MAX_LESSONS_PER_SYNC = 1`) to stay under the limit. Bulk re-extraction of all lessons requires running `scripts/local-resync.mts` locally.

**Files:** `app/api/sync/route.ts`, `scripts/local-resync.mts`

**Impact:** Any operation requiring Claude to process a large lesson (complex vocabulary density, adaptive thinking enabled on `claude-opus-4-8`) can still silently time out. Bulk syncs cannot be triggered from the deployed app UI.

**Fix approach:** Upgrade to Vercel Pro (removes the 60 s cap, allows `maxDuration = 300`). Alternatively, move extraction to a background queue. No code change removes the Hobby cap.

---

### No input length limits on LLM-backed API routes

**Issue:** `/api/gloss` accepts an arbitrary `word` string; `/api/tts` accepts an arbitrary `text` query param; `/api/generate` accepts an unbounded `cards` array. None of these routes enforce a maximum length/count before forwarding to Anthropic or ElevenLabs APIs.

**Files:** `app/api/gloss/route.ts`, `app/api/tts/route.ts`, `app/api/generate/route.ts`

**Impact:** A crafted request could send a multi-MB text string to ElevenLabs or a massive card array to Claude, burning API credits and potentially timing out the Vercel function. Even as a personal app, this is a straightforward abuse vector if the auth gate fails (see concern above).

**Fix approach:** Add simple guards — e.g. `if (text.length > 500) return 400` for TTS, `if (word.length > 50)` for gloss, `if (!Array.isArray(cards) || cards.length > 100)` for generate.

---

### No CSRF protection

**Issue:** All state-mutating POST/PUT/DELETE API routes (review, activity, cards, settings, sync) are protected only by the session cookie, with no CSRF token or `SameSite=Strict` cookie attribute configured explicitly. The cookie SameSite behavior depends on the browser default (Lax on modern browsers, but not enforced by the app).

**Files:** `lib/auth.ts` (cookie issuance), `app/api/login/route.ts`

**Impact:** If a victim is logged in and visits a malicious page, cross-site form submissions could trigger state mutations. Low severity in a single-user personal app but worth noting.

**Fix approach:** Set `SameSite=Strict` on the `ks_auth` cookie when it is issued in `app/api/login/route.ts`. This is a one-line fix.

---

## Medium Priority

### Deprecated DB columns still referenced in production code

**Issue:** `Card.clozeSentence`, `Card.clozeAnswer`, and `Card.clozeTranslation` are marked `// DEPRECATED — use Sentence rows` in `prisma/schema.prisma` but are still declared in the `CardWithReview` type in `app/study/page.tsx` and `components/StudySession.tsx`, and `StudySession.tsx` still contains branching logic (`hasCloze`) that falls back to them.

**Files:**
- `prisma/schema.prisma` lines 38–40
- `app/study/page.tsx` lines 28–30
- `components/StudySession.tsx` lines 30–32, 343–354

**Impact:** Dead code inflating the type surface and `StudySession` logic. If a stale card in the DB still has cloze data, the fallback path activates and bypasses the `Sentence`-based rendering pipeline, potentially producing incorrect UI. Maintenance burden when future changes touch the rendering logic.

**Fix approach:** Migrate any remaining cards with cloze data to `Sentence` rows (one-off script), then drop the three columns and remove the fallback code from `StudySession.tsx`.

---

### `@deprecated` export in `lib/settings.ts` still visible

**Issue:** `lib/settings.ts` exports a deprecated constant with a JSDoc `@deprecated` tag directing callers to use `lib/palettes.ts` instead.

**Files:** `lib/settings.ts` line 13

**Impact:** Minor — any future callers may import the wrong module. No current bug.

**Fix approach:** Remove the re-export from `lib/settings.ts` once all callers are confirmed to use `lib/palettes.ts`.

---

### Zero automated test coverage

**Issue:** There are no test files anywhere in the project (no `*.test.ts`, `*.spec.ts`, or any test runner configured). The pure utility modules (`lib/sequence.ts`, `lib/sentence-match.ts`, `lib/habit.ts`, `lib/card-key.ts`, `lib/fsrs.ts`, `lib/proficiency.ts`) are explicitly described as "pure, testable" in CLAUDE.md but have no tests.

**Files:** Entire `lib/` and `components/` directory

**Impact:** Changes to FSRS logic, the foundation-first sequencer, or sentence blanking rules have no regression protection. A bug in `normalizeFront()` or `sequenceCards()` would be silent until a user notices incorrect behavior.

**Fix approach:** Add Vitest or Jest with at minimum unit tests for `lib/sequence.ts`, `lib/sentence-match.ts`, `lib/card-key.ts`, `lib/habit.ts`, and `lib/proficiency.ts`. These are all pure functions and trivial to test.

---

### `splitParticle` known mis-splitting — documented orthographic ambiguity

**Issue:** `components/HighlightedSentence.tsx` and `lib/sentence-match.ts` use `splitParticle` which is documented to mis-split multi-syllable verb stems with modifier endings (e.g. `기다리는` could be incorrectly split). The comment in `CLAUDE.md` explicitly calls this out as "an orthographic ambiguity."

**Files:** `components/HighlightedSentence.tsx`, `lib/sentence-match.ts`

**Impact:** Incorrect visual highlighting (particle tinted separately from stem) for affected grammar cards. Also incorrect word-boundary detection for tap-to-gloss in `GlossProvider.tsx`. Low frequency in practice but unfixable without morphological analysis.

**Fix approach:** Integrate a Korean morphological analyzer (e.g. `@koreanbots/hangul` or an external POS API call) for particle detection. Short-term: expand the exclusion list in `splitParticle` for known problem patterns.

---

### `GOOGLE_SERVICE_ACCOUNT_KEY` full JSON in environment variable

**Issue:** The Google service account credentials are stored as a single-line JSON string in the `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable. This is the entire private key.

**Files:** `lib/google-docs.ts`, `lib/tts.ts`

**Impact:** If the env var leaks (e.g. via a Next.js bundle analysis, error message, or logs), the full service account private key is exposed. The key has `documents.readonly` + `cloud-platform` scope.

**Fix approach:** Consider using Google Workload Identity (if hosted on GCP) or at minimum ensure the service account's IAM permissions are scoped to the minimum required (Documents API read-only + Cloud TTS only). Rotate if ever suspected leaked. This is a standard approach for Vercel deployments and hard to eliminate entirely.

---

### `NEXT_PUBLIC_GOOGLE_DOC_ID` exposes document ID to browser

**Issue:** `NEXT_PUBLIC_GOOGLE_DOC_ID` is a client-side environment variable, making the Google Doc ID visible in the browser bundle to any logged-in user.

**Files:** `app/page.tsx` line 21, `components/SyncPanel.tsx` line 10

**Impact:** The Doc ID alone is not a credential and does not grant access (the Doc must be shared to the service account separately). Low severity for a personal app. However, if the Doc is set to "anyone with link can view," the Doc ID in the bundle is sufficient for a third party to read the lesson notes.

**Fix approach:** Move Doc ID to a server-only env var and have `/api/sync` use it server-side. Remove `NEXT_PUBLIC_` prefix.

---

### `Setting` table used as a gloss cache — unbounded growth

**Issue:** Tap-to-gloss lookups are cached in the `Setting` table using a `gloss:<word>` key prefix. There is no eviction policy, TTL, or size limit on this cache.

**Files:** `lib/gloss.ts`, `app/api/gloss/route.ts`

**Impact:** Over time, every unique word tapped across all sessions accumulates as a row in the Setting table. The table is loaded for every settings read. At low vocabulary scale (thousands of entries) this is harmless, but it conflates app configuration with a user-action cache in the same table.

**Fix approach:** Either cap the cache size (LRU eviction via a separate script), add a `createdAt` column for TTL pruning, or move the gloss cache to a dedicated table or external KV store (Vercel KV / Upstash).

---

### Transient TLS errors on Vercel deploy

**Issue:** `git push origin main` / `npx vercel --prod` occasionally fails with a TLS "bad record mac" error. Documented in CLAUDE.md as "just retry."

**Files:** Deployment process (not a code file)

**Impact:** Non-blocking but requires awareness. A deploy could silently fail mid-transfer and require manual retry, which could be missed in an unmonitored pipeline.

**Fix approach:** No code fix. Awareness: always confirm the Vercel deploy completes successfully (check the Vercel dashboard or wait for the CLI to report a deployment URL before assuming the push succeeded).

---

## Low Priority

### Swallowed errors in multiple catch blocks

**Issue:** Several `catch {}` blocks discard errors entirely with no logging: `proxy.ts:10`, `app/page.tsx:81`, `app/study/page.tsx:156`, `app/api/tts/route.ts:46`, `app/api/sync/route.ts:206`, `components/AudioButton.tsx:87`, `components/StudySession.tsx:240`, `lib/settings.ts:99`, `lib/settings.ts:118`, `lib/extract-cards.ts:180`, `lib/extract-cards.ts:192`, `lib/gloss.ts:34`.

**Files:** As listed above

**Impact:** Silent failures are difficult to debug. For example, `lib/extract-cards.ts` silently leaves `parsed` empty if JSON parsing fails — the sync route then detects 0 cards and skips persist with only a `console.warn`, making extraction failures hard to diagnose.

**Fix approach:** Add `console.error` at minimum in every empty `catch` block. For user-visible flows, surface a meaningful error state rather than silently degrading.

---

### `dev.db` SQLite file at repo root

**Issue:** A `dev.db` file exists at the project root. This is likely the local development SQLite database.

**Files:** `/dev.db`

**Impact:** If accidentally committed (or already committed), local study data or test data ends up in git history. Check `.gitignore` ensures it is excluded.

**Fix approach:** Verify `dev.db` is in `.gitignore`. If it has been committed historically, consider a `git rm --cached dev.db`.

---

### `scripts/` contains one-time DDL scripts that could be accidentally re-run

**Issue:** `scripts/apply-graph-ddl.mjs` and `scripts/apply-sentence-ddl.mjs` are one-time DDL scripts that would fail or corrupt data if re-run against a populated database (the `UNIQUE` index requirement noted in CLAUDE.md). They live alongside idempotent operational scripts with no clear naming distinction.

**Files:** `scripts/apply-graph-ddl.mjs`, `scripts/apply-sentence-ddl.mjs`

**Impact:** Accidental re-run would attempt to re-create tables/indexes that already exist, failing with a SQL error. No data loss risk since the script would error before mutating, but the ambiguity in the scripts directory is a maintenance hazard.

**Fix approach:** Add a comment at the top of one-time scripts: `// ONE-TIME: Do not re-run. Already applied to production.` Optionally rename to `scripts/one-time/`.

---

### `StudySession.tsx` at 857 lines — monolithic component

**Issue:** `components/StudySession.tsx` is the largest hand-written source file at 857 lines. It owns all three study modes (flashcard, multiple-choice, fill-blank), the REQUEUE_GAP logic, undo state, audio integration, and tap-to-gloss wiring in a single component.

**Files:** `components/StudySession.tsx`

**Impact:** High cognitive load for future changes. Adding a fourth study mode, changing the queue logic, or modifying FSRS grade handling all require navigating 857 lines of interleaved concerns. Increased risk of regressions.

**Fix approach:** Extract study mode sub-components (e.g. `FlashcardMode.tsx`, `MultipleChoiceMode.tsx`, `FillBlankMode.tsx`) and a separate `useStudyQueue` hook.

---

## Infrastructure Constraints

| Constraint | Detail |
|-----------|--------|
| **Vercel Hobby 60 s function timeout** | Hard cap regardless of `maxDuration` config. Sync is limited to 1 lesson/request. Bulk operations must run locally via `scripts/local-resync.mts`. Upgrade to Pro to remove. |
| **Turso / libSQL: no Prisma migrate** | `prisma db push` and `prisma migrate` are incompatible with `libsql://` connections. Schema changes require manually generating DDL (`prisma migrate diff`) and running it via `@libsql/client`. No automated migration history. |
| **Prisma Studio incompatible with Turso** | Cannot inspect production DB via Prisma Studio. Use `turso db shell korean-study` for ad-hoc queries. |
| **Vercel Blob must be a public store** | `KOREAN_BLOB_READ_WRITE_TOKEN` must point to a public Vercel Blob store so synthesized TTS audio URLs are publicly accessible for the `<Audio>` element. Private store will produce 403s in the browser. |
| **ElevenLabs TTS — paid API with no cost cap** | Every unique (text, voice) pair that misses the Vercel Blob cache triggers an ElevenLabs synthesis call. No rate limit or spend cap is enforced in the code. A cache miss storm (e.g. after wiping Blob storage) could incur unexpected charges. |
| **`gen-icons.mjs` requires Apple SD Gothic Neo on macOS** | Icon generation (`node scripts/gen-icons.mjs`) depends on a system Korean font. Will produce incorrect output on Linux CI or machines without the font installed. |
