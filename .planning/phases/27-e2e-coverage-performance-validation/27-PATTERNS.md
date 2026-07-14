# Phase 27: E2E Coverage & Performance Validation - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 6 (2 new, 4 modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `e2e/grade-flow.spec.ts` (NEW) | test (E2E spec) | request-response (browser-driven) | `e2e/smoke.spec.ts` | exact |
| `e2e/perf.spec.ts` (NEW) | test (E2E spec, timing) | request-response (nav-timing + fetch) | `e2e/smoke.spec.ts` (`captureNavTiming`) | exact |
| `components/FlashcardMode.tsx` (MOD) | component | request-response (UI) | itself — attribute-only additions | exact (self) |
| `components/StudyClient.tsx` (MOD) | component (client shell) | request-response (UI) | itself — attribute-only additions | exact (self) |
| `components/ModeSelector.tsx` (MOD) | component | request-response (UI) | itself — attribute-only additions | exact (self) |
| `CLAUDE.md` (MOD) | config/docs | — | existing "Gotchas / conventions" prose style | exact |

Supporting analogs (only if a DB backstop helper is added): `e2e/helpers/mutate.ts` + `e2e/run-mutate.ts` (subprocess-delegation pattern) — MUST be followed, never bypassed.

## Pattern Assignments

### `e2e/grade-flow.spec.ts` (test, browser-driven flow)

**Analog:** `e2e/smoke.spec.ts` (spec skeleton) + `e2e/helpers/readers.ts` (waiting conventions)

**Imports + beforeAll reset pattern** (`e2e/smoke.spec.ts` lines 19-26):
```typescript
import { test, expect } from '@playwright/test'
import { readHomeState, readStudySelectModeState, readCardsCount, readHabitsMasteredCount } from './helpers/readers'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeAll(async () => {
  await resetToBaseline()
})
```
Every spec file self-resets in `beforeAll` — the ordering-safeguard doc comment at `smoke.spec.ts:9-13` explains why (alphabetical file order + shared mutable DB). `grade-flow.spec.ts` mutates FSRS state, so this reset in BOTH new files is mandatory (Pitfall 5 in 27-RESEARCH.md).

**Fixture-traceable assertions** (`e2e/smoke.spec.ts` lines 33-38 + `e2e/fixture.ts` lines 20-44):
```typescript
test('Home renders the real seeded due-count on first load', async ({ page }) => {
  await page.goto('/')
  const state = await readHomeState(page)
  expect(state).toBe(String(FIXTURE.dueCards))
})
```
`FIXTURE.dueCards === 3`; `FIXTURE.cards.due` = `안녕`/`학교`/`감사하다` fronts. Assert against these constants, never hardcoded numbers (anti-vacuous rule in `fixture.ts` header). Grade-flow assertions per 27-RESEARCH.md Pattern 1: bounded loop-until-complete, `grades >= FIXTURE.dueCards`, distinct fronts seen === `FIXTURE.cards.due` fronts, completion heading text `'Session complete!'`.

**Waiting convention — never sleep, non-throwing visibility check** (`e2e/helpers/readers.ts` lines 24-31):
```typescript
export async function waitVisible(locator: ReturnType<Page['locator']>, timeout = 5000): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}
```
Reuse `waitVisible` / `dumpUnrecognizedState` from `readers.ts` for any new grade-flow readers; new locators use `page.getByTestId(...)` (default `testIdAttribute`, zero config).

**Known-fragile-locator comment this phase closes** (`e2e/helpers/readers.ts` lines 63-72) — the doc comment on `readStudySelectModeState` explicitly defers to "a future phase adding `data-testid` attributes"; update or reference it when the testids land.

**DB backstop (optional, per RESEARCH open question 1):** follow the two-layer subprocess pattern exactly — see Shared Patterns below. Check first whether `expectedDueState()` (`e2e/helpers/mutate.ts:187-189`, returns `'zero-due-state'` when 0 due) already suffices: after a completed session all 3 cards graduate ~2 days out, so `expect.poll(() => expectedDueState()).toBe('zero-due-state')` proves persistence with zero new code.

---

### `e2e/perf.spec.ts` (test, timing measurement)

**Analog:** `e2e/smoke.spec.ts` `captureNavTiming()` (lines 28-31) — the proven serialization-safe nav-timing read:
```typescript
async function captureNavTiming(page: import('@playwright/test').Page): Promise<void> {
  const timing = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')))
  console.log(`[nav-timing] ${page.url()}: ${timing}`)
}
```
Key detail: raw `PerformanceEntry` objects serialize to `{}` across the evaluate boundary — return `JSON.stringify(...)`, `entry.toJSON()`, or picked plain fields only (Pitfall 2). Same `console.log('[prefix] ...')` line-reporter logging style for per-sample output.

**Structure:** same imports + `beforeAll(resetToBaseline)` skeleton as smoke.spec.ts above. One test per route (4 page tests) + API-timing test(s) — keeps each under the default 30s timeout (no custom `timeout` in `playwright.config.ts`). Full code skeletons for the median-of-5 pattern and the `page.evaluate(fetch)` API timing (with `res.ok` + non-empty-body vacuity guards) are in 27-RESEARCH.md Patterns 2-3 — copy those directly; they were verified against the on-disk harness.

**Auth is free:** the chromium project's `storageState` (`playwright/.auth/user.json`) attaches the `ks_auth` cookie; one `page.goto('/')` then same-origin `fetch` in `page.evaluate` is authenticated (D-10).

---

### `components/FlashcardMode.tsx` (component, attribute-only edit)

**Current JSX to modify** — "Show Answer" (lines 204-211) and the 4 grade buttons (lines 216-251):
```tsx
{!revealed && (
  <button
    onClick={onReveal}
    className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl ..."
  >
    Show Answer
  </button>
)}
...
<button
  ref={againBtnRef}
  onClick={() => onGrade(1)}
  aria-label={hints ? `Again, review again in ${hints[0].short}` : 'Again'}
  className="flex-1 min-h-14 ..."
>
```
Pattern: add `data-testid="reveal-btn"` / `data-testid="grade-again|hard|good|easy"` as an additional attribute alongside the existing `aria-label` (which stays — it carries dynamic FSRS hint text for screen readers, WR-02). Grade values: Again=`onGrade(1)` line 218, Hard=`onGrade(2)` line 227, Good=`onGrade(3)` line 236, Easy=`onGrade(4)` line 245. Zero class/handler changes; kebab-case testid names.

---

### `components/StudyClient.tsx` (component, attribute-only edit)

**"Start studying →" button** (lines 312-317):
```tsx
<button
  onClick={() => setShowModeSheet(true)}
  className="w-full max-w-sm min-h-14 bg-button text-button-foreground rounded-2xl ..."
>
  Start studying →
</button>
```
Add e.g. `data-testid="start-studying-btn"`.

**Session-complete heading** (line 431, heading computed at line 425 — `'Session complete!'` when `scope === 'due'`):
```tsx
<h2 className="text-3xl font-bold text-foreground">{heading}</h2>
```
Add e.g. `data-testid="session-complete-heading"`. Spec asserts `toHaveText('Session complete!')` — exact text, not mere visibility.

**"Study N more →" button** (lines 473-478):
```tsx
<button onClick={onStudyMore} className="w-full bg-button ...">
  Study {sessionSize} more →
</button>
```
Add e.g. `data-testid="study-more-btn"`.

---

### `components/ModeSelector.tsx` (component, attribute-only edit)

**Mode buttons render in a `modes.map` loop** (lines 29-37):
```tsx
{modes.map((mode) => (
  <div key={mode.value}>
    <button
      onClick={() => onSelect(mode.value, includeAI, flashcardSubMode)}
      className="w-full flex flex-col items-center bg-surface-1 ..."
    >
      {mode.label}
```
Because it's a loop, use a value-parameterized testid: `data-testid={`mode-${mode.value}`}` → the spec clicks `mode-flashcard`. Exposure sub-mode is the `useState` default (line 21: `useState<FlashcardSubMode>('exposure')`), so no sub-toggle interaction is needed (D-03).

---

### `CLAUDE.md` (docs, new Playwright MCP subsection)

**Analog:** existing "Gotchas / conventions" bullets — terse reference style, imperative, one bold lead phrase per bullet (e.g. "**Vercel function timeout is 60 s hard limit on Hobby plan** — ..."). New subsection content is fully specified in 27-RESEARCH.md "Code Examples": registration command `claude mcp add playwright npx @playwright/mcp@latest` (flagless; `--` separator only with flags), dev server :3000 vs. harness :3100 distinction, login via `APP_PASSWORD` **referenced from `.env.local` — never a literal value**, example tools `browser_navigate` / `browser_snapshot` / `browser_click`.

## Shared Patterns

### Subprocess-delegation for ANY test-DB access (hard constraint)
**Source:** `e2e/helpers/mutate.ts` (two-layer shape) + `e2e/run-mutate.ts` (tsx entry)
**Apply to:** any new DB query helper for the grade-flow backstop

Layer 1 — `*Direct` Prisma function, tsx-only (`mutate.ts:55-59`):
```typescript
export async function expectedDueStateDirect(): Promise<string> {
  const prisma = await getTestPrisma()
  const n = await prisma.cardReview.count({ where: { nextReview: { lte: new Date() } } })
  return n > 0 ? String(n) : 'zero-due-state'
}
```
Layer 2 — public wrapper spawning tsx and parsing a prefixed stdout line (`mutate.ts:150-169`):
```typescript
function runMutateOp(op: string): string {
  const tsxBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx')
  return execFileSync(tsxBin, ['--tsconfig', './tsconfig.json', 'e2e/run-mutate.ts', op], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  })
}
// result parsed from last line starting with 'MUTATE_RESULT:' → JSON.parse
```
Entry-script op registry (`run-mutate.ts:31-39`): new ops are added to the `OPS: Record<string, () => Promise<string | void>>` map. Calling `getTestPrisma()` in-process from a Playwright worker throws `SyntaxError: Cannot use 'import.meta' outside a module` — confirmed twice (`mutate.ts:8-23` header).

### Per-spec-file baseline reset
**Source:** `e2e/smoke.spec.ts:24-26` (`test.beforeAll(async () => { await resetToBaseline() })`; `resetToBaseline` itself is the execFileSync subprocess at `e2e/seed.ts:235-238`)
**Apply to:** both new spec files.

### Fixture-constant assertions (anti-vacuous)
**Source:** `e2e/fixture.ts` — `FIXTURE.dueCards`, `FIXTURE.cards.due[].front`
**Apply to:** grade-flow spec (grade count ≥ dueCards; fronts-seen set) and any perf sanity checks.

### Line-reporter sample logging
**Source:** `e2e/smoke.spec.ts:30` — `console.log(\`[nav-timing] ${page.url()}: ...\`)`
**Apply to:** every individual perf sample (`[perf] ${route} sample N: ...`), per D-08/D-09's logged-samples requirement.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | None. Perf-budget assertion logic (median helper, vacuity guards) has no in-repo precedent, but complete verified skeletons live in 27-RESEARCH.md Patterns 2-3 — treat those as the analog. |

## Metadata

**Analog search scope:** `e2e/`, `e2e/helpers/`, `components/` (FlashcardMode, StudyClient, ModeSelector), `playwright.config.ts` (verified no changes needed per CONTEXT), CLAUDE.md prose style
**Files scanned:** 10 (5 e2e files read in full, 3 component sections targeted-read at RESEARCH-verified line ranges, seed.ts grepped, CLAUDE.md from project context)
**Pattern extraction date:** 2026-07-13
