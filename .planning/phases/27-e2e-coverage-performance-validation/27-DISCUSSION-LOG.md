# Phase 27: E2E Coverage & Performance Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 27-e2e-coverage-performance-validation
**Areas discussed:** Grade-flow spec scope, Grade-button locators, Perf budget mechanics, Playwright MCP workflow

---

## Grade-flow spec scope

| Option | Description | Selected |
|--------|-------------|----------|
| Flashcards only | Simplest, most deterministic path; matches E2E-05's literal wording | ✓ |
| All 3 modes | Flashcard + Multiple Choice + Fill-blank, 3x locator/maintenance surface | |

**User's choice:** Flashcards only

| Option | Description | Selected |
|--------|-------------|----------|
| Full session to completion | Grade all 3 seeded due cards through to "Session complete!" | ✓ |
| Single card, stop after queue advances | Faster but leaves "session completion" unverified | |

**User's choice:** Full session to completion

| Option | Description | Selected |
|--------|-------------|----------|
| Exposure (default) | Matches ModeSelector's default sub-mode | ✓ |
| Recall | Blanked-word front, extra fragility dimension | |

**User's choice:** Exposure (default)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing baseline (resetToBaseline) | Same 3 due cards every other spec uses, no new fixture code | ✓ |
| New minimal fixture, no dependency edge | Isolates spec from sequencing/knowledge-graph behavior | |

**User's choice:** Reuse existing baseline (resetToBaseline)

**Notes:** User confirmed "Next area" with no further questions after 4 questions.

---

## Grade-button locators

| Option | Description | Selected |
|--------|-------------|----------|
| Add data-testid now (recommended) | Closes the exact gap Phase 25's readers.ts flagged as deferred to "a future phase" | ✓ |
| Regex name matching, no production change | Zero production touch, but locks in the fragile-locator pattern | |

**User's choice:** Add data-testid now (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Grade buttons + Show Answer only | Minimal, surgical | |
| Also add to session-complete + mode-select | Broader pass, future-proofs the whole grade-flow path in one go | ✓ |

**User's choice:** Also add to session-complete + mode-select

**Notes:** This is a production code change (components/FlashcardMode.tsx, StudyClient.tsx, ModeSelector.tsx) — additive only, existing aria-labels untouched.

---

## Perf budget mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Extend smoke.spec.ts with N=5 + budgets on all 4 routes | No new file, no new webServer boot | |
| New dedicated perf.spec.ts file | Perf and content-correctness stay independently readable/failable | ✓ |

**User's choice:** New dedicated perf.spec.ts file

| Option | Description | Selected |
|--------|-------------|----------|
| Just /api/cards/due | The only route ROADMAP.md names explicitly | |
| /api/cards/due + /api/stats + /api/activity | Broader coverage of Home/Habits query paths | ✓ |

**User's choice:** /api/cards/due + /api/stats + /api/activity

| Option | Description | Selected |
|--------|-------------|----------|
| N=5, budget ~3s pages / ~1s API | Matches PITFALLS.md's median-of-N + generous-headroom guidance | ✓ |
| N=3, budget ~2s pages / ~500ms API | Tighter, faster, more flake-prone | |

**User's choice:** N=5, budget ~3s pages / ~1s API

| Option | Description | Selected |
|--------|-------------|----------|
| APIRequestContext with storageState cookie | No browser/page needed, closer to "direct request timing" wording | |
| page.evaluate(fetch) inside a loaded page | Exercises the exact code path a real client request takes | ✓ |

**User's choice:** page.evaluate(fetch) inside a loaded page

**Notes:** User confirmed "Next area" with no further questions after 4 questions.

---

## Playwright MCP workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Register now (claude mcp add playwright ...) | Immediately usable, matches STACK.md's exact command | ✓ |
| Document only, user registers later | Leaves install/opt-in to the user | |

**User's choice:** Register now (claude mcp add playwright ...)

| Option | Description | Selected |
|--------|-------------|----------|
| Dev server (localhost:3000) | Matches TOOL-01's literal wording, complements the isolated E2E harness | ✓ |
| E2E prod build (port 3100) | Sees exact cache/freshness behavior the specs test, requires manual boot | |

**User's choice:** Dev server (localhost:3000)

| Option | Description | Selected |
|--------|-------------|----------|
| Concise how-to (recommended) | Matches CLAUDE.md's terse, reference-style prose | ✓ |
| Full worked example walkthrough | More onboarding value, more to keep in sync | |

**User's choice:** Concise how-to (recommended)

**Notes:** User was ready for context after this area — no additional gray areas requested.

---

## Claude's Discretion

- Exact `data-testid` string values beyond the ones named in CONTEXT.md D-05/D-06 — kebab-case, descriptive.
- Exact CLAUDE.md section placement/heading for the MCP workflow doc.
- Whether `perf.spec.ts` shares `resetToBaseline()` in a `beforeAll` (implied by the fixture reuse decisions, not separately asked).

## Deferred Ideas

- Multiple Choice / Fill-in-the-Blank grade-flow coverage — could be a future phase if grading/queue logic diverges enough.
- Recall sub-mode coverage for the grade-flow spec.
- A fuller worked-example Playwright MCP walkthrough in CLAUDE.md.
- Broader `data-testid` sweep beyond the grade-flow path.
