---
phase: 24
slug: freshness-diagnosis-spike
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None persisted for this phase — the throwaway Playwright script (`scripts/diagnose-freshness.mts`) IS the diagnostic instrument, not a framework-integrated automated test. Vitest (`^4.1.9`) is the project's existing unit-test framework but does not exercise browser/RSC-cache behavior. |
| **Config file** | none — explicitly forbidden by CONTEXT.md D-01 (no `playwright.config.ts`, no `tests-e2e/` conventions; that's Phase 25's job) |
| **Quick run command** | `npx tsx scripts/diagnose-freshness.mts` (once written) |
| **Full suite command** | Same — this is a one-shot diagnostic run against `npm run build && npm start`, not a repeatable suite |
| **Estimated runtime** | ~3–6 minutes (production build + start, then scripted navigation across 4 routes × 4 paths) |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` (script must at least type-check cleanly; no incremental automated test exists for a one-shot diagnostic script)
- **After every plan wave:** Run `npx tsx scripts/diagnose-freshness.mts` end-to-end against a fresh `npm run build && npm start` — this is both the "test" and the deliverable-producing step
- **Before `/gsd-verify-work`:** `24-DIAGNOSIS.md` must exist and cover all 16 route×path cells (4 routes × 4 navigation paths) per D-08/D-09/D-10, each with an explicit stale/fresh verdict and (for stale rows) root-cause attribution
- **Max feedback latency:** ~5 minutes (one full script run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-0N | 01 | 1 | FRESH-01 | T-24-01 / — | Script never points at real `libsql://` `DATABASE_URL`; only local `file:` test DB | scripted browser experiment | `npx tsx scripts/diagnose-freshness.mts` | ❌ W0 — script does not exist yet | ⬜ pending |
| 24-01-0N | 01 | 1 | FRESH-01 | — | Diagnosis document covers all 16 cells with explicit stale/fresh + root cause | manual review against ROADMAP success criteria | N/A — human/reviewer check | ❌ W0 — doc does not exist yet | ⬜ pending |

*Final task IDs are assigned by the planner; this table's shape (one row for the script build/run, one for the diagnosis-document completeness check) is the validation contract the planner's tasks must satisfy.*

---

## Wave 0 Requirements

- [ ] `scripts/diagnose-freshness.mts` — does not exist; this phase's core task (throwaway, `.mts` per repo script conventions)
- [ ] Isolated local `file:` SQLite test DB + minimal seed data (a lesson, 2–3 cards, ≥1 due `CardReview`) — no existing generic seeder in `scripts/`; closest analog (`local-resync.mts`) seeds via real Claude extraction and is not reusable here
- [ ] `playwright` devDependency install (`npm install -D playwright`) — flagged `[SUS]` by the legitimacy seam on a "too-new release cadence" heuristic despite 65M weekly downloads and the official `microsoft/playwright` repo; approved override, but gate the install step behind a `checkpoint:human-verify` per protocol

*Wave 0 exists because this phase's validation instrument (the script) and its fixture data must be built before any diagnostic run can happen — there is no pre-existing test infrastructure to extend.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diagnosis correctness (root-cause attribution is genuinely binary and non-ambiguous per stale row) | FRESH-01 | Root-cause attribution requires human judgment reading the script's captured network evidence against the two candidate causes (Router Cache reuse vs. client-shell `useState(initialProps)` non-resync) — not a pass/fail assertion | Read `24-DIAGNOSIS.md`; confirm every stale row cites concrete evidence (e.g. "no RSC fetch observed on `popstate`" vs. "RSC fetch fired, 200, fresh payload — but `StudyClient`'s due-count badge unchanged") and that no row is left ambiguous |
| Exact RSC request signature on this app's real traffic (`_rsc` query param / `Rsc: 1` header) | FRESH-01 | Community-confirmed pattern only, not verified against Next.js 16.2.10 + this app's actual network traffic (RESEARCH.md Open Question #1) | First script run must log unfiltered request headers for at least one navigation before trusting the 16-cell classification; confirm the signature empirically |
| `playwright` devDependency legitimacy override | — | Automated legitimacy seam flagged `[SUS]` on release-cadence heuristic alone | Human confirms `microsoft/playwright` + 65M weekly downloads before `npm install -D playwright` proceeds (`checkpoint:human-verify`) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
