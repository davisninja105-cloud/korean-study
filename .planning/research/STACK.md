# Stack Research

**Domain:** Vercel/Next.js/Prisma stack additions for v1.4 (scheduled sync, review-history logging, extraction post-filter)
**Researched:** 2026-07-02
**Confidence:** MEDIUM-HIGH (Cron: HIGH — verified against current official Vercel docs; Prisma/libSQL write pattern: MEDIUM — official docs don't state Turso transaction behavior explicitly, filled by reasoned inference + existing codebase convention; fuzzy-match reuse: HIGH — based on direct reading of this repo's existing pure helpers)

## Headline Finding

**No new npm package is warranted for any of the three v1.4 features.** All three are solvable with platform config (Vercel Cron), a schema/DDL addition using the project's existing Turso workaround, and reuse of two already-existing pure helpers (`lib/card-key.ts`, `lib/sentence-match.ts`/`lib/known-words.ts`). This continues the v1.1/v1.2 precedent ("No new npm packages for entire v1.1/v1.2 milestone" — see PROJECT.md Key Decisions) — v1.4 can extend it to three milestones running.

## Recommended Stack

### Core Technologies (platform features, not packages)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vercel Cron Jobs | Platform feature (docs current as of 2026-06-16) | Trigger daily sync via `vercel.json` `crons[]` | Native to the existing Vercel/Hobby deployment — zero new infra, zero new npm dependency. Confirmed current: Hobby plan allows cron schedules **no more frequent than once/day**; more-frequent expressions fail at *deploy* time, not runtime. Hobby invocations land **somewhere within the specified UTC hour**, not the exact minute — plan the "daily sync" requirement around that imprecision. |
| `CRON_SECRET` env var + `Authorization: Bearer <secret>` header check | n/a (convention, not a package) | Authenticate cron-triggered requests | Vercel automatically sends `CRON_SECRET` as the `Authorization` header on every cron invocation. This is the officially documented way to secure a cron target route — verified directly against `vercel.com/docs/cron-jobs/manage-cron-jobs` (fetched 2026-07-02). |
| Prisma 7.6.0 + `@prisma/adapter-libsql` 7.6.0 + `@libsql/client` 0.17.2 (already installed) | current | `ReviewLog` model + write path | Already the project's DB stack (see `prisma/schema.prisma`, `lib/prisma.ts`). Driver adapters are no longer preview-gated in Prisma 7 — confirmed by this repo's `schema.prisma` having no `previewFeatures` block and a `prisma.config.ts` present (the Prisma 7 stable adapter-config shape). No version bump needed. |

### Supporting Libraries

None. All three features are implementable with code already in the repo:

| Existing module | Reused for | Why it's directly reusable (not a new dependency) |
|---|---|---|
| `lib/card-key.ts` (`normalizeFront`) | Feature 3 — component hallucination filter | Already the single source of truth for "are two Korean strings the same lemma?" (NFC-normalize, strip English glosses). The exact normalization needed before substring-checking a `components[]` lemma against a card's own sentence/notes text. |
| `lib/sentence-match.ts` (`splitParticle`, `indexOf`-based containment in `sentenceMatch`) | Feature 3 — component hallucination filter | Already implements conservative Korean substring/stem matching (multi-char particle stripping, single-char particle guarded to 2+ syllable stems). This *is* the fuzzy-match logic the feature needs — it exists for a near-identical problem (does surface form X relate to stem Y in text Z). |
| `lib/known-words.ts` (`countUnknownWords`) | Feature 3 — component hallucination filter (pattern to mirror, not a direct call) | Already solves the inverse problem: "is lemma L present/resolvable within Korean text T?" via `normalizeFront` direct lookup → `splitParticle` stem fallback. The component-filter should follow the **same two-step resolution order**, just checking presence in `sentence.korean + ' ' + notes` text instead of `knownLemmas` Set membership. |
| `app/api/sync/route.ts` two-phase component→edge resolution (`keyToId` map, PERF-01/Phase 14) | Feature 3 — where the new filter step slots in | The filter belongs **between** Claude's raw `components[]` output and the existing edge-resolution step — filtering before resolution means hallucinated lemmas never reach `CardDependency` creation at all, not just get silently skipped there. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` | Generate `CREATE TABLE ReviewLog` DDL | Same command already documented in root `CLAUDE.md` for the Turso gotcha — no new tooling, just run it again after adding the model. |
| `@libsql/client` `executeMultiple()` via a throwaway script | Apply the DDL to Turso | Follow the exact pattern in `scripts/apply-graph-ddl.mjs` (env-parsing, `createClient`, idempotent `IF NOT EXISTS` DDL) — a new `scripts/apply-reviewlog-ddl.mjs` sibling script, not a new tool. |
| `vercel env add CRON_SECRET` (Vercel CLI, already globally installed) | Provision the cron secret | Set for Production (and Preview if the cron path is tested there); read via `process.env.CRON_SECRET` in the new route handler. |

## Installation

```bash
# No npm installs required for any of the three v1.4 features.
```

```json
// vercel.json (new file — none exists yet in this repo)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/sync", "schedule": "0 17 * * *" }
  ]
}
```
`0 17 * * *` = once daily, UTC 17:00 (Hobby: actual trigger lands sometime in the 17:00–17:59 UTC window). Pick an hour that doesn't collide with the user's own manual-sync habits so a fired cron run doesn't "eat" the day's single lesson slot right before they wanted to tap it themselves.

```ts
// prisma/schema.prisma addition
model ReviewLog {
  id         String   @id @default(cuid())
  createdAt  DateTime @default(now())
  cardId     String
  card       Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  rating     Int      // 1-4, the FSRS grade submitted
  state      Int      // resulting CardReview.state after this review
  stability  Float
  difficulty Float
  scheduledDays Int
  nextReview DateTime
  @@index([cardId])
  @@index([createdAt])
}
```
Then: edit schema → `npx prisma generate` → `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (extract only the new `CREATE TABLE ReviewLog...` + index statements — the diff against `--from-empty` will also re-emit existing tables; do NOT run those) → apply via a new `scripts/apply-reviewlog-ddl.mjs` (copy `apply-graph-ddl.mjs`'s shape).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vercel Cron (native, `vercel.json`) | External scheduler (GitHub Actions `schedule:` workflow, cron-job.org, Upstash QStash hitting a webhook) | Only if the daily-once Hobby ceiling becomes a real constraint (e.g. wanting hourly retries) — those all require a *second* platform/secret to manage for a problem Vercel Cron already solves for free at this project's current 1-lesson/day cadence. Not worth it here. |
| Sequential independent `prisma.cardReview.update()` then `prisma.reviewLog.create()` awaits in `/api/review` | `prisma.$transaction([update, create])` (sequential-array form) or interactive `prisma.$transaction(async (tx) => ...)` | Use only if you've empirically confirmed transactions are reliable against this specific Turso database — official Prisma/Turso docs do not state clear support, and community reports describe `TRANSACTION_CLOSED` errors with libSQL's HTTP transport under interactive transactions. This codebase has **zero existing `$transaction` usage** (grepped) and already established the pattern of independent, individually-error-handled sequential writes for exactly this kind of "two related but non-atomic-critical writes" case (see the per-edge try/catch in the sync route's `CardDependency` creation). A dropped/duplicate `ReviewLog` row is a stats-page nuisance, not a correctness bug — same risk tolerance as the existing pattern. |
| Reuse `normalizeFront` + `splitParticle`-style substring/stem containment for Feature 3 | A fuzzy-string npm package (`fastest-levenshtein`, `fuse.js`, `string-similarity`) | Never, for this specific problem. Edit-distance/fuzzy libraries are the wrong tool for Korean agglutinative morphology — they'd flag unrelated single-syllable overlaps as "close enough" (the exact false-positive class `lib/sentence-match.ts` already guards against by refusing to blank 1-character `targetForm`s). If containment checks miss too many valid conjugated forms in practice, the right fix is a small **verb/adjective stem-stripper** (trailing 다-form aware) added to `lib/sentence-match.ts` alongside `splitParticle` — still zero new dependencies, just a same-shape pure function. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Cron expressions more frequent than `0 H * * *` (e.g. hourly, every 5 min) | Hobby plan **fails the deployment** for any cron more frequent than daily — confirmed in current Vercel docs, not a runtime-only limit | A single daily schedule; if a lesson backlog needs draining faster, that's still a manual-tap job (existing UX), not a cron frequency problem |
| Assuming exact-minute cron trigger time on Hobby | Vercel explicitly reserves the right to fire anywhere in the specified UTC hour on Hobby (load distribution) — Pro/Enterprise get minute-precision, Hobby does not | Design the daily-sync logic to be indifferent to exact trigger time (it already is — idempotent via `contentHash` dedup) |
| Letting the existing `ks_auth` session-cookie `middleware.ts` gate the new cron route unmodified | Vercel's cron invoker sends **no cookies** — it only sends `Authorization: Bearer <CRON_SECRET>`. Leaving the current matcher as-is means the cron GET 401s every single day (silent, since Vercel does not retry failed cron invocations and does not alert you) | Add the new cron path to `middleware.ts`'s matcher-exclusion regex (same treatment as `/login`, `/api/login`) and have the route itself independently verify the `CRON_SECRET` bearer header — the route becomes the auth boundary instead of the cookie middleware for that one path |
| `prisma db push` / `prisma migrate dev` for the `ReviewLog` model | Already-documented project gotcha — fails with P1013 against `libsql://` | The `migrate diff --to-schema ... --script` + `@libsql/client executeMultiple()` workaround already in `CLAUDE.md` and `scripts/apply-graph-ddl.mjs` |
| Wrapping the `/api/review` `CardReview.update` + `ReviewLog.create` in an interactive `$transaction` without first testing it against the live Turso DB | Unverified behavior for this specific stack — official docs are silent, community reports flag HTTP-transport transaction issues, and this project has never used `$transaction` anywhere | Two sequential awaited calls (see Alternatives row above) — and note this is *already* fire-and-forget from the client (`postReviewWithRetry` doesn't await the response), so the extra ~10-30ms of a second sequential Turso round-trip has **zero effect on perceived UI latency** — it only extends the background function's own execution time, well inside any Vercel limit for a single-row insert |
| A generic fuzzy-string-matching npm package for Feature 3 | Wrong tool for Korean morphology (see Alternatives row); adds a dependency for a problem the repo's own conventions already solve with targeted pure functions | `normalizeFront` + `splitParticle`-style containment, following the exact resolution-order pattern already in `lib/known-words.ts` |

## Stack Patterns by Variant

**If extracting shared sync logic for both manual-tap and cron paths:**
- Pull the current `POST /api/sync` handler body into a plain `lib/sync.ts` function (e.g. `runSync(documentId): Promise<SyncResult>`), keep `app/api/sync/route.ts` as a thin wrapper that parses the request body and calls it, and add `app/api/cron/sync/route.ts` as a `GET` handler that checks `CRON_SECRET`, reads `documentId` from `process.env.NEXT_PUBLIC_GOOGLE_DOC_ID` (no request body available from cron), and calls the same `runSync()`.
- Because: an internal `fetch()` from the cron route to the existing POST route would need to either forge an `Authorization`/cookie the middleware accepts (fragile, couples auth schemes) or bypass middleware entirely (defeats the point of gating). A shared lib function sidesteps all of that — no internal HTTP hop, no auth-scheme coupling.

**If the daily cron and manual "sync" tap can race (e.g. user taps Sync at the same moment the cron fires):**
- No new locking mechanism is needed. `runSync()`'s existing per-lesson `contentHash` uniqueness check plus the `MAX_LESSONS_PER_SYNC = 1` cap means a second concurrent call either finds `newLessons: 0` (harmless no-op) or, in the narrow window where both read "not yet synced" before either writes, worst case double-extracts the *same* lesson — `Card.normalizedFront @unique` upsert already absorbs that as a no-op merge, not a duplicate.
- Because: this matches Vercel's own guidance that cron jobs should be idempotent/reconciliation-based rather than relying on distributed locks, and the existing dedup keys (`contentHash`, `normalizedFront`) already provide that idempotency for free.

**If `ReviewLog` writes ever need to become async/off-critical-path instead of inline in `/api/review`:**
- Not needed for v1.4 given `/api/review` is already fire-and-forget from the client. Revisit only if `ReviewLog` writes grow expensive (e.g. an added embedding call) — out of scope now.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.2.1 App Router `route.ts` `GET` handler | Vercel Cron target | Officially documented pattern — Vercel's own example uses exactly this shape (`export function GET(request: NextRequest)`, read `request.headers.get('authorization')`). No adapter or extra config needed beyond `vercel.json`. |
| `prisma` 7.6.0 / `@prisma/client` 7.6.0 / `@prisma/adapter-libsql` 7.6.0 | `ReviewLog` model, same `PrismaClient` instance in `lib/prisma.ts` | No version change required — adding a model + relation is a pure schema/DDL change, orthogonal to the adapter version already in use. |
| `@libsql/client` 0.17.2 | Manual DDL application via `executeMultiple()` | Same client version already used by every existing `scripts/*.mjs` DDL script — no bump needed for a `CREATE TABLE ReviewLog` statement. |

## Sources

- https://vercel.com/docs/cron-jobs — fetched directly 2026-07-02 (doc `last_updated: 2026-06-16`). Verified: `vercel.json` `crons[]` schema, cron expression field ranges/limitations (no `MON`/`JAN` aliases, can't set both day-of-month and day-of-week, timezone always UTC).
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — fetched directly 2026-07-02. Verified: `CRON_SECRET` env var + `Authorization: Bearer` header mechanism (with the exact Next.js App Router code sample), Hobby daily-only + within-the-hour timing limitation, non-retry-on-failure behavior, idempotency/reconciliation guidance, "cron jobs are just Vercel Functions" (same `maxDuration`/timeout limits apply as the rest of this project's routes).
- WebSearch: "Vercel Cron Jobs Hobby plan limits daily schedule" — cross-check confirming the Hobby once-per-day ceiling and within-the-hour imprecision (consistent with the fetched docs above).
- WebSearch: "Prisma libSQL driver adapter interactive transaction Turso HTTP limitation" — inconclusive/no authoritative statement found; used to justify the "don't assume `$transaction` works" caution rather than as a positive claim. Treat as MEDIUM/LOW confidence, verify empirically before relying on it if this is ever revisited.
- Direct source reading (this repo, HIGH confidence, no external uncertainty): `CLAUDE.md` (Turso DDL gotcha), `prisma/schema.prisma`, `prisma.config.ts`, `lib/prisma.ts`, `middleware.ts`, `app/api/review/route.ts`, `app/api/sync/route.ts`, `lib/card-key.ts`, `lib/sentence-match.ts`, `lib/known-words.ts`, `lib/extract-cards.ts`, `scripts/apply-graph-ddl.mjs`, `package.json`.

---
*Stack research for: Korean Study v1.4 — Vercel Cron, ReviewLog persistence, extraction post-filter*
*Researched: 2026-07-02*
