---
phase: 22
slug: findings-driven-prompt-improvement-corpus-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.9 |
| **Config file** | none found at repo root (Vitest defaults; `npm test` = `vitest run`) |
| **Quick run command** | `npx vitest run tests/sentence-match.test.ts tests/extract-cards.test.ts tests/audit-checks.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds (212 tests / 15 files, measured this session) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/sentence-match.test.ts tests/extract-cards.test.ts` (the two files directly touched by the `sentenceMatch()` word-boundary change)
- **After every plan wave:** Run `npm test` (full suite — catches ripple into `tests/audit-checks.test.ts`, `tests/known-words.test.ts`, `tests/sequence.test.ts`, which transitively import `sentence-match.ts` / `filterComponents`)
- **Before `/gsd-verify-work`:** Full suite must be green, PLUS a manual `prompt-eval.mts` run showing the before/after diff meets the "must improve, not necessarily hit zero" bar (D-12), PLUS a follow-up audit-checks re-run confirming the specific corpus-fix findings (romanization fronts, zero-safe, zero-sentence) have cleared for the fixed card ids.
- **Max feedback latency:** ~2 seconds (automated full suite) — DB-touching fix scripts and the LLM-calling `prompt-eval.mts` are manual-trigger steps, not part of the automated per-commit loop.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-xx | 01 | 1 | sentenceMatch() word-boundary (D-01/D-02, load-bearing) | — | Isolated 1-char target → safeToBlank true; embedded 1-char target → safeToBlank false | unit | `npx vitest run tests/sentence-match.test.ts` | ✅ exists, needs new + updated cases | ⬜ pending |
| 22-02-xx | 02 | 1-2 | PROMPT-01 | — | Prompt text edits annotated per error class (D-06/D-07/D-08/D-09) | manual-only (prose review) — no automated test can assert prompt wording quality | n/a | n/a | ⬜ pending |
| 22-03-xx | 03 | 2 | PROMPT-02 | T-security-1 | `prompt-eval.mts` diffs audit-check counts before/after on targeted sample (lessons 4, 12, 17); dedup list must exclude each target lesson's own current cards | integration (real API calls, manual trigger) | `npx tsx scripts/prompt-eval.mts` | ❌ Wave 0 — new script | ⬜ pending |
| 22-04-xx | 04 | 2-3 | FIX-01 | T-security-1 | Corpus fixes mutate in place by id, never delete+recreate; front rewrites recompute `normalizedFront` together with `front` | unit + manual DB verification | fix script (dry-run) then `--apply`; verify via `scripts/audit-cards.mts` re-run showing the finding cleared | ❌ Wave 0 if scripted; N/A if via CardEditor | ⬜ pending |
| 22-05-xx | 05 | 2-3 | FIX-02 | T-security-1 | Fix scripts default to dry-run, require `--apply`; print target/mode before writing | manual: run without `--apply` (confirm zero writes / "DRY RUN"), run with `--apply` (confirm writes) | manual inspection, matching `retro-filter-cleanup.mts` convention (no dedicated test file for this convention) | ❌ Wave 0 if a new script needs this pattern | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs above are placeholders — the planner assigns real plan/task numbers; this table's Req/Test-Type/Command mapping is the binding contract, not the exact IDs.)*

---

## Wave 0 Requirements

- [ ] `scripts/prompt-eval.mts` — does not exist; must be created (PROMPT-02). No prior-art template exists (`scripts/reextract-lesson.mjs` is legacy, persists to DB — do not use as a persistence template, only for its env-loading/lesson-lookup pattern).
- [ ] `tests/sentence-match.test.ts` — needs an updated assertion for the existing single-char test (currently asserts the old "always unsafe" behavior) plus new cases for isolated-vs-embedded 1-char targets (D-01/D-02).
- [ ] `tests/extract-cards.test.ts` fixture (existing line ~486) — must be reviewed once `sentenceMatch()` changes; may or may not need updating depending on whether its fixture sentence is isolated or embedded.
- [ ] A saved BEFORE baseline for `prompt-eval.mts`'s diff (checked-in JSON snapshot or inline const, mirroring `retro-filter-cleanup.mts`'s `BASELINE` object pattern) — must be produced by running the eval script against the OLD prompt before any prompt edits land, then reused as the after-comparison point.

*No gap in `lib/audit-checks.ts` itself — every check function PROMPT-02 needs already exists and is unit-tested (63 existing test cases in `tests/audit-checks.test.ts`).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Prompt wording quality per error class | PROMPT-01 | No automated test can assert prose quality/annotation correctness | Read the diff; confirm each edited bullet/rule is annotated with the specific error class (D-06/D-07/D-08/D-09) it addresses |
| `prompt-eval.mts` before/after diff | PROMPT-02 | Requires real Anthropic API calls against real lesson content; not part of `npm test` | Run `npx tsx scripts/prompt-eval.mts` against lessons 4, 12, 17 before AND after the prompt edit; confirm targeted audit-check counts (romanization flags, zero-safe/zero-sentence) measurably drop (not necessarily to 0, per D-12) |
| Corpus fix script dry-run/apply behavior | FIX-01, FIX-02 | DB-mutating; must be verified against the live Turso DB, not a test double | Run without `--apply` → confirm zero writes and a clear "DRY RUN" report; run with `--apply` → confirm the report matches actual DB state afterward (spot-check via `turso db shell` or a follow-up audit-checks re-run) |
| `sentenceMatch()` ripple across consuming components | D-01/D-02 | Visual/interaction correctness in `HighlightedSentence`, `StudySession`, `CardEditor` isn't captured by unit tests alone | Manually exercise Study flow (flashcard fill-blank) and Cards page CardEditor preview for at least one now-newly-safe single-char card (다) and one still-unsafe embedded case, confirming highlighting/blanking behaves as expected |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
