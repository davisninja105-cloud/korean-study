---
phase: 24-freshness-diagnosis-spike
reviewed: 2026-07-11T16:49:55Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - scripts/diagnose-freshness.mts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-07-11T16:49:55Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `scripts/diagnose-freshness.mts`, a throwaway Playwright-driven diagnostic script that builds/starts the app against an isolated local SQLite DB and runs a 16-cell navigation matrix to empirically classify RSC freshness behavior. The file is explicitly not production code and will likely be discarded, but it does orchestrate real child processes, mutate a real (if isolated) SQLite file, inject an auth cookie, and — most importantly — its entire purpose is to produce trustworthy classification evidence that Phase 24's diagnosis document will be authored from. On that basis, the most serious finding is a genuine correctness bug in the `back-forward` cell driver: a recovery path the script takes when Chromium/CDP gets stuck on `about:blank` after `history.back()` performs exactly the kind of forced re-navigation the script's own adjacent comment says was deliberately *not* added because it would corrupt the classification — and the corruption is silent (no `note` is attached) precisely because the recovery succeeds in moving the page off `about:blank` before the "was this frame blanked" check runs. Several additional issues affect the isolation guard's robustness, resource cleanup, and error visibility; none of these compromise the app itself (the script never touches production data by design), but they do reduce confidence in the diagnostic output and in the script's safety net if invariants it currently relies on ever drift.

## Critical Issues

### CR-01: `back-forward` cell's `about:blank` recovery contradicts the script's own anti-corruption design and silently corrupts classification

**File:** `scripts/diagnose-freshness.mts:800-837` (recovery) and `scripts/diagnose-freshness.mts:858-887` (contradicted rationale + missed note)

**Issue:**
In the `back-forward` path of `runStandardCell`, `preLen` is captured at line 811 (before the `history.back()` call), and then — if the page is still stuck on `about:blank` after `history.back()` + the `waitForURL`/`networkidle` waits — the code performs a genuine re-navigation as a last resort:

```ts
// lines 828-837
if (page.url() === 'about:blank') {
  console.log('    [debug] back-forward: still about:blank — falling back to direct goto()')
  await page.goto(targetUrl, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
}
```

This `page.goto()` happens *before* `newEntries = log.slice(preLen)` is computed (line 877), so any fetches it triggers are captured in `dataFetches` and fed into `classifyCell()`. A `page.goto()` is always a genuine full-document navigation — it will register a real fetch for the route almost every time. This means: whenever the CDP `about:blank` glitch fires (which the adjacent comment says was "observed... not a transient timing race" — i.e. it does happen in real runs), a `back-forward` cell that should have been classified based on the *actual* `history.back()` behavior (which may have had **zero** fetches, i.e. a true `Stale-RouterCache` verdict) gets a forced fetch injected into its evidence, converting it into `Fresh` or `Stale-ClientShell` instead.

This is a direct contradiction of the rationale documented immediately below, at lines 858-872:

```ts
// NOTE: a forced re-navigation (page.goto) as a generic "about:blank"
// recovery was deliberately NOT added here. Doing so would corrupt
// the classification for the back-forward path specifically: a fresh
// goto() always triggers a real server round-trip (a genuine fetch),
// so recovering via goto() right before reading would force every
// recovered cell to register a "fetch" and read live (fresh) data —
// silently converting a true Stale-RouterCache verdict ... into a
// false "Fresh" one.
```

The script's author correctly identified this exact failure mode and consciously avoided it for the generic "any path, any reason page.url() looks wrong at read time" case — but the *same* failure mode was already introduced a few dozen lines earlier, specific to the `back-forward` path, and was not removed or reconciled with this later comment.

Worse, the corruption is invisible in the output: the `note` field that's meant to flag "this cell's evidence may be compromised" is only attached when `urlAtReadTime === 'about:blank'` (line 873, checked *after* the recovery already ran). Since the recovery's entire purpose is to move the page off `about:blank`, a cell that hit this recovery path will have a normal (non-blank) `urlAtReadTime` by the time that check runs, so `note` stays `undefined` and the `CellResult` looks like an ordinary, trustworthy classification in the structured evidence dump that Task 3 is meant to author `24-DIAGNOSIS.md` from. Only the raw console debug line (`falling back to direct goto()`) — not part of `CellResult` — hints that anything unusual happened, and that line only exists in stdout, not in the structured per-cell evidence block.

Given the `back-forward` path is one of the three navigation paths specifically being used to distinguish Router Cache reuse from a genuine re-fetch (the core question the whole spike exists to answer), a silent corruption here can directly produce an incorrect finding in the diagnosis document.

**Fix:** Snapshot `preLen` (or an equivalent "evidence baseline") *after* the recovery decision is finalized, not before it — or mark the cell's result with an explicit `note`/`method` flag whenever the recovery branch executes, regardless of the final `urlAtReadTime`, so the corrupted evidence is never silently indistinguishable from a clean back-forward result. For example:

```ts
let recoveryTriggered = false
if (page.url() === 'about:blank') {
  console.log('    [debug] back-forward: still about:blank — falling back to direct goto()')
  recoveryTriggered = true
  await page.goto(targetUrl, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
}
// ...
const note = recoveryTriggered
  ? 'back-forward recovery (page.goto) fired after history.back() got stuck on about:blank — ' +
    'this cell\'s fetch-count evidence is NOT a reliable back-forward-navigation classification ' +
    '(the recovery itself is a genuine fetch); treat this verdict as inconclusive.'
  : urlAtReadTime === 'about:blank' ? /* existing note */ : undefined
```
At minimum, cells where the recovery fired should be excluded from (or clearly segregated in) any headline "N/16 cells were Stale-X" tally in the diagnosis document.

## Warnings

### WR-01: `assertLocalDb` is a deny-list, not an allow-list — a non-`libsql://`-prefixed remote URL would sail through undetected

**File:** `scripts/diagnose-freshness.mts:42-49`

**Issue:** The guard is:
```ts
function assertLocalDb(url: string | undefined): void {
  if (url && url.startsWith('libsql://')) { /* fatal */ }
}
```
This only rejects URLs that literally start with `libsql://`. It does not positively assert `url.startsWith('file:')`. In the current code path this is harmless because `process.env.DATABASE_URL` is unconditionally overridden to `TEST_DB_URL` immediately above (lines 54-58) and `childEnv.DATABASE_URL` is explicitly re-pinned before the second call (line 263), so the guard can never actually observe a non-local value today. But the header comment for this function explicitly frames it as "defense in depth against a future edit that forgets to pin `childEnv.DATABASE_URL`" — and a deny-list guard provides materially weaker defense-in-depth than an allow-list one: if a future edit accidentally omits the `DATABASE_URL` override (or a `.env`/`.env.local` value with a different remote-DB URL shape — e.g. a bare Postgres-style connection string, or a Turso `https://` replica URL — ever leaked through), this guard would not catch it, because it isn't a `libsql://` URL.

**Fix:** Invert the check to a positive allow-list, matching the intent stated in the header comment (`file:` test DB only):
```ts
function assertLocalDb(url: string | undefined): void {
  if (!url || !url.startsWith('file:')) {
    console.error('✗ FATAL: DATABASE_URL is not a local file: test database.')
    console.error(`  This script must only ever target an isolated local file: test database. Got: ${url}`)
    process.exit(1)
  }
}
```

### WR-02: Diagnostic server binds to all interfaces with hardcoded weak credentials for the full run duration

**File:** `scripts/diagnose-freshness.mts:29-34, 292-295`

**Issue:** `spawn('npm', ['run', 'start', '--', '-p', String(DIAG_PORT)], ...)` runs `next start -p 3200` with no `-H`/host flag, which defaults to binding on `0.0.0.0` (all interfaces), not just `localhost`. The app is protected only by the shared-password gate (`middleware.ts` / `lib/auth.ts`), and this run uses a hardcoded, low-entropy password (`THROWAWAY_APP_PASSWORD = 'diagnosis-throwaway-password'`, line 34) and a hardcoded HMAC secret (`THROWAWAY_SECRET`, line 33). For the duration of the run (a full production build plus a 16-cell Playwright matrix — plausibly several minutes), anyone on the same local network segment can reach `http://<host-ip>:3200`, guess/know the fixed password, and browse the seeded fixture data (or, since it's a real server, interact with the app's real API routes against the isolated DB). This is a low-severity exposure (isolated fixture data, ephemeral run, LAN-only) but is easy to close.

**Fix:** Bind explicitly to loopback: `spawn('npm', ['run', 'start', '--', '-p', String(DIAG_PORT), '-H', '127.0.0.1'], ...)`.

### WR-03: Fresh-run DB reset doesn't clean up the WAL sidecar files the script itself creates

**File:** `scripts/diagnose-freshness.mts:147-150` (reset) and `scripts/diagnose-freshness.mts:186-189` (WAL enable)

**Issue:** The "fresh-run reset" step only removes the main DB file:
```ts
mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true })
rmSync(TEST_DB_PATH, { force: true })
```
But later the script explicitly enables WAL journal mode on this same file (`PRAGMA journal_mode=WAL;`, line 187), which causes SQLite to create `24-diagnosis.db-wal` and `24-diagnosis.db-shm` sidecar files alongside it. Those sidecar files are never deleted. If a previous run ended (e.g. via a script error or SIGKILL) before the WAL was checkpointed back into the main file, or if the sidecar files simply persist between runs, the *next* run's "fresh" DB is not actually guaranteed to be byte-clean state — SQLite's WAL files are tied to specific salt values in the associated `.db` file header, so stale `-wal`/`-shm` files paired with a newly-recreated `.db` can produce checksum-mismatch errors or unexpected recovery behavior on open, undermining the stated goal of a fully isolated fresh-run reset.

**Fix:** Also remove the sidecar files during reset:
```ts
rmSync(TEST_DB_PATH, { force: true })
rmSync(`${TEST_DB_PATH}-wal`, { force: true })
rmSync(`${TEST_DB_PATH}-shm`, { force: true })
```

### WR-04: Build failures swallow the actual compiler/error output

**File:** `scripts/diagnose-freshness.mts:267, 1144-1147`

**Issue:** `const buildOutput = execSync('npm run build', { env: childEnv, encoding: 'utf-8' })` has no `stdio: 'inherit'` and is not wrapped in a local try/catch. If the build fails (non-zero exit), `execSync` throws an `Error` whose `.stdout`/`.stderr` properties hold the actual compiler output, but the outer catch-all handler at line 1144-1147 only logs `err.message`:
```ts
} catch (err) {
  exitCode = 1
  console.error('✗ FAILED:', err instanceof Error ? err.message : err)
}
```
For a Node `execSync` `ExecException`, `.message` is typically just `Command failed: npm run build` (plus perhaps a truncated snippet), not the full TypeScript/Next.js build error text needed to actually diagnose why the build failed — which is exactly the situation where a developer most needs that detail.

**Fix:** Either pass `stdio: 'inherit'` for the build step (losing the ability to programmatically scan `buildOutput` for the dynamic-route markers, so this alone isn't sufficient), or explicitly surface `err.stdout`/`err.stderr` in the catch handler, e.g.:
```ts
} catch (err) {
  exitCode = 1
  console.error('✗ FAILED:', err instanceof Error ? err.message : err)
  if (err && typeof err === 'object' && 'stdout' in err) console.error((err as { stdout?: string }).stdout)
  if (err && typeof err === 'object' && 'stderr' in err) console.error((err as { stderr?: string }).stderr)
}
```

### WR-05: The RSC-detection self-check only runs in `--log-requests` mode, not during the actual matrix run

**File:** `scripts/diagnose-freshness.mts:347-405` vs. `1109-1121`

**Issue:** The "Pitfall 1 sanity gate" that hard-fails if `isRscRequest()` detects zero fetches on a known-dynamic route (proving the predicate is broken) only executes in `--log-requests` mode (lines 393-401), which is a separate, manually-invoked run distinct from the actual 16-cell matrix collection. The matrix run itself (the mode that actually produces the evidence for `24-DIAGNOSIS.md`) has only a much weaker, purely advisory heuristic at the very end of the run (lines 1109-1121): it warns (but does not fail) if *every* `plain-link` cell classified `Stale-RouterCache`. That heuristic has real gaps — e.g. it can't detect the predicate being *partially* broken (matching real navigations but missing prefetches, or vice versa), and it only runs after all 16 cells (and all associated builds/seeding) have already completed, so a broken predicate is discovered only after the full expensive run, with no earlier fail-fast.

**Fix:** Run the same hard sanity check (or an equivalent lightweight version of it) as a preflight step inside the matrix-mode branch too, before starting the 16-cell loop, so a broken `isRscRequest()` predicate is caught immediately rather than only via post-hoc statistical suspicion.

## Info

### IN-01: Dead code branch in `isRscRequest` — the uppercase `'RSC'` header check can never be true

**File:** `scripts/diagnose-freshness.mts:131-134`

**Issue:**
```ts
function isRscRequest(req: PwRequest): boolean {
  const headers = req.headers()
  return headers['rsc'] === '1' || headers['RSC'] === '1'
}
```
Playwright's `request.headers()` always returns lower-cased header names (this is documented Playwright behavior, and the file's own header comment at line 113 confirms the observed header is lowercase `rsc: 1`). The `headers['RSC']` branch is therefore unreachable dead code — it can never evaluate to `true` under Playwright's actual API contract.

**Fix:** Remove the dead branch: `return headers['rsc'] === '1'`.

### IN-02: `stopServer`'s SIGKILL fallback timer isn't cleared, leaving a dangling handle

**File:** `scripts/diagnose-freshness.mts:97-107`

**Issue:**
```ts
async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.killed) return
  await new Promise<void>((resolve) => {
    server.once('exit', () => resolve())
    server.kill('SIGTERM')
    setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }, 5000)
  })
}
```
The `setTimeout` is never captured/cleared when `exit` fires promptly (the common case), so the timer stays scheduled for the full 5s regardless. It's harmless today only because the script explicitly calls `process.exit(exitCode)` at the very end, forcibly terminating the process before the timer would matter — but it's a latent resource-management sloppy spot that would keep the event loop alive for up to 5s if the explicit `process.exit()` call were ever removed (e.g. if this script were imported/reused as a module rather than run standalone).

**Fix:** Capture and clear the timer:
```ts
await new Promise<void>((resolve) => {
  const killTimer = setTimeout(() => {
    if (server.exitCode === null) server.kill('SIGKILL')
  }, 5000)
  server.once('exit', () => { clearTimeout(killTimer); resolve() })
  server.kill('SIGTERM')
})
```

### IN-03: No SIGINT/SIGTERM handler on the script itself for graceful cleanup

**File:** `scripts/diagnose-freshness.mts` (whole file)

**Issue:** The script relies entirely on its own `try/finally` completing normally (or throwing synchronously within the awaited chain) to run `browser.close()` / `stopServer()` / `prisma.$disconnect()`. There's no `process.on('SIGINT', ...)`/`process.on('SIGTERM', ...)` handler. If a developer interrupts a long-running matrix pass (Ctrl-C) or the process is killed by an external supervisor, the `finally` block may not run, potentially leaving the spawned `next start` child process (and the isolated DB file, DB connections, or the Chromium browser process) orphaned, depending on how the signal propagates to the child process group.

**Fix:** Add explicit signal handlers that trigger the same cleanup path (or at minimum kill the spawned server child), e.g. `process.on('SIGINT', async () => { if (server) await stopServer(server); process.exit(130) })`.

### IN-04: DOM readers hardcode exact Tailwind utility-class strings, making them fragile to any styling change

**File:** `scripts/diagnose-freshness.mts:511, 522, 546, 556, 562`

**Issue:** Several reader functions locate DOM state purely via long, exact Tailwind class-string matches, e.g.:
```ts
page.locator('span.text-reward.text-6xl')
page.locator('p.text-5xl.font-bold.animate-reveal')
page.locator('div.bg-surface-1.rounded-2xl.shadow-md.p-6.flex.flex-col.gap-4', { hasText: 'Proficiency' })
```
Any incidental class-name change to `HomeClient.tsx` / `StudyClient.tsx` / the Habits/Proficiency components (even a purely cosmetic Tailwind tweak unrelated to this phase) will silently break these locators, and the failure mode is "(unrecognized state)" rather than a clear "selector broke" signal — a false-negative classification risk rather than a script crash. This is understandable for a throwaway spike script but worth flagging since the resulting `(unrecognized state)` values do feed directly into the freshness verdicts via `classifyCell()`.

**Fix:** Not required given the script's throwaway status, but if any part of this script is repurposed for the Phase 25 E2E harness, prefer `data-testid`/`aria-label`/role-based selectors over literal class-string matching.

---

_Reviewed: 2026-07-11T16:49:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
