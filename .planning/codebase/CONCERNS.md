# CONCERNS
_Last updated: 2026-07-01 (v1.2 Performance & Snappiness) — re-verified against current source_

## Summary

The Korean Study app is a single-user personal tool with a single shared-password auth model. All the concerns previously flagged as "High Priority" are confirmed resolved as of this pass: `middleware.ts` is present and active (no `proxy.ts` in the repo), input length limits exist on all three LLM-backed routes, the deprecated cloze-column fallback code is gone from `app/` and `components/` (the v1.2 RSC rewrite of `app/study/page.tsx` removed it along with everything else that used to live there), the `Setting.ts` deprecated re-export is gone, and the auth cookie is `sameSite: 'strict'`. The 58-test Vitest suite (see `.planning/codebase/TESTING.md`) covers the pure `lib/` modules. Remaining open concerns are the Vercel 60 s Hobby-plan timeout (infra constraint, no code fix), the unbounded gloss cache, and the growing `StudySession.tsx` monolith — now 964 lines after v1.2 added the optimistic-grading logic on top.

---

## Resolved Since Last Audit (2026-06-23 → 2026-07-01)

Verified against current source — these no longer need tracking as open concerns:

| Item | Verification |
|------|--------------|
| Middleware misnamed (`proxy.ts` vs `middleware.ts`) | `middleware.ts` exists at project root; no `proxy.ts` in the repo |
| No input length limits on LLM-backed routes | `app/api/gloss/route.ts` (word ≤ 50 chars), `app/api/tts/route.ts` (text ≤ 500 chars), `app/api/generate/route.ts` (cards.length ≤ 100) all guard and return 400 |
| No CSRF / SameSite protection | `app/api/login/route.ts:19` sets `sameSite: 'strict'` on the auth cookie |
| Zero automated test coverage | 58 Vitest tests across 6 files in `tests/` — see `.planning/codebase/TESTING.md` |
| Deprecated cloze columns still referenced in app code | No `clozeSentence`/`clozeAnswer`/`clozeTranslation`/`hasCloze` references remain in `app/` or `components/` (only in the auto-generated Prisma client, which is expected) — removed as a side effect of the v1.2 RSC rewrite of `app/study/page.tsx` |
| `@deprecated` export in `lib/settings.ts` | No `@deprecated` tag found in the file |
| `dev.db` accidentally committed | Gitignored (`dev.db`, `dev.db-journal`, `*.db`) and not tracked in git |

---

## High Priority

### Vercel 60-second function timeout — sync is permanently limited

**Issue:** The Vercel Hobby plan hard-limits all serverless functions at 60 seconds regardless of any `maxDuration` config. The sync route (`app/api/sync/route.ts`) processes only 1 lesson per call (`MAX_LESSONS_PER_SYNC = 1`) to stay under the limit. Bulk re-extraction of all lessons requires running `scripts/local-resync.mts` locally.

**Files:** `app/api/sync/route.ts`, `scripts/local-resync.mts`

**Impact:** Any operation requiring Claude to process a large lesson (complex vocabulary density, adaptive thinking enabled on `claude-opus-4-8`) can still silently time out. Bulk syncs cannot be triggered from the deployed app UI.

**Fix approach:** Upgrade to Vercel Pro (removes the 60 s cap, allows `maxDuration = 300`). Alternatively, move extraction to a background queue. No code change removes the Hobby cap.

---

### RSC paint-timing and interaction-jitter claims lack systematic browser verification *(new, v1.2)*

**Issue:** v1.2 introduced several success criteria that are runtime, human-observable properties — "no blank flash on first paint," "no perceptible jitter between grade tap and next card" — which cannot be checked by `tsc`, ESLint, or the Vitest suite. Of the 4 v1.2 phases, only 2 (Study, Home/Habits) got an actual live browser/UAT pass verifying these claims before milestone close; Phase 9 (skeletons) and Phase 10 (Cards RSC) shipped with these claims resting on static code analysis only.

**Files:** `app/cards/page.tsx`, `app/cards/loading.tsx` (Phase 9/10 — no live UAT run); see `.planning/milestones/v1.2-phases/10-cards-hydration-api-parallelization/10-VERIFICATION.md` for the specific unverified items.

**Impact:** Low — the code paths are confirmed present and correctly wired by static analysis, and the identical pattern was live-verified in Phases 11 and 12. But a genuine RSC hydration-order bug in `/cards` specifically would not have been caught before shipping.

**Fix approach:** Run `npm run build && npm start`, open `/cards` with a hard reload and disabled cache, and confirm the real card list renders with no "No cards yet" flash and no console serialization errors — the two specific checks listed in `10-VERIFICATION.md`.

---

## Medium Priority

### `StudySession.tsx` monolith continues to grow

**Issue:** `components/StudySession.tsx` was already the largest hand-written source file at 857 lines (as of the 2026-06-23 audit); v1.2's optimistic-grading rework (synchronous `submitReview`, client-side FSRS via `reviewCard()`, undo-snapshot handling) added to it rather than extracting a new module. It is now **964 lines**.

**Files:** `components/StudySession.tsx`

**Impact:** Same as previously noted — high cognitive load for future changes, increased regression risk. The gap between "largest file" and "next largest" has widened further.

**Fix approach:** Unchanged from the prior recommendation — extract per-mode sub-components (`FlashcardMode.tsx`, `MultipleChoiceMode.tsx`, `FillBlankMode.tsx`) and a `useStudyQueue` hook. Not urgent, but worth revisiting before the next feature that touches this file.

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

**Files:** `components/HomeClient.tsx` (moved here from `app/page.tsx` during the v1.2 RSC conversion), `components/SyncPanel.tsx`

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

### Swallowed errors in some catch blocks

**Issue:** A number of `catch {}` / `catch (err) {}` blocks across the codebase discard errors with no `console.error` logging (e.g. `app/api/activity/route.ts`, `app/api/tts/route.ts`, `app/api/stats/route.ts`, `app/login/page.tsx`, `components/AudioButton.tsx`, `components/StudySession.tsx`). This is a broad pattern, not confined to any one file — re-scan with `grep -rn "} catch\s*{$\|} catch (.*) {$"` across `app/`, `components/`, `lib/` before acting rather than relying on a fixed line-number list (30+ files changed since this was last enumerated, and old file/line references had already gone stale by this pass).

**Files:** Broad — see grep pattern above rather than a stale list.

**Impact:** Silent failures are difficult to debug. `lib/extract-cards.ts` is the clearest example: it silently leaves `parsed` empty if JSON parsing fails, and the sync route then detects 0 cards and skips persist with only a `console.warn`, making extraction failures hard to diagnose.

**Fix approach:** Add `console.error` at minimum in empty `catch` blocks that don't already degrade gracefully by design (some, like the TTS 503 fallback, are intentional silent degradation — those are fine as-is). For user-visible flows, surface a meaningful error state rather than silently degrading.

---

### `scripts/` contains one-time DDL scripts that could be accidentally re-run

**Issue:** `scripts/apply-graph-ddl.mjs` and `scripts/apply-sentence-ddl.mjs` are one-time DDL scripts that would fail or corrupt data if re-run against a populated database (the `UNIQUE` index requirement noted in CLAUDE.md). They live alongside idempotent operational scripts with no clear naming distinction.

**Files:** `scripts/apply-graph-ddl.mjs`, `scripts/apply-sentence-ddl.mjs`

**Impact:** Accidental re-run would attempt to re-create tables/indexes that already exist, failing with a SQL error. No data loss risk since the script would error before mutating, but the ambiguity in the scripts directory is a maintenance hazard.

**Fix approach:** Add a comment at the top of one-time scripts: `// ONE-TIME: Do not re-run. Already applied to production.` Optionally rename to `scripts/one-time/`.

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
