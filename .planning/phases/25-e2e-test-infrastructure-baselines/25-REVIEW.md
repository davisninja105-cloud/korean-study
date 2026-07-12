---
phase: 25-e2e-test-infrastructure-baselines
reviewed: 2026-07-11T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - e2e/auth.setup.ts
  - e2e/fixture.ts
  - e2e/freshness-client-shell.spec.ts
  - e2e/freshness-fresh-paths.spec.ts
  - e2e/freshness-router-cache.spec.ts
  - e2e/global-setup.ts
  - e2e/helpers/build-guard.ts
  - e2e/helpers/mutate.ts
  - e2e/helpers/readers.ts
  - e2e/helpers/resume.ts
  - e2e/helpers/rsc.ts
  - e2e/helpers/test-db.ts
  - e2e/run-global-setup.ts
  - e2e/run-mutate.ts
  - e2e/run-reset-baseline.ts
  - e2e/seed.ts
  - e2e/smoke.spec.ts
  - playwright.config.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-07-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the new Playwright E2E test-infrastructure layer added across Phase 25's three plans: global setup/DB isolation (`e2e/global-setup.ts`, `e2e/helpers/build-guard.ts`, `e2e/helpers/test-db.ts`, `playwright.config.ts`), the deterministic fixture + mutators (`e2e/seed.ts`, `e2e/fixture.ts`, `e2e/helpers/mutate.ts`, `e2e/run-mutate.ts`, `e2e/run-reset-baseline.ts`, `e2e/run-global-setup.ts`), and the spec suites (`e2e/smoke.spec.ts`, `e2e/freshness-*.spec.ts`, `e2e/auth.setup.ts`, helpers `rsc.ts`/`readers.ts`/`resume.ts`).

**Scope check:** No production code under `app/`, `components/`, `lib/`, or `prisma/schema.prisma` appears in the reviewed file list — scope is clean, no production-code creep detected in this phase's file set. `npx tsc --noEmit` and `npx eslint e2e playwright.config.ts vitest.config.ts` both pass clean.

**DB-isolation guard chain (primary review focus):** The `assertLocalDb` allow-list guard, its two call sites (`playwright.config.ts` config-load time, `e2e/global-setup.ts` runtime re-check), and the `getTestPrisma()` hardcoded `process.env.DATABASE_URL = TEST_DB_URL` override in `e2e/seed.ts` together form a genuinely solid belt-and-suspenders design — I traced every path a Prisma client could be constructed from in this harness (`webServer` child env, `global-setup.ts`, `run-mutate.ts`/`run-reset-baseline.ts` subprocesses) and none of them can reach a non-`file:` DATABASE_URL. No BLOCKER-level DB-isolation gap was found. The `.gitignore` correctly excludes `/playwright/.auth/`, `/e2e/.tmp/`, `/playwright-report/`, `/test-results/`, so the storageState session-cookie file and the isolated DB never reach git.

The issues below are secondary robustness/consistency gaps and quality items — none are exploitable, none currently break the shipped test suite (confirmed via lint/typecheck and manual trace of call sites), but several are latent correctness risks worth fixing before this harness is extended further.

## Warnings

### WR-01: `createMutationCard`'s uniqueness counter is non-functional across its actual call boundary

**File:** `e2e/helpers/mutate.ts:93-119`
**Issue:** `cardMutationCounter` is a module-level `let`, incremented inside `createMutationCardDirect()`. But every public call to `createMutationCard()` (line 175-177) spawns a **brand-new** `tsx` subprocess via `runMutateOp()` (`execFileSync`), so the module is freshly loaded and `cardMutationCounter` always starts at `0` and increments to `1`. Every invocation of `createMutationCard()` therefore produces the identical front `추가단어1`, never `추가단어2`, `추가단어3`, etc. — the counter never actually counts.

Today this is masked because every spec file calls `resetToBaseline()` in `beforeEach`/`beforeAll` and each test calls `createMutationCard()` at most once, so the duplicate front never collides with an existing row. But `Card.normalizedFront` is `@unique` in the schema — the moment any test (now or in a future edit) calls `createMutationCard()` twice without an intervening reset, the second call throws a Prisma P2002 unique-constraint violation, surfaced only as an opaque subprocess stderr dump via `execFileSync`'s `stdio: ['ignore', 'pipe', 'inherit']`.
**Fix:** Derive uniqueness from something that survives the subprocess boundary — e.g. read the current max suffix from the DB (`prisma.card.count()` or a `Date.now()`-seeded suffix) instead of an in-memory counter:
```ts
export async function createMutationCardDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  const existing = await prisma.card.count({ where: { front: { startsWith: '추가단어' } } })
  const front = `추가단어${existing + 1}`
  // ...
}
```

### WR-02: `DATABASE_AUTH_TOKEN` is not blanked in the mutate/reset subprocess envs, inconsistent with the harness's own stated defense-in-depth pattern

**File:** `e2e/helpers/mutate.ts:150-157` (`runMutateOp`), `e2e/seed.ts:235-241` (`resetToBaseline`)
**Issue:** `playwright.config.ts:98-99` explicitly blanks `DATABASE_AUTH_TOKEN: ''` in the `webServer.env`, with a comment stating this is so "the real Turso token can never reach the child even via env merge." `runMutateOp()` and `resetToBaseline()` spawn their own `tsx` subprocesses with `env: { ...process.env, DATABASE_URL: TEST_DB_URL }` — `DATABASE_URL` is force-overridden but `DATABASE_AUTH_TOKEN` is passed through unblanked from whatever `process.env` happens to contain in the Playwright worker process (which, unlike the `webServer` child, inherits the ambient shell/CI environment directly, not the already-sanitized `webServer.env`). `lib/prisma.ts:12` unconditionally forwards `process.env.DATABASE_AUTH_TOKEN` to `PrismaLibSql` regardless of URL scheme. Practically low-risk today (`@libsql/client` ignores the auth token for a `file:` URL — no network call is made using it), but the harness's own documented threat model treats this token as sensitive enough to explicitly scrub in one spot and not the other two structurally-identical spawn sites.
**Fix:** Blank `DATABASE_AUTH_TOKEN` in both subprocess spawn env blocks for consistency with the `webServer.env` precedent:
```ts
env: { ...process.env, DATABASE_URL: TEST_DB_URL, DATABASE_AUTH_TOKEN: '' },
```

### WR-03: Fixture `CardDependency` edge creation fails silently, and the post-seed sanity check doesn't cover it

**File:** `e2e/seed.ts:173-181`, `e2e/global-setup.ts:80-93`
**Issue:** `seedFixture()`'s `CardDependency` edge is only created `if (prereqCard && dependentCard)` — there is no `else` branch that throws or logs, so a lookup miss (e.g. a future `normalizeFront` change, or a fixture front-string edit that breaks the `저`/`감사하다` pairing) would silently produce zero edges instead of failing loudly. Compounding this, `global-setup.ts`'s post-seed sanity check (lines 80-93) only diffs `liveDue`/`liveTotal`/`liveMastered` against `FIXTURE.dueCards`/`totalCards`/`masteredCards` — it never queries `prisma.cardDependency.count()` against `FIXTURE.dependencyEdges` (declared as `1` in `e2e/fixture.ts:26`), nor `lessons`/`studyDays`. A regression in dependency-edge resolution would go completely undetected at seed time and only surface later as a confusing failure in whichever freshness spec happens to depend on the sequencing/prerequisite graph.
**Fix:** Add an explicit failure path in `seedFixture()` when the lookup misses, and extend the sanity check:
```ts
// seed.ts
if (!prereqCard || !dependentCard) {
  throw new Error('seedFixture: could not resolve CardDependency edge (저 → 감사하다) — fixture front strings drifted')
}
```
```ts
// global-setup.ts
const [liveDue, liveTotal, liveMastered, liveEdges] = await Promise.all([
  prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
  prisma.card.count(),
  prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  prisma.cardDependency.count(),
])
if (liveEdges !== FIXTURE.dependencyEdges) mismatches.push(`dependencyEdges: expected ${FIXTURE.dependencyEdges}, got ${liveEdges}`)
```

## Info

### IN-01: Request-log capture logic is duplicated near-verbatim across all 3 freshness spec files

**File:** `e2e/freshness-client-shell.spec.ts:56-81`, `e2e/freshness-fresh-paths.spec.ts:29-54`, `e2e/freshness-router-cache.spec.ts:44-69`
**Issue:** The `LoggedRequest` interface, `registerRequestLog()`, and the `newRscFetchesForRoute`/`newDataFetchesForRoute` filter function are copy-pasted across all three spec files (the only difference between the two filter variants is whether `resourceType === 'document'` is also counted). This is exactly the kind of shared test-infra logic `e2e/helpers/` exists for.
**Fix:** Extract to `e2e/helpers/rsc.ts` (or a new `e2e/helpers/request-log.ts`) as `registerRequestLog(page)` + `newFetchesForRoute(log, preLen, route, { includeDocument?: boolean })`, imported by all three spec files.

### IN-02: `MUTATE_RESULT:` prefix constant is independently duplicated

**File:** `e2e/helpers/mutate.ts:51`, `e2e/run-mutate.ts:29`
**Issue:** Both files declare `const RESULT_PREFIX = 'MUTATE_RESULT:'` independently rather than importing one shared constant. A future edit to one side without the other would silently break `parseMutateResult()`'s line-matching in `mutate.ts:159-169`.
**Fix:** Export the constant from one file (e.g. `e2e/helpers/mutate.ts`) and import it in `e2e/run-mutate.ts`.

### IN-03: `readHabitsMasteredCount`'s selector is more brittle than the file's own documented threshold, without being flagged as such

**File:** `e2e/helpers/readers.ts:110-124`
**Issue:** `readStudySelectModeState` (lines 62-72) has an explicit "KNOWN-FRAGILE LOCATOR" comment justifying its presentational-class dependency. `readHabitsMasteredCount`'s root locator (`div.bg-surface-1.rounded-2xl.shadow-md.p-6.flex.flex-col.gap-4`) chains five presentational Tailwind classes on top of the one semantic token (`bg-surface-1`) — objectively more brittle (any one of `rounded-2xl`/`shadow-md`/`p-6`/`flex`/`flex-col`/`gap-4` changing on that container silently breaks this reader) — yet it carries no equivalent "known limitation" acknowledgment.
**Fix:** Either trim to `bg-surface-1` + `hasText: 'Proficiency'` only (drop the presentational chain, matching the Ambiguity-3 trimming already applied to `readHomeState`), or add the same known-fragile documentation used elsewhere.

### IN-04: Hardcoded test-only fallback secrets embedded directly in source

**File:** `playwright.config.ts:95-96`, `e2e/auth.setup.ts:17`
**Issue:** `'e2e-test-secret'` / `'e2e-test-password'` are literal fallback values. Given the loopback bind (`-H 127.0.0.1`), isolated `file:` DB, and gitignored storageState, this is low-risk and clearly intentional test-only scaffolding — flagging only as an advisory in case these literals are ever copy-pasted into a real deployment config.
**Fix:** No action required; consider a one-line comment at each site cross-referencing the other so a future edit to one fallback doesn't silently desync the pair (`auth.setup.ts` logs in with this password against the server started with the same fallback in `playwright.config.ts` — currently correct only because both default to the identical literal).

### IN-05: Repeated magic-number "settle margin" timeouts sprinkled through the freshness specs

**File:** `e2e/freshness-client-shell.spec.ts:136,148,178`, `e2e/freshness-fresh-paths.spec.ts:104,152,176,211`, `e2e/freshness-router-cache.spec.ts:120,145-147`
**Issue:** `await page.waitForTimeout(300)` (and 150/250/80 variants) appears as a repeated literal across all three files, each individually commented as "justified settle margin." While documented as deliberate, the value is duplicated ad hoc rather than named once, making a future global tuning pass (e.g. if CI hardware is slower) an error-prone find-and-replace across three files.
**Fix:** Hoist to a shared named constant, e.g. `e2e/helpers/rsc.ts`: `export const SETTLE_MARGIN_MS = 300`.

---

_Reviewed: 2026-07-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
