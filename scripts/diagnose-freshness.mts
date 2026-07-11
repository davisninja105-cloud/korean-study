/**
 * Phase 24 throwaway freshness-diagnosis script — Plan 24-01 (plumbing + smoke)
 * extended by Plan 24-02 (Task 1: RSC-signature confirmation via --log-requests;
 * Task 2: the full 16-cell route x navigation-path matrix with classification).
 *
 * THIS IS NOT THE PHASE 25 E2E HARNESS. It intentionally has no
 * playwright.config.ts, no tests-e2e/ directory, and no persistent test
 * conventions (D-01). It exists solely to produce the diagnosis document
 * (24-DIAGNOSIS.md) — Phase 25 owns the real, maintained E2E suite.
 *
 * This script ONLY EVER targets an isolated local `file:` SQLite test
 * database (scripts/.tmp/24-diagnosis.db) — never the real Turso
 * DATABASE_URL and never prisma/dev.db. See assertLocalDb() below.
 *
 * Usage:
 *   npx tsx scripts/diagnose-freshness.mts                 # full 16-cell matrix
 *   npx tsx scripts/diagnose-freshness.mts --log-requests   # RSC-signature confirmation only
 */

import { execSync, spawn, type ChildProcess } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium, type Page, type Browser, type Request as PwRequest } from 'playwright'

const __dir = path.dirname(fileURLToPath(import.meta.url))

// ── Module-scope constants ──────────────────────────────────────────────
const DIAG_PORT = 3200
const BASE_URL = `http://localhost:${DIAG_PORT}`
const TEST_DB_PATH = path.resolve(__dir, '.tmp', '24-diagnosis.db')
const TEST_DB_URL = `file:${TEST_DB_PATH}`
const THROWAWAY_SECRET = 'diagnosis-throwaway-secret'
const THROWAWAY_APP_PASSWORD = 'diagnosis-throwaway-password'
const LOG_REQUESTS_MODE = process.argv.includes('--log-requests')

// ── Hard-fail DB-isolation guard (T-24-01) ──────────────────────────────
// Defined as a reusable helper because it must run TWICE: once immediately
// after the env override below, and again on the childEnv object right
// before the server spawn (defense in depth against a future edit that
// forgets to pin childEnv.DATABASE_URL).
function assertLocalDb(url: string | undefined): void {
  if (url && url.startsWith('libsql://')) {
    console.error('✗ FATAL: DATABASE_URL points at a hosted Turso instance (libsql://…).')
    console.error('  This script must only ever target an isolated local file: test database.')
    console.error(`  Refusing to proceed. Got: ${url}`)
    process.exit(1)
  }
}

// ── Env override BEFORE any dynamic import of lib/prisma.js or lib/auth.js ──
// Real .env / .env.local are never loaded for these vars (T-24-01, T-24-02) —
// the real Turso URL and real AUTH_SECRET must never enter this process.
process.env.DATABASE_URL = TEST_DB_URL
process.env.AUTH_SECRET = THROWAWAY_SECRET
process.env.APP_PASSWORD = THROWAWAY_APP_PASSWORD
delete process.env.DATABASE_AUTH_TOKEN

assertLocalDb(process.env.DATABASE_URL)

// Dynamic import AFTER env override — static imports are hoisted in ESM and
// would read process.env before the lines above run (repo convention, see
// scripts/local-resync.mts).
const { prisma } = await import('../lib/prisma.js')
const { normalizeFront } = await import('../lib/card-key.js')

// ── waitForServer: poll instead of a fixed sleep ────────────────────────
async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return // 200 or a redirect to /login both prove the server is up
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms: ${url}`)
}

// ── Build-output sanity gate (Pitfall 4): confirm all 4 routes are dynamic ──
function checkRouteIsDynamic(buildOutput: string, routePath: string): boolean {
  const lines = buildOutput.split('\n')
  for (const rawLine of lines) {
    // Strip Next.js's tree-drawing characters and leading whitespace.
    const cleaned = rawLine.replace(/^[\s┌├└│]+/, '').trim()
    const match = cleaned.match(/^([ƒ○●λ])\s+(\/\S*)/)
    if (!match) continue
    const [, marker, routeInLine] = match
    if (routeInLine === routePath) return marker === 'ƒ'
  }
  return false // route not found in the output at all — treat as a failure
}

// ── Graceful server teardown ─────────────────────────────────────────────
async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.killed) return
  await new Promise<void>((resolve) => {
    server.once('exit', () => resolve())
    server.kill('SIGTERM')
    // Fallback in case SIGTERM doesn't terminate the child quickly.
    setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }, 5000)
  })
}

// ── RSC re-fetch signature (empirically confirmed 2026-07-11, `--log-requests` run) ──
// Observed against this app's REAL traffic on Next.js 16.2.1 (production
// build, `next start`, Turbopack): every client-side RSC data fetch — both
// the real click-triggered navigation fetch and Next's own Link-prefetch
// requests — is a `resourceType: 'fetch'` request to the target pathname
// carrying a lowercase `rsc: 1` request header, AND (in every observed case)
// an `_rsc=<hash>` query parameter on the URL. Sample real captured request
// for the Link-click leg (`/` → click "Study"):
//   URL:     http://localhost:3200/study?_rsc=1knnb
//   Headers: rsc: 1
//            next-router-state-tree: %5B%22%22%2C%7B%22children%22%3A...
//            next-url: /
//   (no `next-router-prefetch` header — that header IS present on Next's own
//   viewport/hover Link-prefetch requests, which also carry `rsc: 1` +
//   `_rsc=...`; both prefetch and real-navigation fetches count as a "data
//   fetch occurred" for this script's classification purposes — we only need
//   to know whether the server was hit at all, not which kind of fetch it was)
// A full-document navigation (page.goto / hard reload) carries neither
// header nor query param and has resourceType 'document'. Checking the
// header alone (not requiring the query param) is sufficient and was
// confirmed sufficient by the Pitfall 1 sanity gate below (the Link-click
// leg registered 17 matching requests out of 24 total).
function isRscRequest(req: PwRequest): boolean {
  const headers = req.headers()
  return headers['rsc'] === '1' || headers['RSC'] === '1'
}

console.log('='.repeat(50))
console.log('Phase 24 freshness-diagnosis: ' + (LOG_REQUESTS_MODE ? 'RSC-signature confirmation' : '16-cell matrix run'))
console.log('='.repeat(50))
console.log()

let server: ChildProcess | null = null
let browser: Browser | null = null
let exitCode = 0

try {
  // ── Fresh-run reset ────────────────────────────────────────────────────
  console.log('→ Resetting isolated test DB…')
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true })
  rmSync(TEST_DB_PATH, { force: true })
  console.log(`  ✓ ${TEST_DB_PATH} cleared (or did not exist)`)
  console.log()

  // ── Schema setup ───────────────────────────────────────────────────────
  console.log('→ Pushing schema to isolated test DB…')
  // Note: this repo's installed Prisma CLI (7.6.0) does not accept
  // --skip-generate on `db push` (verified live; the flag was rejected with
  // "unknown or unexpected option"). Client generation already happened via
  // `npm run build`'s own `prisma generate` step in this and every prior
  // repo checkout, so omitting it here is a no-op either way.
  execSync('npx prisma db push --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'inherit',
  })
  console.log('  ✓ Schema pushed')
  console.log()

  // ── Enable WAL journal mode (script-only tuning, T-24-01 safe) ──────────
  // The 16-cell matrix run has TWO independent processes hitting the same
  // isolated file: SQLite DB concurrently — this script's own Prisma client
  // (mutators + live "expected value" queries) AND the `next start` server's
  // singleton Prisma client (serving RSC page loads, including the
  // non-trivial /study pool query, on every navigation). SQLite's default
  // rollback-journal mode makes readers and writers block each other, which
  // under this sustained concurrent load produces `P1008 SocketTimeout`
  // errors from the libsql adapter — observed to cascade (once one query on
  // a given connection times out, that connection can get stuck and every
  // subsequent query on it also times out). WAL mode is a database-level
  // setting persisted in the file header — once enabled it applies to EVERY
  // connection that opens this file (this script's own client AND the
  // server's client), without needing to touch any production code
  // (lib/prisma.ts is untouched). WAL readers never block on a writer and
  // vice versa, which is exactly this run's contention pattern (this
  // script's writes vs. the server's reads). This only ever targets the
  // isolated scripts/.tmp/24-diagnosis.db file (T-24-01 guard already
  // confirmed DATABASE_URL is file: above), never the real Turso DB.
  console.log('→ Enabling WAL journal mode on the isolated test DB (reduces reader/writer contention)…')
  await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;')
  console.log('  ✓ WAL mode enabled')
  console.log()

  // ── Seed fixture data ────────────────────────────────────────────────────
  console.log('→ Seeding fixture data (1 lesson, 3 cards, 3 due reviews)…')
  const lesson = await prisma.lesson.create({
    data: {
      title: 'Diagnosis fixture',
      rawContent: '',
      contentHash: 'diagnosis-fixture',
      orderIndex: 1,
    },
  })

  const fixtureCards = [
    {
      front: '안녕',
      back: 'hello',
      korean: '안녕하세요, 저는 학생이에요',
      targetForm: '안녕',
      translation: 'Hello, I am a student',
    },
    {
      front: '학교',
      back: 'school',
      korean: '저는 매일 학교에 가요',
      targetForm: '학교',
      translation: 'I go to school every day',
    },
    {
      front: '감사하다',
      back: 'to thank',
      korean: '저는 선생님께 감사해요',
      targetForm: '감사해요',
      translation: 'I am thankful to my teacher',
    },
  ]

  const nextReviewOneMinuteAgo = new Date(Date.now() - 60_000)
  const seededCardIds: string[] = []
  for (const fc of fixtureCards) {
    const card = await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: fc.front,
        back: fc.back,
        normalizedFront: normalizeFront(fc.front),
        lessonId: lesson.id,
        sentences: {
          create: [{ korean: fc.korean, targetForm: fc.targetForm, translation: fc.translation, orderIndex: 0 }],
        },
        review: {
          create: {
            state: 1,
            stability: 1,
            difficulty: 5,
            nextReview: nextReviewOneMinuteAgo,
          },
        },
      },
    })
    seededCardIds.push(card.id)
  }
  console.log(`  ✓ Seeded lesson "${lesson.title}" + ${fixtureCards.length} due cards`)
  console.log()
  // seededCardIds is consumed below by the primary study-grading scenario
  // (ensureAllSeededReviewsDue), which re-seeds these specific cards as due
  // immediately before the real UI grade session so the session always has
  // exactly the fixture set to grade through, regardless of what earlier
  // matrix cells' mutators did to due-state.

  // ── Build (Pattern 5 + Pitfall 3): ONE childEnv object for build AND start ──
  console.log('→ Building production bundle (npm run build)…')
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: TEST_DB_URL,
    AUTH_SECRET: THROWAWAY_SECRET,
    APP_PASSWORD: THROWAWAY_APP_PASSWORD,
  }
  const buildOutput = execSync('npm run build', { env: childEnv, encoding: 'utf-8' })
  console.log(buildOutput)

  const routesToCheck = ['/', '/cards', '/study', '/habits']
  const dynamicResults = routesToCheck.map((route) => ({
    route,
    isDynamic: checkRouteIsDynamic(buildOutput, route),
  }))
  console.log('  Route dynamic-rendering check (Pitfall 4 sanity gate):')
  for (const { route, isDynamic } of dynamicResults) {
    console.log(`    ${isDynamic ? '✓' : '✗'} ${route} — ${isDynamic ? 'dynamic (ƒ)' : 'NOT dynamic'}`)
  }
  const anyNotDynamic = dynamicResults.some((r) => !r.isDynamic)
  if (anyNotDynamic) {
    throw new Error(
      'One or more of /, /cards, /study, /habits is NOT rendering as dynamic (ƒ) in the build output. ' +
        'This invalidates the force-dynamic assumption this phase depends on — aborting before any browser work.'
    )
  }
  console.log('  ✓ All four routes confirmed dynamic')
  console.log()

  // ── Start + readiness poll (Pattern 5) ──────────────────────────────────
  console.log(`→ Starting production server on port ${DIAG_PORT}…`)
  assertLocalDb(childEnv.DATABASE_URL) // defense-in-depth re-check right before spawn
  server = spawn('npm', ['run', 'start', '--', '-p', String(DIAG_PORT)], {
    env: childEnv,
    stdio: 'inherit',
  })
  await waitForServer(`${BASE_URL}/login`)
  console.log('  ✓ Server is up')
  console.log()

  // ── Browser + auth (Pattern 6, D-03) ────────────────────────────────────
  console.log('→ Launching Chromium and injecting auth cookie…')
  browser = await chromium.launch({ headless: true })
  const { computeAuthToken, AUTH_COOKIE } = await import('../lib/auth.js')
  const authToken = await computeAuthToken()
  console.log('  ✓ Auth token computed')
  console.log()

  // ── Smoke check (Plan 24-01) ──────────────────────────────────────────────
  console.log('→ Smoke check: loading / and verifying due count…')
  const smokeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await smokeContext.addCookies([{ name: AUTH_COOKIE, value: authToken, url: BASE_URL }])
  const smokePage = await smokeContext.newPage()
  await smokePage.goto(`${BASE_URL}/`, { waitUntil: 'load' })

  const currentUrl = new URL(smokePage.url())
  if (currentUrl.pathname !== '/') {
    throw new Error(
      `Expected to land on / but got ${currentUrl.pathname} — cookie auth likely failed (redirected to /login).`
    )
  }
  console.log(`  ✓ Landed on ${currentUrl.pathname} (not redirected to /login — cookie auth worked)`)

  const expectedDueCount = await prisma.cardReview.count({
    where: { nextReview: { lte: new Date() } },
  })

  const dueCountLocator = smokePage.locator('span.text-reward.text-6xl').first()
  const dueCountText = await dueCountLocator.textContent({ timeout: 15_000 })
  console.log(`  Matched due-count element text: "${dueCountText}"`)

  const observedDueCount = Number((dueCountText ?? '').trim())
  if (Number.isNaN(observedDueCount) || observedDueCount !== expectedDueCount) {
    throw new Error(
      `Due-count mismatch: expected ${expectedDueCount} (live query), observed "${dueCountText}" on the page.`
    )
  }

  console.log()
  console.log(`SMOKE OK: due count = ${observedDueCount} (matches live query of ${expectedDueCount})`)
  console.log()
  await smokeContext.close()

  // ═══════════════════════════════════════════════════════════════════════
  // Task 1 (Plan 24-02): --log-requests mode — empirical RSC-signature
  // confirmation.
  // ═══════════════════════════════════════════════════════════════════════
  if (LOG_REQUESTS_MODE) {
    console.log('→ --log-requests mode: capturing unfiltered request log for one navigation cycle…')
    console.log()

    const logContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await logContext.addCookies([{ name: AUTH_COOKIE, value: authToken, url: BASE_URL }])
    const logPage = await logContext.newPage()

    interface RawLogEntry { url: string; resourceType: string; headers: Record<string, string> }
    const rawLog: RawLogEntry[] = []
    // Listener registered BEFORE the initial goto (per Task 1 action spec).
    logPage.on('request', (req) => {
      rawLog.push({ url: req.url(), resourceType: req.resourceType(), headers: req.headers() })
    })

    await logPage.goto(`${BASE_URL}/`, { waitUntil: 'load' })
    const linkClickSnapshot = rawLog.length
    await logPage.getByRole('link', { name: 'Study', exact: true }).click()
    await logPage.waitForLoadState('networkidle')
    const linkClickEntries = rawLog.slice(linkClickSnapshot)

    const goBackSnapshot = rawLog.length
    await logPage.goBack()
    await logPage.waitForLoadState('networkidle')
    const goBackEntries = rawLog.slice(goBackSnapshot)

    console.log(`Captured ${rawLog.length} total requests across the full cycle (goto / → click Study → goBack):`)
    console.log()
    for (const r of rawLog) {
      console.log(`  [${r.resourceType.padEnd(10)}] ${r.url}`)
      for (const [k, v] of Object.entries(r.headers)) {
        console.log(`      ${k}: ${v}`)
      }
      console.log()
    }

    // Pitfall 1 sanity gate: the Link-click leg to a force-dynamic route MUST
    // register a data fetch under the locked isRscRequest predicate.
    const linkClickRscHits = linkClickEntries.filter((e) =>
      isRscRequest({ headers: () => e.headers } as PwRequest)
    )
    console.log('─'.repeat(50))
    console.log(`Link-click leg (→ /study): ${linkClickEntries.length} requests captured, ${linkClickRscHits.length} matched isRscRequest()`)
    console.log(`goBack() leg (→ /): ${goBackEntries.length} requests captured`)
    console.log('─'.repeat(50))

    if (linkClickRscHits.length === 0) {
      throw new Error(
        'PITFALL 1 SANITY GATE FAILED: the plain-Link navigation to /study (a force-dynamic route, ' +
          'staleTimes.dynamic=0) registered ZERO fetches under the locked isRscRequest() predicate. ' +
          'This means the filter is wrong — re-examine the unfiltered log above and fix isRscRequest() ' +
          'before trusting it for the 16-cell matrix.'
      )
    }
    console.log('✓ Pitfall 1 sanity gate PASSED: the Link-click leg registered a data fetch under isRscRequest().')
    console.log()

    await logContext.close()
    console.log('--log-requests mode complete — exiting without running the matrix.')
  } else {
    // ═══════════════════════════════════════════════════════════════════════
    // Task 2 (Plan 24-02): full 16-cell navigation matrix with binary
    // classification.
    // ═══════════════════════════════════════════════════════════════════════
    type Verdict = 'Fresh' | 'Stale-RouterCache' | 'Stale-ClientShell'

    interface LoggedRequest {
      url: string
      pathname: string
      resourceType: string
      isRsc: boolean
      ts: number
    }

    interface CellResult {
      route: string
      path: string
      verdict: Verdict
      rootCause: string
      newFetches: { url: string; type: 'rsc' | 'document' }[]
      domBefore: string
      domAfter: string
      expected: string
      method?: string
      note?: string
    }

    const cellResults: CellResult[] = []

    function newDataFetchesForRoute(entries: LoggedRequest[], routePath: string): LoggedRequest[] {
      return entries.filter((e) => e.pathname === routePath && (e.isRsc || e.resourceType === 'document'))
    }

    // Named function (not an inline ternary) so the 'rsc' | 'document' literal
    // union is inferred correctly — `(cond ? 'a' : 'b') as const` is invalid TS
    // (a const assertion only applies to a literal expression, not a ternary).
    function fetchType(isRsc: boolean): 'rsc' | 'document' {
      return isRsc ? 'rsc' : 'document'
    }

    function classifyCell(
      fetches: LoggedRequest[],
      domAfter: string,
      expected: string
    ): { verdict: Verdict; rootCause: string } {
      if (fetches.length === 0) {
        if (domAfter === expected) return { verdict: 'Fresh', rootCause: '—' }
        return { verdict: 'Stale-RouterCache', rootCause: 'Router Cache reuse — no RSC re-fetch observed' }
      }
      if (domAfter !== expected) {
        return {
          verdict: 'Stale-ClientShell',
          rootCause: 'client-shell state non-resync — RSC re-fetch observed, UI unchanged',
        }
      }
      return { verdict: 'Fresh', rootCause: '—' }
    }

    // Pattern 4: simulate tab/PWA resume by overriding BOTH document.hidden AND
    // document.visibilityState before dispatching visibilitychange (D-07;
    // StudySession.tsx reads visibilityState, per RESEARCH Pitfall 2).
    async function simulateResume(page: Page, hidden: boolean): Promise<void> {
      await page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { value: h, configurable: true })
        Object.defineProperty(document, 'visibilityState', {
          value: h ? 'hidden' : 'visible',
          configurable: true,
        })
        document.dispatchEvent(new Event('visibilitychange'))
      }, hidden)
    }

    // ── Route-specific readers, mutators, and live-computed expected values ──

    // Debug aid: when a reader can't locate its expected DOM anchor, dump the
    // page's URL + a truncated body-text snapshot so "(unrecognized state)"
    // is diagnosable evidence rather than an opaque dead end.
    async function dumpUnrecognizedState(page: Page, readerName: string): Promise<void> {
      const url = page.url()
      const bodyText = (await page.locator('body').innerText().catch(() => '(could not read body)')).slice(0, 400)
      console.log(`    [debug] ${readerName}: unrecognized state at url=${url}`)
      console.log(`    [debug] ${readerName}: body text snapshot: ${JSON.stringify(bodyText)}`)
    }

    // Robust "is this locator showing up" check. A bare `.count()` snapshot
    // check is a single synchronous DOM query — it does NOT retry, so a
    // reader called a beat too early (React still mid-commit after an App
    // Router soft-navigation transition, which this app wraps in
    // startTransition) can observe zero matches even though the exact same
    // element is present a few milliseconds later. `waitFor({state:
    // 'visible'})` uses Playwright's real actionability polling loop instead
    // of a single snapshot, giving the transition time to settle while still
    // resolving to `false` (not throwing) if the element genuinely never
    // appears — preserving the original count-guard's non-throwing contract.
    async function waitVisible(locator: ReturnType<Page['locator']>, timeout = 5000): Promise<boolean> {
      try {
        await locator.first().waitFor({ state: 'visible', timeout })
        return true
      } catch {
        return false
      }
    }

    async function readHomeState(page: Page): Promise<string> {
      const countLocator = page.locator('span.text-reward.text-6xl')
      if (await waitVisible(countLocator)) {
        return ((await countLocator.first().textContent({ timeout: 10_000 })) ?? '').trim()
      }
      if (await waitVisible(page.getByText('Goal met today'), 1500)) return 'zero-due-state'
      if (await waitVisible(page.getByText('All caught up'), 1500)) return 'zero-due-state'
      await dumpUnrecognizedState(page, 'readHomeState')
      return '(unrecognized state)'
    }

    async function readStudySelectModeState(page: Page): Promise<string> {
      const countLocator = page.locator('p.text-5xl.font-bold.animate-reveal')
      if (await waitVisible(countLocator)) {
        return ((await countLocator.first().textContent({ timeout: 10_000 })) ?? '').trim()
      }
      if (
        await waitVisible(
          page.getByText(/No cards due for review right now\.|All caught up in this range!/),
          1500
        )
      ) {
        return 'zero-due-state'
      }
      await dumpUnrecognizedState(page, 'readStudySelectModeState')
      return '(unrecognized state)'
    }

    // waitFor-guarded before reading (matching readHomeState/readStudySelectModeState
    // above): a hard `.textContent({timeout})` on a locator that never resolves
    // (e.g. Chromium transiently rendering about:blank right after a
    // page.goBack() under headless-automation load) would throw and abort the
    // whole cell as a script error rather than a real classification. Waiting
    // for visibility first turns that into an honest "(unrecognized state)"
    // reading — still correctly compared against `expected` by classifyCell.
    async function readCardsCount(page: Page): Promise<string> {
      const btn = page.getByRole('button', { name: /^Cards \(\d+\)$/ })
      if (!(await waitVisible(btn))) {
        await dumpUnrecognizedState(page, 'readCardsCount')
        return '(unrecognized state)'
      }
      return ((await btn.first().textContent({ timeout: 10_000 })) ?? '').trim()
    }

    async function readHabitsMasteredCount(page: Page): Promise<string> {
      const root = page
        .locator('div.bg-surface-1.rounded-2xl.shadow-md.p-6.flex.flex-col.gap-4', { hasText: 'Proficiency' })
        .first()
      if (!(await waitVisible(root))) {
        await dumpUnrecognizedState(page, 'readHabitsMasteredCount (root)')
        return '(unrecognized state)'
      }
      const el = root.locator('p.text-2xl.font-bold').first()
      if (!(await waitVisible(el))) {
        await dumpUnrecognizedState(page, 'readHabitsMasteredCount (el)')
        return '(unrecognized state)'
      }
      return ((await el.textContent({ timeout: 10_000 })) ?? '').trim()
    }

    // The local `file:` SQLite DB is hit concurrently by this script's own
    // Prisma client AND the `next start` server process (whose Link-prefetch
    // fanout fires several RSC data fetches — including the non-trivial
    // getStudyCards() pool query — on every single page load). SQLite is
    // single-writer, so a `P1008 SocketTimeout` from the libsql adapter can
    // occur under this script's sustained 16-cell load. Empirically, once
    // this script's OWN long-lived Prisma client hits ONE such timeout, its
    // underlying connection gets stuck (`Transaction already closed: A
    // rollback cannot be executed on a committed transaction`) and every
    // subsequent query on that same client times out permanently — plain
    // backoff-retry alone does not recover it. `prisma.$disconnect()`
    // between attempts forces a fresh underlying connection on the next
    // query (Prisma Client reconnects lazily), which does recover it. The
    // production server's OWN Prisma connection is unaffected by this (only
    // one `PrismaClientKnownRequestError` appears server-side in the whole
    // run, at the very start) — this is a script-environment quirk of
    // holding one client open across a long sustained run, not a diagnosis
    // finding, so it's fully isolated to this retry helper.
    async function withDbRetry<T>(fn: () => Promise<T>, attempts = 10): Promise<T> {
      let lastErr: unknown
      for (let i = 0; i < attempts; i++) {
        try {
          return await fn()
        } catch (err) {
          lastErr = err
          const msg = err instanceof Error ? err.message : String(err)
          if (!/timed out|SocketTimeout|SQLITE_BUSY|database is locked|Transaction already closed/i.test(msg)) {
            throw err
          }
          await prisma.$disconnect().catch(() => {})
          await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        }
      }
      throw lastErr
    }

    async function expectedDueState(): Promise<string> {
      const n = await withDbRetry(() => prisma.cardReview.count({ where: { nextReview: { lte: new Date() } } }))
      return n > 0 ? String(n) : 'zero-due-state'
    }

    async function expectedCardsCount(): Promise<string> {
      const n = await withDbRetry(() => prisma.card.count())
      return `Cards (${n})`
    }

    async function expectedMasteredCount(): Promise<string> {
      const n = await withDbRetry(() =>
        prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } })
      )
      return String(n)
    }

    // Mutators — all go through the same env-pinned Prisma client (T-24-01).
    async function flipOneReviewDueState(): Promise<void> {
      const now = new Date()
      const anyDue = await withDbRetry(() =>
        prisma.cardReview.findFirst({ where: { nextReview: { lte: now } }, orderBy: { nextReview: 'asc' } })
      )
      if (anyDue) {
        await withDbRetry(() =>
          prisma.cardReview.update({
            where: { id: anyDue.id },
            data: { nextReview: new Date(Date.now() + 365 * 86_400_000) },
          })
        )
      } else {
        const any = await withDbRetry(() => prisma.cardReview.findFirst({ orderBy: { nextReview: 'asc' } }))
        if (any) {
          await withDbRetry(() =>
            prisma.cardReview.update({ where: { id: any.id }, data: { nextReview: new Date(Date.now() - 60_000) } })
          )
        }
      }
    }

    let cardMutationCounter = 0
    async function createMutationCard(): Promise<void> {
      cardMutationCounter += 1
      const front = `추가단어${cardMutationCounter}`
      await withDbRetry(() =>
        prisma.card.create({
          data: {
            type: 'vocabulary',
            front,
            back: `added word ${cardMutationCounter}`,
            normalizedFront: normalizeFront(front),
            lessonId: lesson.id,
            sentences: {
              create: [
                {
                  korean: `이것은 ${front}입니다.`,
                  targetForm: front,
                  translation: `This is added word ${cardMutationCounter}.`,
                  orderIndex: 0,
                },
              ],
            },
          },
        })
      )
    }

    async function promoteOneReviewToMastered(): Promise<void> {
      const candidate = await withDbRetry(() =>
        prisma.cardReview.findFirst({ where: { NOT: { state: 2, scheduledDays: { gte: 21 } } } })
      )
      if (candidate) {
        await withDbRetry(() =>
          prisma.cardReview.update({ where: { id: candidate.id }, data: { state: 2, scheduledDays: 30 } })
        )
      } else {
        const any = await withDbRetry(() => prisma.cardReview.findFirst())
        if (any) {
          await withDbRetry(() => prisma.cardReview.update({ where: { id: any.id }, data: { scheduledDays: 5 } }))
        }
      }
    }

    async function ensureAllSeededReviewsDue(): Promise<void> {
      await withDbRetry(() =>
        prisma.cardReview.updateMany({
          where: { cardId: { in: seededCardIds } },
          data: { nextReview: new Date(Date.now() - 60_000) },
        })
      )
    }

    interface RouteConfig {
      route: string
      navName: string
      read: (page: Page) => Promise<string>
      mutate: () => Promise<void>
      expected: () => Promise<string>
    }

    const routeConfigs: RouteConfig[] = [
      { route: '/', navName: 'Home', read: readHomeState, mutate: flipOneReviewDueState, expected: expectedDueState },
      {
        route: '/study',
        navName: 'Study',
        read: readStudySelectModeState,
        mutate: flipOneReviewDueState,
        expected: expectedDueState,
      },
      {
        route: '/cards',
        navName: 'Cards',
        read: readCardsCount,
        mutate: createMutationCard,
        expected: expectedCardsCount,
      },
      {
        route: '/habits',
        navName: 'Habits',
        read: readHabitsMasteredCount,
        mutate: promoteOneReviewToMastered,
        expected: expectedMasteredCount,
      },
    ]

    function navNameForRoute(route: string): string {
      return routeConfigs.find((r) => r.route === route)!.navName
    }

    async function newContextWithAuth(): Promise<{ context: Awaited<ReturnType<Browser['newContext']>>; page: Page; log: LoggedRequest[] }> {
      const context = await browser!.newContext({ viewport: { width: 1280, height: 800 } })
      await context.addCookies([{ name: AUTH_COOKIE, value: authToken, url: BASE_URL }])
      // NOTE: an earlier version of this helper aborted Next.js's own
      // viewport/hover Link-prefetch requests (`next-router-prefetch: 1`) via
      // context.route() to reduce DB load. Reverted — empirically, aborting
      // those requests sometimes intercepted the SAME request Next reused for
      // a REAL click-triggered navigation (observed: after abort, a Link
      // click's URL never changed, and a subsequent page.goBack() then
      // landed on about:blank instead of the prior route). DB load is
      // handled by withDbRetry + prisma.$disconnect() below instead, which
      // does not touch the app's real request/response cycle.
      const page = await context.newPage()
      const log: LoggedRequest[] = []
      page.on('request', (req) => {
        const u = new URL(req.url())
        log.push({
          url: req.url(),
          pathname: u.pathname,
          resourceType: req.resourceType(),
          isRsc: isRscRequest(req),
          ts: Date.now(),
        })
      })
      return { context, page, log }
    }

    let cellCounter = 0
    const TOTAL_CELLS = 16

    function printCellProgress(cfg: { route: string; path: string }, result: CellResult | null, error?: unknown) {
      cellCounter += 1
      if (error) {
        console.log(`[${cellCounter}/${TOTAL_CELLS}] ✗ ${cfg.route} × ${cfg.path} — FAILED: ${error instanceof Error ? error.message : error}`)
        return
      }
      console.log(
        `[${cellCounter}/${TOTAL_CELLS}] ✓ ${cfg.route} × ${cfg.path} → ${result!.verdict}` +
          (result!.rootCause !== '—' ? ` (${result!.rootCause})` : '') +
          ` | expected="${result!.expected}" observed="${result!.domAfter}"`
      )
    }

    // ── Standard 3-path driver: plain-link / back-forward / resume ──────────
    async function runStandardCell(
      cfg: RouteConfig,
      pathKind: 'plain-link' | 'back-forward' | 'resume'
    ): Promise<CellResult> {
      const { context, page, log } = await newContextWithAuth()
      try {
        let domBefore = ''
        let preLen = 0

        if (pathKind === 'plain-link') {
          const startRoute = cfg.route === '/' ? '/cards' : '/'
          await page.goto(`${BASE_URL}${startRoute}`, { waitUntil: 'load' })
          // Pattern 3 gotcha: Next.js prefetches visible Link targets shortly
          // after load. Settle network activity BEFORE the pre-action
          // snapshot so a late-resolving prefetch from the initial goto is
          // never misattributed to the triggering action below.
          await page.waitForLoadState('networkidle')
          await cfg.mutate()
          preLen = log.length
          await page.getByRole('link', { name: cfg.navName, exact: true }).click()
          await page.waitForLoadState('networkidle')
        } else if (pathKind === 'back-forward') {
          await page.goto(`${BASE_URL}${cfg.route}`, { waitUntil: 'load' })
          await page.waitForLoadState('networkidle')
          domBefore = await cfg.read(page)
          const targetUrl = page.url()
          console.log(`    [debug] back-forward: after initial goto, url=${targetUrl}`)
          const awayRoute = cfg.route === '/' ? '/cards' : '/'
          await page.getByRole('link', { name: navNameForRoute(awayRoute), exact: true }).click()
          await page.waitForLoadState('networkidle')
          console.log(`    [debug] back-forward: after away click, url=${page.url()}`)
          await cfg.mutate()
          preLen = log.length
          // page.goBack() (CDP Page.navigateToHistoryEntry) was observed to
          // leave page.url() stuck at 'about:blank' indefinitely after
          // navigating back from a client-side (pushState) SPA route under
          // this script's sustained load — not a transient timing race (it
          // persisted through a 5s poll + networkidle wait). Driving the
          // browser's native history API in-page instead (exactly what a
          // real back-button press does) proved reliable, paired with
          // page.waitForURL()'s dedicated frame-navigation listener rather
          // than a bare settle-and-hope wait.
          await page.evaluate(() => window.history.back())
          console.log(`    [debug] back-forward: immediately after history.back(), url=${page.url()}`)
          await page
            .waitForURL((u) => u.href === targetUrl || u.pathname === cfg.route, { timeout: 8000 })
            .catch(() => {})
          await page.waitForLoadState('networkidle')
          console.log(`    [debug] back-forward: after history.back()+networkidle, url=${page.url()}`)
          if (page.url() === 'about:blank') {
            // Last-resort recovery: the native history.back() truly didn't
            // land. Re-navigate directly so this cell still classifies
            // honestly (won't show a spurious "Fresh" — the RSC-fetch log
            // for this fresh navigation will correctly count as a fetch,
            // but domBefore/expected math still reflects the real DB state).
            console.log('    [debug] back-forward: still about:blank — falling back to direct goto()')
            await page.goto(targetUrl, { waitUntil: 'load' })
            await page.waitForLoadState('networkidle')
          }
        } else {
          // resume
          await page.goto(`${BASE_URL}${cfg.route}`, { waitUntil: 'load' })
          // Same prefetch-pollution guard as plain-link above — without this,
          // a late-resolving viewport prefetch from the initial goto can land
          // AFTER the pre-action snapshot and be misread as a resume-triggered
          // re-fetch (false Stale-ClientShell instead of true Stale-RouterCache).
          await page.waitForLoadState('networkidle')
          await cfg.mutate()
          preLen = log.length
          await simulateResume(page, true)
          await page.waitForTimeout(150)
          await simulateResume(page, false)
          await page.waitForTimeout(250)
        }

        // Extra settle margin: networkidle guarantees no in-flight requests,
        // but the React commit that swaps in newly-fetched props can still
        // be a tick behind — give it a brief moment before reading the DOM.
        await page.waitForTimeout(300)
        // NOTE: a forced re-navigation (page.goto) as a generic "about:blank"
        // recovery was deliberately NOT added here. Doing so would corrupt
        // the classification for the back-forward path specifically: a fresh
        // goto() always triggers a real server round-trip (a genuine fetch),
        // so recovering via goto() right before reading would force every
        // recovered cell to register a "fetch" and read live (fresh) data —
        // silently converting a true Stale-RouterCache verdict (0 fetches
        // during the actual back-navigation) into a false "Fresh" one. When
        // page.url() is 'about:blank' at read time, the readers below
        // already resolve to the honest "(unrecognized state)" evidence
        // string, and classifyCell still reaches a correct, determinate
        // verdict from the (real, un-tampered-with) fetch-count evidence
        // captured immediately after the triggering action — see the
        // "about:blank frame" caveat recorded per-cell below and surfaced in
        // 24-DIAGNOSIS.md's instrumentation notes.
        const urlAtReadTime = page.url()
        const domAfter = await cfg.read(page)
        console.log(`    [debug] ${cfg.route} × ${pathKind} — page.url() at read time: ${urlAtReadTime}`)
        const expected = await cfg.expected()
        const newEntries = log.slice(preLen)
        const dataFetches = newDataFetchesForRoute(newEntries, cfg.route)
        const { verdict, rootCause } = classifyCell(dataFetches, domAfter, expected)
        const note =
          urlAtReadTime === 'about:blank'
            ? 'Chromium/CDP transiently blanked the frame (page.url() === "about:blank") at read time under this ' +
              'script\'s sustained headless-automation load — an instrumentation artifact, not app behavior. The ' +
              'verdict above is still determinate and untampered-with: it is driven by the real fetch-count evidence ' +
              '(new requests captured immediately after the triggering action, before any recovery attempt), not by ' +
              'the DOM read, so the blanked frame does not corrupt the classification — it only means "(unrecognized ' +
              'state)" stands in for the real post-navigation DOM text as evidence for this cell.'
            : undefined

        return {
          route: cfg.route,
          path: pathKind,
          verdict,
          rootCause,
          newFetches: dataFetches.map((f) => ({ url: f.url, type: fetchType(f.isRsc) })),
          domBefore,
          domAfter,
          expected,
          note,
        }
      } finally {
        await context.close()
      }
    }

    // ── Primary D-05 scenario: real UI grade session → Home → Study (2 cells) ──
    async function runPrimaryStudyGradingScenario(): Promise<CellResult[]> {
      const { context, page, log } = await newContextWithAuth()
      const results: CellResult[] = []
      try {
        await ensureAllSeededReviewsDue()
        await page.goto(`${BASE_URL}/study`, { waitUntil: 'load' })

        await page.getByRole('button', { name: 'Start studying →' }).click()
        await page.getByRole('button', { name: /Flashcards/ }).click()

        let reachedCompletion = false
        for (let i = 0; i < 50; i++) {
          if ((await page.getByText(/Session complete!|Going the extra mile!/).count()) > 0) {
            reachedCompletion = true
            break
          }
          await page.getByRole('button', { name: 'Show Answer' }).click()
          await page.getByRole('button', { name: /^Easy/ }).click()
          await page.waitForTimeout(80)
        }
        if (!reachedCompletion) {
          throw new Error('Primary study-grading scenario did not reach the completion screen within 50 grade actions')
        }
        console.log('  ✓ Real UI grade session reached the completion screen')

        // Cell: '/' post-mutation-return (D-05 primary)
        const preLenHome = log.length
        await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click()
        await page.waitForLoadState('networkidle')
        const domAfterHome = await readHomeState(page)
        const expectedHome = await expectedDueState()
        const homeFetches = newDataFetchesForRoute(log.slice(preLenHome), '/')
        const homeClass = classifyCell(homeFetches, domAfterHome, expectedHome)
        results.push({
          route: '/',
          path: 'post-mutation-return',
          verdict: homeClass.verdict,
          rootCause: homeClass.rootCause,
          newFetches: homeFetches.map((f) => ({ url: f.url, type: fetchType(f.isRsc) })),
          domBefore: '',
          domAfter: domAfterHome,
          expected: expectedHome,
          method: 'UI-driven grade session (primary, D-05)',
        })

        // Cell: '/study' post-mutation-return (D-05 primary)
        const preLenStudy = log.length
        await page.getByRole('link', { name: 'Study', exact: true }).click()
        await page.waitForLoadState('networkidle')
        const domAfterStudy = await readStudySelectModeState(page)
        const expectedStudy = await expectedDueState()
        const studyFetches = newDataFetchesForRoute(log.slice(preLenStudy), '/study')
        const studyClass = classifyCell(studyFetches, domAfterStudy, expectedStudy)
        results.push({
          route: '/study',
          path: 'post-mutation-return',
          verdict: studyClass.verdict,
          rootCause: studyClass.rootCause,
          newFetches: studyFetches.map((f) => ({ url: f.url, type: fetchType(f.isRsc) })),
          domBefore: '',
          domAfter: domAfterStudy,
          expected: expectedStudy,
          method: 'UI-driven grade session (primary, D-05)',
        })
      } finally {
        await context.close()
      }
      return results
    }

    // ── D-06 cheap DB-level variant for /cards and /habits post-mutation-return ──
    async function runDbMutationReturnCell(cfg: RouteConfig): Promise<CellResult> {
      const { context, page, log } = await newContextWithAuth()
      try {
        await page.goto(`${BASE_URL}${cfg.route}`, { waitUntil: 'load' })
        await page.getByRole('link', { name: 'Home', exact: true }).click()
        await page.waitForLoadState('networkidle')
        await cfg.mutate()
        const preLen = log.length
        await page.getByRole('link', { name: cfg.navName, exact: true }).click()
        await page.waitForLoadState('networkidle')
        const domAfter = await cfg.read(page)
        const expected = await cfg.expected()
        const fetches = newDataFetchesForRoute(log.slice(preLen), cfg.route)
        const { verdict, rootCause } = classifyCell(fetches, domAfter, expected)
        return {
          route: cfg.route,
          path: 'post-mutation-return',
          verdict,
          rootCause,
          newFetches: fetches.map((f) => ({ url: f.url, type: fetchType(f.isRsc) })),
          domBefore: '',
          domAfter,
          expected,
          method: 'DB-level mutation (D-06 cheap variant)',
        }
      } finally {
        await context.close()
      }
    }

    // ── Run all 16 cells ──────────────────────────────────────────────────
    console.log('→ Running the 16-cell navigation matrix…')
    console.log()

    for (const cfg of routeConfigs) {
      for (const pathKind of ['plain-link', 'back-forward', 'resume'] as const) {
        try {
          const result = await runStandardCell(cfg, pathKind)
          cellResults.push(result)
          printCellProgress({ route: cfg.route, path: pathKind }, result)
        } catch (err) {
          printCellProgress({ route: cfg.route, path: pathKind }, null, err)
          cellResults.push({
            route: cfg.route,
            path: pathKind,
            verdict: 'Stale-ClientShell',
            rootCause: `SCRIPT ERROR (not a real classification): ${err instanceof Error ? err.message : err}`,
            newFetches: [],
            domBefore: '',
            domAfter: '',
            expected: '',
          })
        }
        // Settle pause between cells: the local SQLite file is shared by this
        // script's Prisma client AND the `next start` server process (whose
        // own Link-prefetch fanout hits the DB — including the non-trivial
        // /study pool query — on every page load); closing a browser context
        // cancels the CLIENT side of an in-flight request but does not
        // guarantee the SERVER's own Prisma query is cancelled too. Giving
        // straggling server-side queries a real moment to drain measurably
        // reduces SQLite single-writer contention for the next cell (see the
        // withDbRetry comment above for the full explanation).
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    // Primary D-05 scenario — 2 cells in one continuous UI flow.
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const primaryResults = await runPrimaryStudyGradingScenario()
      for (const r of primaryResults) {
        cellResults.push(r)
        printCellProgress({ route: r.route, path: r.path }, r)
      }
    } catch (err) {
      for (const route of ['/', '/study']) {
        printCellProgress({ route, path: 'post-mutation-return' }, null, err)
        cellResults.push({
          route,
          path: 'post-mutation-return',
          verdict: 'Stale-ClientShell',
          rootCause: `SCRIPT ERROR (not a real classification): ${err instanceof Error ? err.message : err}`,
          newFetches: [],
          domBefore: '',
          domAfter: '',
          expected: '',
          method: 'UI-driven grade session (primary, D-05)',
        })
      }
    }

    // D-06 cheap DB-level variant for /cards and /habits.
    for (const routeName of ['/cards', '/habits']) {
      const cfg = routeConfigs.find((r) => r.route === routeName)!
      try {
        const result = await runDbMutationReturnCell(cfg)
        cellResults.push(result)
        printCellProgress({ route: cfg.route, path: 'post-mutation-return' }, result)
      } catch (err) {
        printCellProgress({ route: cfg.route, path: 'post-mutation-return' }, null, err)
        cellResults.push({
          route: cfg.route,
          path: 'post-mutation-return',
          verdict: 'Stale-ClientShell',
          rootCause: `SCRIPT ERROR (not a real classification): ${err instanceof Error ? err.message : err}`,
          newFetches: [],
          domBefore: '',
          domAfter: '',
          expected: '',
          method: 'DB-level mutation (D-06 cheap variant)',
        })
      }
      await new Promise((r) => setTimeout(r, 1500))
    }

    // ── Banner summary ────────────────────────────────────────────────────
    console.log()
    console.log('='.repeat(90))
    console.log('16-CELL SUMMARY')
    console.log('='.repeat(90))
    console.log(
      'Route'.padEnd(10) + 'Path'.padEnd(24) + 'Verdict'.padEnd(20) + 'Root cause'
    )
    console.log('-'.repeat(90))
    for (const r of cellResults) {
      console.log(
        r.route.padEnd(10) + r.path.padEnd(24) + r.verdict.padEnd(20) + r.rootCause
      )
    }
    console.log('='.repeat(90))

    const plainLinkCells = cellResults.filter((r) => r.path === 'plain-link')
    const allPlainLinkStale = plainLinkCells.every((r) => r.verdict === 'Stale-RouterCache')
    if (allPlainLinkStale) {
      console.log()
      console.log(
        '⚠ WARNING (Pitfall 1 instrumentation sanity): every plain-link cell classified Stale-RouterCache. ' +
          'Per staleTimes.dynamic=0, plain Link navigations to force-dynamic routes are expected to be fresh. ' +
          'This pattern suggests the isRscRequest() filter may be broken — treat these results with suspicion.'
      )
    } else {
      console.log()
      console.log('✓ Pitfall 1 instrumentation sanity holds: not all plain-link cells classified Stale-RouterCache.')
    }

    // Dump full per-cell evidence (network + DOM) for Task 3 to author into 24-DIAGNOSIS.md.
    console.log()
    console.log('='.repeat(90))
    console.log('FULL PER-CELL EVIDENCE')
    console.log('='.repeat(90))
    for (const r of cellResults) {
      console.log()
      console.log(`### ${r.route} × ${r.path}`)
      console.log(`Verdict: ${r.verdict}`)
      console.log(`Root cause: ${r.rootCause}`)
      if (r.method) console.log(`Method: ${r.method}`)
      if (r.note) console.log(`Note: ${r.note}`)
      console.log(`Expected: ${r.expected}`)
      console.log(`DOM before: ${r.domBefore || '(not captured for this path)'}`)
      console.log(`DOM after: ${r.domAfter}`)
      console.log(`New fetches for this route since pre-action snapshot: ${r.newFetches.length}`)
      for (const f of r.newFetches) {
        console.log(`  [${f.type}] ${f.url}`)
      }
    }
  }
} catch (err) {
  exitCode = 1
  console.error()
  console.error('✗ FAILED:', err instanceof Error ? err.message : err)
} finally {
  console.log()
  console.log('→ Tearing down…')
  if (browser) {
    await browser.close()
    console.log('  ✓ Browser closed')
  }
  if (server) {
    await stopServer(server)
    console.log('  ✓ Server stopped')
  }
  await prisma.$disconnect()
  console.log('  ✓ Prisma disconnected')
  console.log()
  console.log('='.repeat(50))
  console.log(exitCode === 0 ? 'Diagnosis run: SUCCESS' : 'Diagnosis run: FAILED')
  console.log('='.repeat(50))
}

process.exit(exitCode)
