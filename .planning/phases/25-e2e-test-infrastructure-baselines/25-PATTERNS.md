# Phase 25: E2E Test Infrastructure & Baselines - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 13 (all new; no production code modified)
**Analogs found:** 13 / 13 (all analogs are within this same codebase — `scripts/diagnose-freshness.mts` is the dominant source, since RESEARCH.md's Code Examples section already ported most shapes verbatim)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `playwright.config.ts` | config | request-response (webServer lifecycle) | `vitest.config.ts` (repo's only existing test-runner config) + RESEARCH.md's concrete example | partial (cross-framework, but RESEARCH.md gives an exact drop-in shape) |
| `e2e/global-setup.ts` | config/utility | batch (DB reset + seed) | `scripts/diagnose-freshness.mts` (fresh-run reset + schema-push section, lines 145–190) | exact (same DB-isolation + WAL/no-WAL decision, same `db push` invocation) |
| `e2e/seed.ts` | utility (fixture builder) | CRUD (nested Prisma creates) | `scripts/diagnose-freshness.mts` (seed fixture section, lines 191+) | exact |
| `e2e/auth.setup.ts` | test (setup project) | request-response | `scripts/diagnose-freshness.mts` (cookie-injection block, lines 303–311) — reshaped per D-10 to `APIRequestContext.post('/api/login')` instead of direct cookie injection; RESEARCH.md Code Examples gives the exact final shape | role-match (same auth concern, different mechanism) |
| `e2e/helpers/rsc.ts` | utility | event-driven (network predicate) | `scripts/diagnose-freshness.mts:131-134` (`isRscRequest`) | exact (verbatim port, drop dead uppercase-`RSC` branch per IN-01) |
| `e2e/helpers/resume.ts` | utility | event-driven (DOM event dispatch) | `scripts/diagnose-freshness.mts:465-477` (`simulateResume`) | exact (verbatim port) |
| `e2e/helpers/build-guard.ts` | utility | request-response (config-time guard) | `scripts/diagnose-freshness.mts:42-49` (`assertLocalDb`) + `:83-94` (`checkRouteIsDynamic`) | exact (port `assertLocalDb`, but invert deny-list→allow-list per WR-01 finding) |
| `e2e/helpers/readers.ts` | utility | request-response (DOM readers) | `scripts/diagnose-freshness.mts:510-560+` (`readHomeState`, `readStudySelectModeState`, `readCardsCount`, `readHabitsMasteredCount`) | exact, with selector trimming per Ambiguity 3 |
| `e2e/smoke.spec.ts` | test | request-response | `scripts/diagnose-freshness.mts` (smoke-context section, lines ~300–335: cookie auth + due-count locator + textContent assertion) | role-match (same per-route assertion shape, restructured as `@playwright/test` `test()` blocks) |
| `e2e/freshness-router-cache.spec.ts` | test | event-driven (navigation + network capture) | `scripts/diagnose-freshness.mts` (back-forward cell logic, lines ~790–860 + `isRscRequest` classification) + RESEARCH.md Pattern 3 (rewritten to native `page.goBack()`) | role-match (logic ported, navigation mechanism deliberately rewritten) |
| `e2e/freshness-client-shell.spec.ts` | test | event-driven | same as above, applied to `/study`, `/cards`, `/habits` cells | role-match |
| `e2e/freshness-fresh-paths.spec.ts` | test | event-driven | same as above, applied to the 7 confirmed-fresh cells (plain `<Link>` + 3 post-mutation-return) | role-match |
| `vitest.config.ts` (modified) | config | — | itself (adding `exclude: ['e2e/**']`) | exact — read current file, one-line addition |

## Pattern Assignments

### `playwright.config.ts` (config, request-response/webServer)

**Analog:** No direct in-repo Playwright config exists yet; RESEARCH.md's Code Examples section already synthesizes the exact shape this phase needs (cross-referenced against `PITFALLS.md` 7–12 and CONTEXT.md D-07/D-11/D-12/D-14). Use it verbatim as the starting point — it is the authoritative source, not a secondary suggestion:

```typescript
import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.test' })

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,       // D-07 / Pitfall 10 — must be top-level
  workers: 1,
  retries: 0,                 // no CI this phase (D-14)
  reporter: 'line',            // E2E-07
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',   // E2E-07
    reducedMotion: 'reduce',   // Pitfall 11
  },
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // WR-02 (Phase 24 carry-forward): bind loopback only, not 0.0.0.0
    command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: 'file:./e2e-test.db',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-test-secret',
      APP_PASSWORD: process.env.APP_PASSWORD ?? 'e2e-test-password',
    },
  },
})
```

**Do NOT port** `waitForServer`/`stopServer` from the diagnosis script as functions — this `webServer` block replaces that hand-rolled orchestration entirely (Ambiguity 1). Only the *command/env shape* carries over conceptually.

---

### `e2e/global-setup.ts` (config/utility, batch)

**Analog:** `scripts/diagnose-freshness.mts` lines 145–190 (fresh-run reset + schema push + WAL decision).

**Reset pattern to copy** (adjust paths from `scripts/.tmp/24-diagnosis.db` → `./e2e-test.db`, and per WR-03 remove **all three** files, not just the main one):
```typescript
mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true })
rmSync(TEST_DB_PATH, { force: true })
rmSync(`${TEST_DB_PATH}-wal`, { force: true })
rmSync(`${TEST_DB_PATH}-shm`, { force: true })
```

**Schema-push pattern to copy verbatim:**
```typescript
execSync('npx prisma db push --accept-data-loss', {
  env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  stdio: 'inherit',
})
```

**WAL mode:** per RESEARCH.md's Don't-Hand-Roll table (assumption A2), this phase's harness likely does NOT need WAL (no long-lived competing Prisma client during a short seed step before the server starts). Skip the `PRAGMA journal_mode=WAL;` call unless flakiness appears; if enabled later, the WR-03 sidecar-cleanup gotcha above applies.

**DB-isolation guard call site:** import and call `assertLocalDb(process.env.DATABASE_URL)` from `e2e/helpers/build-guard.ts` (see below) before the reset step, exactly mirroring the diagnosis script's placement (lines 54–59) — call it once right after the env override, i.e. at the very top of `global-setup.ts`.

**Env-first ordering rule** (`24-PATTERNS.md` convention, reused): set `process.env.DATABASE_URL` / `AUTH_SECRET` / `APP_PASSWORD` BEFORE any dynamic `import()` of `lib/prisma.js` or `lib/auth.js`. Follow `scripts/local-resync.mts`'s exact shape:
```typescript
import { config } from 'dotenv'
config({ path: path.resolve(__dir, '..', '.env.test') })
// ... then, only after the config() call:
const { prisma } = await import('../lib/prisma.js')
```

---

### `e2e/seed.ts` (utility, CRUD)

**Analog:** `scripts/diagnose-freshness.mts` lines 191+ (nested-create fixture pattern) and `24-PATTERNS.md`'s already-validated nested-create shape.

**Core pattern to copy** (nested nested nested-create, nothing new to invent):
```typescript
const lesson = await prisma.lesson.create({
  data: { title: 'Diagnosis fixture', rawContent: '', contentHash: 'diagnosis-fixture', orderIndex: 1 },
})
// then per-card: prisma.card.create({ data: { ..., sentences: { create: [...] }, review: { create: {...} } } })
```

Follow RESEARCH.md's D-13 seed shape exactly (2 lessons, 3 due cards, 3 mastered cards `state=2`/`scheduledDays>=21`, 2 new cards, 1 `CardDependency` edge, 1–2 `StudyDay` rows) — this table is already fully specified in RESEARCH.md § "Seed fixture data model" and should be treated as the concrete spec, not re-derived.

---

### `e2e/auth.setup.ts` (test/setup-project, request-response)

**Analog:** `scripts/diagnose-freshness.mts` lines 303–311 (cookie-injection via `computeAuthToken()`/`AUTH_COOKIE` direct import) — **superseded per D-10**, not copied directly. The new shape drives the real login route instead:

```typescript
import { test as setup } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ request }) => {
  const res = await request.post('/api/login', {
    data: { password: process.env.APP_PASSWORD ?? 'e2e-test-password' },
  })
  if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`)
  await request.storageState({ path: authFile })
})
```

Read `app/api/login/route.ts` and `lib/auth.ts` (`computeAuthToken`, `AUTH_COOKIE`) before writing this — not to copy the cookie-injection code, but to confirm the login route's expected request-body shape (`{ password }`) and that its `Set-Cookie` response is what `storageState()` will capture.

---

### `e2e/helpers/rsc.ts` (utility, event-driven)

**Analog:** `scripts/diagnose-freshness.mts:131-134`, exact verbatim port (drop the dead uppercase-`RSC` branch per Phase 24 code review IN-01):

```typescript
import type { Request as PwRequest } from '@playwright/test'

export function isRscRequest(req: PwRequest): boolean {
  return req.headers()['rsc'] === '1'
}
```

---

### `e2e/helpers/resume.ts` (utility, event-driven)

**Analog:** `scripts/diagnose-freshness.mts:465-477`, exact verbatim port:

```typescript
import type { Page } from '@playwright/test'

export async function simulateResume(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true })
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}
```

---

### `e2e/helpers/build-guard.ts` (utility, request-response)

**Analog:** `scripts/diagnose-freshness.mts:42-49` (`assertLocalDb`) + `:83-94` (`checkRouteIsDynamic`).

**`assertLocalDb` — port with the WR-01 fix (invert deny-list to allow-list):**
```typescript
// Original (deny-list, has a gap per WR-01):
//   if (url && url.startsWith('libsql://')) { ...fail... }
// New (allow-list — closes the gap: any non-file: URL fails, not just libsql://):
export function assertLocalDb(url: string | undefined): void {
  if (!url || !url.startsWith('file:')) {
    console.error('✗ FATAL: DATABASE_URL must be an isolated local file: test database.')
    console.error(`  Refusing to proceed. Got: ${url}`)
    process.exit(1)
  }
}
```

**`checkRouteIsDynamic`** ports verbatim from lines 83–94 (Next.js build-output tree-parsing regex) — used only if the plan wants a build-output sanity gate; RESEARCH.md doesn't mandate it for this phase's requirements list, include only if a plan task needs it.

---

### `e2e/helpers/readers.ts` (utility, request-response)

**Analog:** `scripts/diagnose-freshness.mts:510-570` (`readHomeState`, `readStudySelectModeState`, `readCardsCount`, `readHabitsMasteredCount`) plus the `waitVisible`/`dumpUnrecognizedState` support functions (lines 484-508) — **port all of these**, they are the retry-safe DOM-read pattern this whole phase's assertions depend on.

**`waitVisible` (retry-safe presence check — copy verbatim, this is the key robustness pattern):**
```typescript
async function waitVisible(locator: ReturnType<Page['locator']>, timeout = 5000): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}
```

**Home reader — copy as-is (already semantic-token-anchored, Ambiguity 3 requires no trim here beyond confirming the class list):**
```typescript
async function readHomeState(page: Page): Promise<string> {
  const countLocator = page.locator('span.text-reward.text-6xl')
  if (await waitVisible(countLocator)) {
    return ((await countLocator.first().textContent({ timeout: 10_000 })) ?? '').trim()
  }
  if (await waitVisible(page.getByText('Goal met today'), 1500)) return 'zero-due-state'
  if (await waitVisible(page.getByText('All caught up'), 1500)) return 'zero-due-state'
  return '(unrecognized state)'
}
```
Note: RESEARCH.md Ambiguity 3 recommends trimming to `page.locator('span.text-reward').first()` (drop `.text-6xl`, a presentational class) — verify against current `components/HomeClient.tsx` markup before finalizing; the semantic-token half (`text-reward`) is the stable anchor.

**Cards reader — already robust, no trim needed (role-based, zero class dependency):**
```typescript
async function readCardsCount(page: Page): Promise<string> {
  const btn = page.getByRole('button', { name: /^Cards \(\d+\)$/ })
  if (!(await waitVisible(btn))) return '(unrecognized state)'
  return ((await btn.first().textContent({ timeout: 10_000 })) ?? '').trim()
}
```

**Habits reader — copy as-is (already semantic-token-anchored via `bg-surface-1` + `hasText` filter):**
```typescript
async function readHabitsMasteredCount(page: Page): Promise<string> {
  const root = page
    .locator('div.bg-surface-1.rounded-2xl.shadow-md.p-6.flex.flex-col.gap-4', { hasText: 'Proficiency' })
    .first()
  if (!(await waitVisible(root))) return '(unrecognized state)'
  // ... continue reading mastered-count text within `root`
}
```

**Study reader — the one fragile case (Ambiguity 3), needs a fallback strategy, not a straight port:**
```typescript
async function readStudySelectModeState(page: Page): Promise<string> {
  // p.text-5xl.font-bold.animate-reveal is 100% presentational, no semantic-token
  // class available — Ambiguity 3's recommendation: anchor on structural context
  // (parent element in the select-mode button group) OR fall back to the stable
  // literal zero-due-state copy strings below, which ARE already stable per D-05.
  const countLocator = page.locator('p.text-5xl.font-bold.animate-reveal')
  if (await waitVisible(countLocator)) {
    return ((await countLocator.first().textContent({ timeout: 10_000 })) ?? '').trim()
  }
  if (await waitVisible(page.getByText(/No cards due for review right now\.|All caught up in this range!/), 1500)) {
    return 'zero-due-state'
  }
  return '(unrecognized state)'
}
```
Flag this locator explicitly in the spec file as the known-fragile one per RESEARCH.md Ambiguity 3 — acceptable limitation for this phase.

---

### `e2e/smoke.spec.ts` (test, request-response)

**Analog:** `scripts/diagnose-freshness.mts` smoke-context section (~lines 300–335: cookie auth setup, due-count locator + assertion, console logging of matched text).

**Core assertion pattern to copy** (adapt from raw-`playwright` `context.addCookies` to the `storageState`-authenticated `chromium` project — no manual cookie code needed since D-10's setup project already handles auth):
```typescript
import { test, expect } from '@playwright/test'
import { readHomeState, readCardsCount, readHabitsMasteredCount, readStudySelectModeState } from './helpers/readers'

test('Home renders real due-count content on first load', async ({ page }) => {
  await page.goto('/')
  const state = await readHomeState(page)
  expect(state).toBe(String(EXPECTED_DUE_COUNT)) // traceable to e2e/seed.ts fixture, not vacuous
})
```
Per RESEARCH.md's False-Positive Risks: each of the 4 routes MUST assert a *specific value* traceable to the seed fixture (due-count number, "Cards (N)" text, mastered-count, streak text) — never a generic `expect(response.status()).toBe(200)`.

**Navigation-timing capture (D-06, informational only, no assertion):**
```typescript
const timing = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')))
console.log(`[nav-timing] ${page.url()}: ${timing}`) // captured now; Phase 27 adds budget assertions on top
```

---

### `e2e/freshness-router-cache.spec.ts` / `freshness-client-shell.spec.ts` / `freshness-fresh-paths.spec.ts` (test, event-driven)

**Analog:** `scripts/diagnose-freshness.mts` back-forward/resume cell logic (~lines 790–930: navigation triggers, `isRscRequest` classification, `simulateResume` calls, grade-flow-through-mutation steps) — **logic ported, navigation mechanism deliberately rewritten** per RESEARCH.md Ambiguity 2 (Pattern 3 in RESEARCH.md is the authoritative example; reproduced here for convenience):

```typescript
test('/ back-forward stays stale (Stale-RouterCache) — RED until Phase 26', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Cards', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await mutateOneReviewDueState() // direct Prisma mutation via a helper, not through the UI
  const preLen = requestLog.length
  await page.goBack({ waitUntil: 'networkidle' }) // native API — NO window.history.back()/goto() recovery dance
  const newFetches = requestLog.slice(preLen).filter((r) => r.pathname === '/' && (isRscRequest(r) || r.resourceType === 'document'))
  expect(newFetches).toHaveLength(0)
  await expect(page.locator('span.text-reward').first()).toHaveText(String(await expectedDueCount()))
  // ^ EXPECTED TO FAIL today — plain expect(), never test.fail()/test.fixme() (inverts red/green reporting)
})
```

**Critical deviations from the diagnosis script (do not copy these parts):**
- Do NOT reproduce the CR-01 `page.goto()` recovery fallback when `page.goBack()` doesn't settle — let it fail loudly (Ambiguity 2; this IS the D-04 re-verification mechanism).
- Do NOT use `test.fail()`/`test.fixme()` to mark stale cells — use a plain `expect()` that is genuinely red (RESEARCH.md Pattern 3 note + Anti-Patterns).
- The `page.waitForTimeout(300)` settle margin AFTER an already-awaited `networkidle` IS a justified carry-over (empirically necessary in Phase 24 for `startTransition` to commit) — keep this one `waitForTimeout` use, do not remove it as a blanket "no waitForTimeout" cleanup.

**Request-log capture setup** (needed once per test, register before navigation):
```typescript
const requestLog: { pathname: string; resourceType: string; headers: Record<string,string> }[] = []
page.on('request', (req) => {
  const url = new URL(req.url())
  requestLog.push({ pathname: url.pathname, resourceType: req.resourceType(), headers: req.headers() })
})
```

## Shared Patterns

### DB-Isolation Guard (applies to `global-setup.ts` + any mutator helper)
**Source:** `scripts/diagnose-freshness.mts:42-49`, with the WR-01 allow-list fix (`e2e/helpers/build-guard.ts` above).
**Apply to:** `e2e/global-setup.ts` (primary call site) and any helper that opens a second Prisma client (defense-in-depth re-check, matching the diagnosis script's "run twice" comment at lines 38-41).

### Env-First Dynamic Import (applies to every `.ts`/`.mts` file that imports `lib/prisma.js` or `lib/auth.js`)
**Source:** `scripts/local-resync.mts:12-28`, `scripts/diagnose-freshness.mts:51-66`.
**Apply to:** `e2e/global-setup.ts`, `e2e/seed.ts` — load `.env.test` via `dotenv.config()` BEFORE any dynamic `import('../lib/prisma.js')`; static imports are hoisted in ESM and would read `process.env` too early.

### Retry-Safe DOM Read (`waitVisible` + `dumpUnrecognizedState`)
**Source:** `scripts/diagnose-freshness.mts:484-508`.
**Apply to:** All four functions in `e2e/helpers/readers.ts` — this is what prevents a reader from throwing a hard error on a transitional/mid-`startTransition` DOM state instead of returning a diagnosable `'(unrecognized state)'`.

### RSC-Fetch Network Evidence (`isRscRequest`)
**Source:** `scripts/diagnose-freshness.mts:131-134`.
**Apply to:** Every assertion in all three freshness-regression spec files — D-03 requires pairing DOM assertions with this network-evidence check.

### Setup-Project Auth (`storageState`, D-10)
**Source:** RESEARCH.md Code Examples (`e2e/auth.setup.ts` block) — new pattern for this repo, not a port from an existing analog, since this app's only prior auth-in-tests approach (`computeAuthToken()` direct injection in the diagnosis script) is explicitly rejected by D-10.
**Apply to:** `playwright.config.ts`'s `chromium` project (`dependencies: ['setup']`, `use: { storageState }`) — every spec file inherits this, no per-spec login code.

## No Analog Found

None — every file in scope has at least a role-match analog, since `scripts/diagnose-freshness.mts` (1167 lines, empirically validated against this exact app) already implements nearly every hard part this phase needs, and RESEARCH.md's Code Examples section already resolves the handful of places where the analog's shape must change (webServer config replacing hand-rolled orchestration; setup-project auth replacing direct cookie injection; native `page.goBack()` replacing the manual history-dance).

## Metadata

**Analog search scope:** `scripts/diagnose-freshness.mts` (full 1167-line read across 3 passes: lines 1-200, 460-570, targeted greps for auth/reader/locator patterns), `scripts/local-resync.mts` (first 40 lines — env-first import convention), `.planning/phases/25-e2e-test-infrastructure-baselines/25-RESEARCH.md` (full read — already contains synthesized/authoritative code examples for the files with no pre-existing in-repo analog: `playwright.config.ts`, `e2e/auth.setup.ts`)
**Files scanned:** 2 script files (grep + targeted reads), 1 CONTEXT.md, 1 RESEARCH.md
**Pattern extraction date:** 2026-07-11
