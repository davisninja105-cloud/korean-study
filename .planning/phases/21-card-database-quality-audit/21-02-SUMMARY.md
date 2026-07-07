---
phase: 21-card-database-quality-audit
plan: 02
subsystem: database
tags: [audit, read-only, prisma, turso, markdown-report, typescript]

# Dependency graph
requires:
  - phase: 21-card-database-quality-audit
    provides: lib/audit-checks.ts (runAuditChecks aggregator + AuditFindings/AuditCardInput types) — Plan 21-01's pure module this script consumes
  - phase: 20-extraction-pipeline-hardening
    provides: post-Phase-20 blank-safety/distractor enforcement the audit measures legacy debt against
provides:
  - scripts/audit-cards.mts — read-only audit script (dotenv-first + dynamic-import preamble, single findMany read, delegates ALL classification to runAuditChecks, renders markdown report + console summary)
  - .planning/audits/card-audit-2026-07-07.md — the dated evidence report Phase 22 consumes (real per-class finding counts + per-finding card ids)
  - .planning/audits/ — new directory for dated audit reports (created at script runtime via recursive mkdir)
affects:
  - 22 (prompt revisions + in-place corpus fixes judged against these exact findings; every finding carries the card id for fix-in-place work)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Env-first + dynamic-import preamble (dotenv → await import('../lib/*.js')) — copied from retro-filter-cleanup.mts to avoid ESM hoisting reading env too early (Pitfall 4: empty local file fallback)"
    - "Structural read-only guarantee — only findMany Prisma member call; grep-gated absence of create/update/upsert/delete/executeRaw in both the script AND the pure module"
    - "Thin I/O adapter script — script owns ALL I/O (Prisma read, console, file write); zero classification logic (all in lib/audit-checks.ts per AUDIT-02 boundary)"
    - "Dated markdown report write — first dated-report-file convention in the repo (fs.mkdirSync recursive + writeFileSync); UTC calendar date via toISOString().slice(0,10), NOT habitDateStr"

key-files:
  created:
    - scripts/audit-cards.mts
    - .planning/audits/card-audit-2026-07-07.md
  modified: []

key-decisions:
  - "Script is a thin I/O adapter — zero classification logic; all check logic lives in lib/audit-checks.ts (runAuditChecks). The script: load → runAuditChecks → render markdown → write file → console summary → exit(0)."
  - "Env-first dynamic-import preamble copied verbatim from retro-filter-cleanup.mts:27-41 — static import of { prisma } would ESM-hoist and read env before dotenv runs, hitting the empty local file fallback (Pitfall 4, symptom ~0 cards). Type-only static import from audit-checks is safe (types erased, no module init)."
  - "Report date uses new Date().toISOString().slice(0, 10) (UTC calendar date) — NOT habitDateStr (that helper is for activity logging only). Script date and shell date are both UTC so they agree."
  - "Renderer interpolates ONLY findings fields + the date — never process.env, the database URL, or any credential. The report is committed to git and becomes permanent record (threat T-21-02 mitigated)."
  - "Every finding line includes the card id — STATE.md v1.5 hard rule: Phase 22 fixes in place by id, never delete+recreate (cascades wipe FSRS state + ReviewLog history)."

patterns-established:
  - "Pattern: env-first + dynamic-import preamble for .mts scripts that touch Prisma (dotenv → await import('../lib/*.js') with .js extensions under tsx)"
  - "Pattern: structural read-only guarantee via grep — zero write-capable Prisma calls in script + pure module; only findMany/count allowed"
  - "Pattern: dated markdown report under .planning/audits/ (mkdirSync recursive + writeFileSync; UTC date filename)"
  - "Pattern: thin I/O adapter script over a pure lib module — script owns all I/O, module owns all classification (AUDIT-01/AUDIT-02 boundary)"

requirements-completed: [AUDIT-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "scripts/audit-cards.mts — read-only audit script with env-first dynamic-import preamble, single findMany read, delegates all classification to runAuditChecks, renders all six check-class sections + summary to markdown + console"
    requirement: AUDIT-01
    verification:
      - kind: other
        ref: "grep gate: zero write-capable Prisma calls in scripts/audit-cards.mts + lib/audit-checks.ts (PASS)"
        status: pass
      - kind: other
        ref: "grep gate: no static import of lib/prisma + 1x await import('../lib/prisma.js') + 1x await import('../lib/audit-checks.js') (PASS)"
        status: pass
      - kind: other
        ref: "grep gate: mkdirSync=1 recursive + toISOString().slice(0,10)=1 + six section headings present (PASS)"
        status: pass
      - kind: unit
        ref: "npm test (209 tests across 15 files, all pass — no regression)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dated audit report from a verified read-only live run against the Turso deck — the Phase 22 evidence artifact with real per-class finding counts and per-finding card ids"
    requirement: AUDIT-01
    verification:
      - kind: other
        ref: "npx tsx scripts/audit-cards.mts exits 0; 1039 cards scanned; .planning/audits/card-audit-2026-07-07.md exists"
        status: pass
      - kind: other
        ref: "grep gate: 8x '## ' headings (Summary + 6 classes + Stale components); no libsql:// or credential material in report"
        status: pass
      - kind: other
        ref: "console total (1039) matches report Summary 'Total cards scanned | 1039 |'"
        status: pass
    human_judgment: true
    rationale: "Per 21-VALIDATION.md Manual-Only Verifications: report content quality (readability, plausible counts for a legacy deck, per-finding card ids actionable for Phase 22 fix-in-place) is a human judgment call, not assertable in a unit test. The live run itself requires real Turso credentials (manual smoke test). Reviewed at /gsd-verify-work end-of-phase."

# Metrics
duration: 4 min
completed: 2026-07-07
status: complete
---

# Phase 21 Plan 02: Card Database Quality Audit — Read-Only Script + Live Dated Report Summary

**Read-only `scripts/audit-cards.mts` (env-first dynamic-import preamble, single findMany, delegates to runAuditChecks) producing the dated `.planning/audits/card-audit-2026-07-07.md` evidence report — 1039 cards scanned, findings non-empty as expected for a legacy deck**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-07T03:45:37Z
- **Completed:** 2026-07-07T03:50:07Z
- **Tasks:** 2 (both type="auto", no TDD cycle)
- **Files modified:** 2 (both created)

## Accomplishments
- Created `scripts/audit-cards.mts` — a thin read-only I/O adapter that loads the live Turso deck via a single `prisma.card.findMany` (sentences ordered by orderIndex asc), delegates ALL classification to `runAuditChecks` (lib/audit-checks.ts), and renders the findings as markdown + a console summary
- Ran the script against the live deck: exit 0, **1039 cards scanned** (the real Turso corpus, not the empty local fallback), report written to `.planning/audits/card-audit-2026-07-07.md`
- Structural read-only guarantee verified by grep: zero `create/update/upsert/delete/executeRaw` Prisma calls in either the script or the pure module; `findMany` is the only Prisma member call
- Env-first dynamic-import preamble (dotenv → `await import('../lib/*.js')`) confirmed working — the non-zero card count proves env loaded before the Prisma singleton read `DATABASE_URL` (Pitfall 4 avoided)
- The committed report contains only card data + counts + the date — no connection strings, tokens, or env values (threat T-21-02 mitigated); every finding line carries the card id for Phase 22 fix-in-place work

## Real Per-Class Finding Counts (from the live run — Phase 22 consumes these)

| Check class | Findings |
| --- | --- |
| **Total cards scanned** | **1039** |
| Blank-safety — zero-safe cards | 1 |
| Blank-safety — unsafe-first cards | 0 |
| Blank-safety — sentences with targetForm not found | 0 |
| Zero-sentence cards | 1 |
| Romanization — flagged fronts | 10 |
| Romanization — flagged sentences | 3 |
| Distractor anomalies | 0 |
| normalizedFront inconsistencies | 0 |
| Untrimmed fronts | 0 |
| Near-duplicate clusters | 2 |
| Stale components — cards affected | 0 |
| Stale components — total stale entries | 0 |
| Stale components — malformed JSON rows | 0 |

**Interpretation for Phase 22:** The deck is healthier than the ~511-card ROADMAP estimate suggested — distractor anomalies, normalizedFront mismatches, untrimmed fronts, and stale components are all zero (the retro-filter-cleanup.mts `--apply` run and Phase 20 enforcement already cleaned those). The remaining legacy debt concentrates in romanization leakage (10 fronts + 3 sentences — mostly grammar-pattern fronts with English descriptive words like "Action verb ~는 + noun" and the "CRT 렌즈" loanword), plus 1 zero-safe card, 1 zero-sentence card, and 2 near-duplicate clusters (보다, 고). Findings are non-empty as expected — an all-zero report would have signaled the empty local fallback DB (Pitfall 4).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/audit-cards.mts** — `5b1e346` (feat)
2. **Task 2: Run the audit + commit dated report** — `1872a10` (feat)

## Files Created/Modified
- `scripts/audit-cards.mts` — Read-only audit script: env-first + dynamic-import preamble, single `prisma.card.findMany` read (sentences ordered by orderIndex asc), delegates ALL classification to `runAuditChecks`, renders all six check-class sections + summary + stale-components summary to markdown + console, writes to `.planning/audits/card-audit-<UTC-date>.md`
- `.planning/audits/card-audit-2026-07-07.md` — The dated evidence report from the live run: 1039 cards, all six check classes with per-finding card ids, no credential material

## Decisions Made
- **Script is a thin I/O adapter — zero classification logic.** All check logic lives in `lib/audit-checks.ts` (`runAuditChecks`). The script: load → runAuditChecks → render markdown → write file → console summary → exit(0). This enforces the AUDIT-01/AUDIT-02 boundary from Plan 21-01.
- **Env-first dynamic-import preamble copied verbatim from retro-filter-cleanup.mts:27-41.** Static `import { prisma }` would ESM-hoist and read env before dotenv runs, silently hitting the empty `file:./prisma/dev.db` local fallback (Pitfall 4; symptom ~0 cards). Type-only static import from audit-checks is safe (types erased, triggers no module init). The 1039-card count confirms the real Turso deck was read.
- **Report date = `new Date().toISOString().slice(0, 10)` (UTC calendar date).** NOT `habitDateStr` (that helper is for activity logging only). Script date and shell date are both UTC so they agree on the filename.
- **Renderer interpolates ONLY findings fields + the date** — never `process.env`, the database URL, or any credential. The report is committed to git and becomes permanent record (threat T-21-02 mitigated).
- **Every finding line includes the card id** — STATE.md v1.5 hard rule: Phase 22 fixes in place by id, never delete+recreate (cascades wipe FSRS state + ReviewLog history).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — the live Turso run completed on the first attempt (exit 0, no Prisma errors). The dynamic-import order was correct on the first try, so the 1039-card count confirms the real deck was read (not the empty local fallback). No script-layer fixes were needed.

## User Setup Required

None — Turso credentials were already present in `.env` / `.env.local` (no user setup needed). The script reads `DATABASE_URL` / `DATABASE_AUTH_TOKEN` via the dotenv-first preamble.

## Next Phase Readiness
- The dated evidence report `.planning/audits/card-audit-2026-07-07.md` is committed and ready for Phase 22 — it carries every finding with its card id, making fix-in-place work directly actionable
- The real per-class counts (above) are Phase 22's primary input: romanization leakage (10 fronts + 3 sentences) is the largest bucket; 1 zero-safe card + 1 zero-sentence card need sentence regeneration; 2 near-duplicate clusters (보다, 고) need merge/review decisions
- `scripts/audit-cards.mts` is re-runnable anytime (read-only, idempotent — same-date filename overwrites) to verify Phase 22 fixes reduced the counts
- No blockers or concerns

---
*Phase: 21-card-database-quality-audit*
*Completed: 2026-07-07*

## Self-Check: PASSED

- **Created files exist:** scripts/audit-cards.mts ✓, .planning/audits/card-audit-2026-07-07.md ✓, 21-02-SUMMARY.md ✓
- **Both task commits exist:** 5b1e346 ✓ (Task 1 — script), 1872a10 ✓ (Task 2 — dated report)
- **Read-only gate (plan-level):** zero write-capable Prisma calls in scripts/audit-cards.mts + lib/audit-checks.ts ✓
- **Report headings:** 8x `## ` (Summary + 6 check classes + Stale components summary) ✓
- **No credential material:** no `libsql://` in the committed report ✓
- **Live run:** exit 0, 1039 cards scanned (real Turso deck, not empty fallback), console total matches report Summary ✓
- **Full suite:** npm test — 209 tests passed across 15 files (no regression) ✓
