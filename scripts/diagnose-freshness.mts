/**
 * Phase 24 throwaway freshness-diagnosis script — Plan 24-01 (plumbing + smoke)
 * extended by Plan 24-02 Task 1 (RSC-signature confirmation via --log-requests).
 *
 * THIS IS NOT THE PHASE 25 E2E HARNESS. It intentionally has no
 * playwright.config.ts, no tests-e2e/ directory, and no persistent test
 * conventions (D-01). It exists solely to prove out the DB-isolation, seed,
 * prod-server-orchestration, and cookie-auth plumbing, and now the RSC
 * re-fetch detection signature, before Plan 24-02 Task 2 adds the full
 * 16-cell navigation-matrix instrumentation on top.
 *
 * This script ONLY EVER targets an isolated local `file:` SQLite test
 * database (scripts/.tmp/24-diagnosis.db) — never the real Turso
 * DATABASE_URL and never prisma/dev.db. See assertLocalDb() below.
 *
 * Usage:
 *   npx tsx scripts/diagnose-freshness.mts                 # plumbing + smoke check
 *   npx tsx scripts/diagnose-freshness.mts --log-requests   # RSC-signature confirmation
 */

import { execSync, spawn, type ChildProcess } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium, type Request as PwRequest } from 'playwright'

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
console.log('Phase 24 freshness-diagnosis: ' + (LOG_REQUESTS_MODE ? 'RSC-signature confirmation' : 'plumbing + smoke check'))
console.log('='.repeat(50))
console.log()

let server: ChildProcess | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
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
  void seededCardIds // consumed by Plan 24-02 Task 2's primary study-grading scenario

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
  // confirmation. Task 2 (the 16-cell matrix) is added in a follow-up commit.
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
    console.log('→ (Plan 24-02 Task 2 will add the 16-cell matrix here.)')
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
