---
phase: 21-card-database-quality-audit
verified: 2026-07-07T04:10:00Z
status: human_needed
score: 6/6 must-haves verified
behavior_unverified: 0 # Count of ⚠️ PRESENT_BEHAVIOR_UNVERIFIED truths (present + wired, behavior not exercised); each is detailed in behavior_unverified_items below (and in human_verification when status is human_needed)
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: N/A
  gaps_closed: []
  gaps_remaining: []
  regressions: []
behavior_unverified_items: [] # no behavior-dependent truths left unexercised — all six truths resolved VERIFIED on structural + artifact evidence
human_verification:
  - test: "Open .planning/audits/card-audit-2026-07-07.md at the end-of-phase review: confirm all six check-class sections read clearly with plausible counts for a ~1039-card legacy deck, and that per-finding card ids make the report directly actionable for Phase 22's fix-in-place work."
    expected: "Report reads cleanly; romanization leakage (10 fronts + 3 sentences), 1 zero-safe card, 1 zero-sentence card, and 2 near-duplicate clusters (보다, 고) are plausible for a Korean-learning legacy deck; every finding line carries a card id (cmqlm… CUID format)."
    why_human: "Report content quality (readability, plausible counts, actionable per-finding card ids) is a human judgment call, not assertable in a unit test. Harvested from 21-02-PLAN.md line 124 <verify><human-check> block (workflow.human_verify_mode = end-of-phase)."
  - test: "Live smoke test: re-run `npx tsx scripts/audit-cards.mts` against the real Turso DB and confirm exit 0, no Prisma write errors, and a fresh dated report."
    expected: "Exit code 0, console prints 'Read-only audit — no writes to the database.' posture line + per-class === Summary === blocks with a non-zero total card count, and .planning/audits/card-audit-<UTC-date>.md is (re)written."
    why_human: "Requires real Turso credentials (DATABASE_URL / DATABASE_AUTH_TOKEN) and network access to the live DB — cannot be asserted in CI. The committed report (1039 cards + non-zero findings with real CUIDs) is strong evidence the live run already happened, but re-running is the canonical smoke test per 21-VALIDATION.md Manual-Only Verifications."
---

# Phase 21: Card Database Quality Audit Verification Report

**Phase Goal:** A trustworthy, read-only audit surfaces the real extraction-error classes present in the existing ~511-card deck, producing the dated evidence report that every downstream prompt/fix decision depends on.
**Verified:** 2026-07-07T04:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths consolidated from ROADMAP success criteria (the contract) + PLAN frontmatter must_haves (plan-specific detail). ROADMAP SCs are non-negotiable; PLAN truths add detail but never subtract.

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| T1  | A read-only script runs against the live Turso deck (env-first dynamic imports prevent the empty local fallback) and writes a dated findings report to `.planning/audits/card-audit-<date>.md` [SC1 + Plan 21-02 #1, #5] | ✓ VERIFIED | `scripts/audit-cards.mts` exists (357 lines) with env-first preamble: `dotenv.config()` on lines 48-49 BEFORE `await import('../lib/audit-checks.js')` (line 54) and `await import('../lib/prisma.js')` (line 55). Dated report `.planning/audits/card-audit-2026-07-07.md` exists (102 lines) with 1039 cards scanned + real Prisma CUIDs (e.g. `cmqlm1w0u014k0gsa6eydclfd`) + non-zero findings (10 romanization fronts + 3 sentences + 1 zero-safe + 1 zero-sentence + 2 near-duplicate clusters). Non-zero count proves the real Turso deck was read, not the empty local fallback (Pitfall 4 avoided). |
| T2  | The report covers all six check classes (blank-safety, zero-sentence, romanization, distractor, normalizedFront, near-duplicate) with per-finding card ids and a totals summary [SC2 + Plan 21-02 #2] | ✓ VERIFIED | `grep -c "^## " .planning/audits/card-audit-2026-07-07.md` returns 8: `## Summary`, `## Blank-safety violations`, `## Zero-sentence cards`, `## Romanization leakage`, `## Distractor anomalies`, `## normalizedFront inconsistencies`, `## Near-duplicate clusters`, `## Stale components (summary)`. All six check-class sections present. `grep -c "id:" <report>` returns 19 — every finding line carries a card id. Summary table has 14 rows of per-class counts. |
| T3  | All audit checks live in a pure, Vitest-covered `lib/audit-checks.ts` module (11 exports, 60 tests) that reuses production helpers (sentenceMatch, splitParticle via filterComponents, normalizeFront, filterComponents) rather than reimplementing them; malformed JSON produces findings, never throws [SC3 + Plan 21-01 #1-#5] | ✓ VERIFIED | `lib/audit-checks.ts` exists (605 lines), 11 `export function` declarations (classifyBlankSafety, notFoundSentenceIndices, frontHasRomanization, sentenceHasRomanization, checkDistractors, normalizedFrontMismatch, frontUntrimmed, superNormalize, clusterNearDuplicates, countStaleComponents, runAuditChecks). Purity grep passes: `! grep -E "^import .*(prisma\|anthropic\|extract-cards\|node:\|'fs'\|\"fs\")" lib/audit-checks.ts`. Helper-reuse greps each return 1: sentenceMatch from `./sentence-match`, normalizeFront from `./card-key`, filterComponents from `./filter-components`. `splitParticle` is reused transitively (lib/filter-components.ts line 26 imports it; lib/audit-checks.ts only references it in comments — never reimplements particle logic). Malformed-JSON tests: `checkDistractors('not json', 'back')` → `['malformed-json']` (line 170), `countStaleComponents` reports `malformed: true` without throwing (line 389-390). 60 Vitest tests pass. |
| T4  | Running the audit mutates no data — verifiably read-only (structural grep: zero write-capable Prisma calls in script + pure module) [SC4 + Plan 21-02 #3] | ✓ VERIFIED | `! grep -E 'prisma\.\w+\.(create\|update\|upsert\|delete\|executeRaw)' scripts/audit-cards.mts lib/audit-checks.ts` succeeds — zero write-capable Prisma calls. The only Prisma member call in the script is `prisma.card.findMany` (line 86); `lib/audit-checks.ts` has zero Prisma imports. Structural read-only guarantee holds — the script is incapable of writing to the DB by construction. |
| T5  | Full Vitest suite stays green (no regression — 209 tests across 15 files) [Plan 21-01 #6 + Plan 21-02 npm test] | ✓ VERIFIED | `npm test` exits 0: 15 test files, 209 tests passed (includes the 60 new audit-checks tests + the pre-existing 149 tests from Phases 1-20). No regression. |
| T6  | The committed report contains card data and counts only — no connection strings or environment values [Plan 21-02 #4] | ✓ VERIFIED | `! grep -c "libsql://" .planning/audits/card-audit-2026-07-07.md` succeeds (0 matches). The renderer (scripts/audit-cards.mts lines 117-307) interpolates ONLY `AuditFindings` fields + `REPORT_DATE` — never `process.env`, the database URL, or any credential. Threat T-21-02 mitigated. |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/audit-checks.ts` | Pure audit module, 11 named exports covering all six check classes + runAuditChecks aggregator; imports only './sentence-match', './card-key', './filter-components' | ✓ VERIFIED | 605 lines, 11 `export function` declarations, 3 sibling-only imports (sentenceMatch, normalizeFront, filterComponents). Purity grep passes (no prisma/anthropic/extract-cards/node:/fs imports). JSDoc on every function names its production-helper delegation. |
| `tests/audit-checks.test.ts` | Vitest coverage for every exported function with real Korean fixtures; covers all four BlankSafetyClass outcomes + all six DistractorAnomaly literals + superNormalize parity + runAuditChecks integration | ✓ VERIFIED | 60 tests across 11 `describe` blocks. All four BlankSafetyClass outcomes covered ('zero-sentences' line 21, 'ok' line 32, 'unsafe-first' line 45, 'zero-safe' line 58). All six DistractorAnomaly literals covered ('null' line 162, 'malformed-json' lines 170/177, 'not-string-array' line 183, 'count-mismatch' line 190, 'duplicate-entries' line 205, 'equals-back' line 213). superNormalize parity fixture present (line 250: `superNormalize('~(으)면') === superNormalize('(으)면')`). runAuditChecks integration test present (line 433+). Imports from `'../lib/audit-checks'` (relative, no .js extension per test convention). |
| `scripts/audit-cards.mts` | Read-only script: dotenv-first + dynamic-import preamble, single findMany read, delegates ALL classification to runAuditChecks, renders all six check-class sections + summary to markdown + console | ✓ VERIFIED | 357 lines. Env-first preamble: `dotenv.config()` on lines 48-49 BEFORE dynamic imports on lines 54-55. Single `prisma.card.findMany` (line 86) with `include: { sentences: { orderBy: { orderIndex: 'asc' } } }` (pre-sort contract). `runAuditChecks(cards)` on line 115 — script performs zero classification of its own (grep for `safeToBlank\|LATIN\|JSON.parse` returns 0 matches). `renderMarkdown` (lines 124-307) interpolates only findings fields + date. `fs.mkdirSync(REPORT_DIR, { recursive: true })` (line 312) + `fs.writeFileSync` (line 313). `process.exit(0)` (line 357). |
| `.planning/audits/card-audit-2026-07-07.md` | Dated findings report from a verified read-only live run; all six check-class sections + summary + stale-components count; per-finding card ids; no credential material | ✓ VERIFIED | 102 lines. 8 `## ` headings (Summary + 6 check classes + Stale components summary). 19 `id:` occurrences (per-finding card ids). 0 `libsql://` matches (no credentials). Total cards scanned: 1039. Findings non-empty: 1 zero-safe, 1 zero-sentence, 10 romanization fronts, 3 romanization sentences, 2 near-duplicate clusters (보다, 고) — plausible for a Korean-learning legacy deck. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `lib/audit-checks.ts` | `lib/sentence-match.ts` | `import { sentenceMatch } from './sentence-match'` (line 31) | ✓ WIRED | `grep -cE "^import \{[^}]*sentenceMatch[^}]*\} from './sentence-match'" lib/audit-checks.ts` returns 1. Used in `classifyBlankSafety` (line 114) and `notFoundSentenceIndices` (line 133) — every blank-safety decision delegates to the production predicate. |
| `lib/audit-checks.ts` | `lib/card-key.ts` | `import { normalizeFront } from './card-key'` (line 32) | ✓ WIRED | `grep -cE "^import \{[^}]*normalizeFront[^}]*\} from './card-key'" lib/audit-checks.ts` returns 1. Used in `frontHasRomanization` (line 162), `normalizedFrontMismatch` (line 289), and `runAuditChecks` (line 564) — gloss-stripping + dedup-key recompute delegate to the production helper. |
| `lib/audit-checks.ts` | `lib/filter-components.ts` | `import { filterComponents } from './filter-components'` (line 33) | ✓ WIRED | `grep -cE "^import \{[^}]*filterComponents[^}]*\} from './filter-components'" lib/audit-checks.ts` returns 1. Used in `countStaleComponents` (line 411) — stale-components count reuses the production resolver. `splitParticle` is reused transitively (lib/filter-components.ts line 26 imports it; the audit module never reimplements particle logic — grep for `splitParticle` in lib/audit-checks.ts matches only JSDoc comments). |
| `tests/audit-checks.test.ts` | `lib/audit-checks.ts` | `import { ... } from '../lib/audit-checks'` (line 2-13) | ✓ WIRED | Relative import, no `.js` extension (per test convention). All 11 exported functions imported and exercised. |
| `scripts/audit-cards.mts` | `lib/audit-checks.ts` | `const { runAuditChecks } = await import('../lib/audit-checks.js')` (line 54, AFTER dotenv config on lines 48-49) | ✓ WIRED | Dynamic import with `.js` extension under tsx. Type-only static import (lines 40-45) is safe — types erased, no module init. ESM hoisting avoided (Pitfall 4). |
| `scripts/audit-cards.mts` | `lib/prisma.ts` | `const { prisma } = await import('../lib/prisma.js')` (line 55, AFTER dotenv config) | ✓ WIRED | Dynamic import — no static value import of the Prisma singleton (`! grep -E "^import .*lib/prisma" scripts/audit-cards.mts` passes). The 1039-card count confirms env loaded before the Prisma singleton read `DATABASE_URL`. |
| `scripts/audit-cards.mts` | `prisma.card.findMany` | Single Prisma read with `include: { sentences: { orderBy: { orderIndex: 'asc' } } }` (line 86-88) | ✓ WIRED | The script's ONLY database access. Sentences ordered by orderIndex ascending — the pre-sort contract `AuditCardInput` requires (classifyBlankSafety reads `sentences[0]` as "first"). `findMany` is the only Prisma member call in the file. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `scripts/audit-cards.mts` | `rows` (line 86) | `prisma.card.findMany({ include: { sentences: ... } })` | Yes — 1039 cards with real CUIDs + non-zero findings | ✓ FLOWING |
| `scripts/audit-cards.mts` | `cards` (line 93) | `rows.map(...)` → plain `AuditCardInput[]` | Yes — mapped from real Prisma rows | ✓ FLOWING |
| `scripts/audit-cards.mts` | `findings` (line 115) | `runAuditChecks(cards)` | Yes — per-class arrays populated (10 romanization fronts, 3 sentences, 1 zero-safe, 1 zero-sentence, 2 clusters) | ✓ FLOWING |
| `scripts/audit-cards.mts` | `markdown` (line 309) | `renderMarkdown(findings, REPORT_DATE)` | Yes — written to `.planning/audits/card-audit-2026-07-07.md` (102 lines) | ✓ FLOWING |
| `.planning/audits/card-audit-2026-07-07.md` | (the report itself) | `fs.writeFileSync(REPORT_PATH, markdown)` | Yes — 8 sections, 19 per-finding card ids, non-zero findings | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Audit-check unit tests pass | `npx vitest run tests/audit-checks.test.ts` | 60/60 tests passed (1 file, 9ms) | ✓ PASS |
| Full suite green (no regression) | `npm test` | 209/209 tests passed across 15 files (1.73s) | ✓ PASS |
| Read-only gate (zero write-capable Prisma calls) | `! grep -E 'prisma\.\w+\.(create\|update\|upsert\|delete\|executeRaw)' scripts/audit-cards.mts lib/audit-checks.ts` | Exit 0 — zero matches | ✓ PASS |
| Purity gate (no forbidden imports in audit module) | `! grep -E "^import .*(prisma\|anthropic\|extract-cards\|node:\|'fs'\|\"fs\")" lib/audit-checks.ts` | Exit 0 — zero matches | ✓ PASS |
| Helper-reuse: sentenceMatch import | `grep -cE "^import \{[^}]*sentenceMatch[^}]*\} from './sentence-match'" lib/audit-checks.ts` | 1 | ✓ PASS |
| Helper-reuse: normalizeFront import | `grep -cE "^import \{[^}]*normalizeFront[^}]*\} from './card-key'" lib/audit-checks.ts` | 1 | ✓ PASS |
| Helper-reuse: filterComponents import | `grep -cE "^import \{[^}]*filterComponents[^}]*\} from './filter-components'" lib/audit-checks.ts` | 1 | ✓ PASS |
| Static Prisma import gate | `! grep -E "^import .*lib/prisma" scripts/audit-cards.mts` | Exit 0 — zero matches (only dynamic import) | ✓ PASS |
| Dynamic import count (prisma) | `grep -c "await import('../lib/prisma.js')" scripts/audit-cards.mts` | 1 | ✓ PASS |
| Dynamic import count (audit-checks) | `grep -c "await import('../lib/audit-checks.js')" scripts/audit-cards.mts` | 1 | ✓ PASS |
| mkdirSync recursive | `grep -c "mkdirSync" scripts/audit-cards.mts` | 1 (with `{ recursive: true }` on line 312) | ✓ PASS |
| UTC date filename | `grep -c "toISOString().slice(0, 10)" scripts/audit-cards.mts` | 1 (line 57) | ✓ PASS |
| findMany is the only Prisma member call | `grep -nE "prisma\.\w+\.\w+" scripts/audit-cards.mts` | 1 match: `prisma.card.findMany` (line 86) | ✓ PASS |
| Exported function count | `grep -c "export function" lib/audit-checks.ts` | 11 (≥10 required) | ✓ PASS |
| Dated report exists | `test -f .planning/audits/card-audit-$(date -u +%Y-%m-%d).md` | Exists (2026-07-07) | ✓ PASS |
| Report section count | `grep -c "^## " .planning/audits/card-audit-2026-07-07.md` | 8 (≥7 required: Summary + 6 classes + Stale components) | ✓ PASS |
| No credentials in report | `! grep -c "libsql://" .planning/audits/card-audit-2026-07-07.md` | 0 matches | ✓ PASS |
| Per-finding card ids in report | `grep -c "id:" .planning/audits/card-audit-2026-07-07.md` | 19 occurrences | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED — this is not a migration/tooling phase and no probe scripts are declared in PLAN/SUMMARY. The phase's behavioral evidence comes from Vitest unit tests (60/60 pass) + the committed dated report artifact, not from probe scripts.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AUDIT-01 | 21-02-PLAN.md | A read-only script audits the existing card database (blank-safety violations, zero-sentence cards, romanization leakage, distractor-count anomalies, `normalizedFront` inconsistency, near-duplicate clusters) and produces a dated findings report | ✓ SATISFIED | `scripts/audit-cards.mts` exists (read-only, env-first dynamic imports, single findMany, delegates to runAuditChecks, renders 8-section markdown report). Dated report `.planning/audits/card-audit-2026-07-07.md` exists with 1039 cards scanned + all six check-class sections + per-finding card ids + non-zero findings (10 romanization fronts + 3 sentences + 1 zero-safe + 1 zero-sentence + 2 near-duplicate clusters). REQUIREMENTS.md marks AUDIT-01 as Complete (Phase 21). |
| AUDIT-02 | 21-01-PLAN.md | Audit checks are implemented as a pure, unit-tested module that reuses production helpers (`sentenceMatch`, `splitParticle`, `normalizeFront`, `filterComponents`) rather than reimplementing them | ✓ SATISFIED | `lib/audit-checks.ts` exists (605 lines, 11 named exports, pure — no Prisma/fs/Anthropic SDK/extract-cards/node: imports). Reuses all four production helpers: sentenceMatch (./sentence-match), normalizeFront (./card-key), filterComponents (./filter-components), splitParticle (transitively via filterComponents). 60 Vitest tests pass. REQUIREMENTS.md marks AUDIT-02 as Complete (Phase 21). |

**Orphaned requirements check:** REQUIREMENTS.md maps AUDIT-01 and AUDIT-02 to Phase 21. Plan 21-01 declares `requirements: [AUDIT-02]`; Plan 21-02 declares `requirements: [AUDIT-01]`. Both IDs are claimed by exactly one plan and satisfied — no orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX debt markers in lib/audit-checks.ts, tests/audit-checks.test.ts, or scripts/audit-cards.mts | ℹ️ Info | Clean — no unresolved debt markers. |
| (none) | — | No TODO/HACK/PLACEHOLDER/placeholder/coming soon/not yet implemented in any of the three source files | ℹ️ Info | Clean — no incomplete-implementation markers. |
| (none) | — | No `return null`/`return {}`/`return []` empty-stub patterns in lib/audit-checks.ts | ℹ️ Info | Clean — no stub return patterns in the pure module. |
| 21-REVIEW.md | — | 0 Critical, 3 Warning (documentation defects: docstring self-contradiction over array-index vs. orderIndex semantics; two doc defects that could mislead Phase 22), 2 Info (dead interface fields, test coverage gaps for edge cases) | ⚠️ Warning | No blockers, no security vulnerabilities. Per 21-REVIEW.md: "None cause incorrect audit classification on expected inputs; all degrade maintainability or create downstream interpretation risk." Warnings are documentation defects, not behavior defects — the audit classification is correct. |

### Human Verification Required

Two items need human testing at the end-of-phase checkpoint (per 21-VALIDATION.md Manual-Only Verifications + the harvested `<verify><human-check>` block from 21-02-PLAN.md line 124). These do not block the phase goal — all six must-have truths are VERIFIED on structural + artifact evidence — but the workflow explicitly defers these judgment/SmWoe calls to end-of-phase human review.

### 1. Report Readability + Plausible Counts (harvested from 21-02-PLAN.md line 124)

**Test:** Open `.planning/audits/card-audit-2026-07-07.md` at the end-of-phase review. Confirm all six check-class sections read clearly with plausible counts for a ~1039-card legacy deck, and that per-finding card ids make the report directly actionable for Phase 22's fix-in-place work.
**Expected:** Report reads clearly. Romanization leakage (10 fronts + 3 sentences — mostly grammar-pattern fronts with English descriptive words like "Action verb ~는 + noun" and the "CRT 렌즈" loanword), 1 zero-safe card (다 — "all/completely"), 1 zero-sentence card (철 — "iron"), and 2 near-duplicate clusters (보다, 고) are plausible for a Korean-learning legacy deck. Every finding line carries a card id in Prisma CUID format (cmqlm…).
**Why human:** Report content quality (readability, plausible counts, actionable per-finding card ids) is a human judgment call, not assertable in a unit test. The structural checks (8 sections, 19 id: occurrences, no credentials, non-zero findings) are already VERIFIED — this item is the qualitative read of the same artifact.

### 2. Live Smoke Test Against Turso (from 21-VALIDATION.md Manual-Only Verifications)

**Test:** Re-run `npx tsx scripts/audit-cards.mts` against the real Turso DB. Confirm exit 0, no Prisma write errors, and a fresh dated report.
**Expected:** Exit code 0. Console prints the "Read-only audit — no writes to the database." posture line, then per-class `=== Summary ===` blocks with a non-zero total card count, then `process.exit(0)`. The report at `.planning/audits/card-audit-<UTC-date>.md` is (re)written.
**Why human:** Requires real Turso credentials (DATABASE_URL / DATABASE_AUTH_TOKEN) and network access to the live DB — cannot be asserted in CI without leaking secrets. The committed report (1039 cards + non-zero findings with real CUIDs) is strong evidence the live run already happened against the real deck (not the empty local fallback, which would produce ~0 cards — Pitfall 4), but re-running is the canonical smoke test. The script is structurally read-only (grep-provable: only `findMany`, zero write-capable calls), so re-running cannot mutate data.

### Gaps Summary

No gaps found. All six must-have truths are VERIFIED on structural + artifact evidence:

- The pure audit module exists, is substantive (605 lines, 11 exports), and is wired to all three production helpers (sentenceMatch, normalizeFront, filterComponents — splitParticle reused transitively).
- The Vitest suite covers all six check classes + all four BlankSafetyClass outcomes + all six DistractorAnomaly literals + the superNormalize parity fixture + a runAuditChecks integration test (60 tests, full suite 209 green).
- The read-only script exists, is structurally read-only (only `findMany`, zero write-capable Prisma calls), and follows the env-first dynamic-import convention (avoiding Pitfall 4).
- The dated report exists at `.planning/audits/card-audit-2026-07-07.md` with all six check-class sections + summary + stale-components summary, 19 per-finding card ids, and no credential material.
- The committed report shows non-zero findings (10 romanization fronts + 3 sentences + 1 zero-safe + 1 zero-sentence + 2 near-duplicate clusters) — exactly what we'd expect for a Korean-learning legacy deck that predates Phase 20's code-enforced blank-safety.

The status is `human_needed` (not `passed`) because the workflow explicitly defers two items to end-of-phase human review: (1) the report's qualitative readability/plausibility judgment (harvested from 21-02-PLAN.md `<verify><human-check>` block) and (2) the live Turso smoke test (per 21-VALIDATION.md Manual-Only Verifications). Neither item blocks the phase goal — both are judgment/external-service calls that the structural checks already cover from a different angle — but per the verifier decision tree, a non-empty human_verification section routes to `human_needed` regardless of truth score.

---

_Verified: 2026-07-07T04:10:00Z_
_Verifier: the agent (gsd-verifier)_
