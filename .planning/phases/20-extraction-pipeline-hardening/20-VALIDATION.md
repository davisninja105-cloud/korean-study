---
phase: 20
slug: extraction-pipeline-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (project devDep; node environment) |
| **Config file** | `vitest.config.ts` (alias `@` → root) |
| **Quick run command** | `npx vitest run tests/extract-cards.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/extract-cards.test.ts`
- **After every plan wave:** Run `npm test && npm run lint`
- **Before `/gsd-verify-work`:** Full suite green + one live single-lesson extraction via `npx tsx scripts/local-resync.mts` (manual — requires `ANTHROPIC_API_KEY` + Turso)
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|------------|------------------|-----------|-------------------|-------------|--------|
| EXTRACT-01 | `zodOutputFormat(ExtractionSchema).schema` shape: `additionalProperties:false` on all objects, `sentences.minItems===1`, `notes` optional, wrapper root object | — | N/A | unit (schema snapshot, no API call) | `npx vitest run tests/extract-cards.test.ts` | ❌ Wave 0 | ⬜ pending |
| EXTRACT-01 | `zodOutputFormat(...).parse` throws `AnthropicError` on truncated text and on schema-violating JSON | — | N/A | unit | same | ❌ Wave 0 | ⬜ pending |
| EXTRACT-01 | Happy path consumes a raw `{cards:[...]}` object via `normalizeExtractedCards` with identical output to the text path | V5 Input Validation | Untrusted LLM output validated before any Prisma write | unit (pure function, object input) | same | ❌ Wave 0 | ⬜ pending |
| EXTRACT-02 | Well-formed `{cards:[...]}` text parses fully; truncation mid-card-2 salvages card 1; truncation inside nested `sentences` doesn't produce a false boundary; cut mid-first-card throws | DoS (malformed/truncated JSON) | Salvage is a single O(n) pass; bounded 32K-token text | unit against `parseExtractionResponse` with crafted strings | same | ❌ Wave 0 (extend existing file; migrate 14 fixtures to wrapper shape) | ⬜ pending |
| EXTRACT-03 | Card whose sentences all fail `.found` → rejected; card with found-but-unsafe-only sentences → rejected; unsafe supplementary sentence retained after a safe one; safe sentence promoted to index 0 | — | No card reaches DB without a code-verified blank-safe first sentence | unit | same | ❌ Wave 0 | ⬜ pending |
| Criterion #4 (regression) | Existing dedup/self-exclude/`filterComponents`/CR-01 tests still pass unmodified in logic (fixtures re-wrapped only) | — | N/A | unit (existing 14 tests) | same | ✅ `tests/extract-cards.test.ts` | ⬜ pending |
| Criterion #4 (live) | One-lesson extraction via `npx tsx scripts/local-resync.mts` produces cards with populated `components`, no duplicate `normalizedFront`, sentences[0] blank-safe | Prompt injection via lesson content | Structured outputs narrows response surface; per-card validation drops malformed items | manual-only | human-verify at phase end | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs are assigned by the planner and will be backfilled into this table (or the planner's PLAN.md `must_haves` should cite these Req IDs directly).*

---

## Wave 0 Requirements

- [ ] `tests/extract-cards.test.ts` — migrate 14 existing fixtures to `{cards:[...]}` wrapper shape; add truncation-salvage, blank-safety-partition, zero-safe-rejection, schema-shape, and SDK-parse-throw cases (covers EXTRACT-01/02/03)
- [ ] `package.json` — add `zod` to `dependencies` (`^4.3.6`, matching the version already resolved transitively)
- [ ] No new test framework/config needed — existing Vitest infrastructure covers this phase

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live single-lesson extraction produces well-formed cards with no regression vs. current output | Criterion #4 | Requires a real Anthropic API call + Turso DB (no live-API calls in unit tests) | Run `npx tsx scripts/local-resync.mts` against one lesson; inspect resulting cards for populated `components`, unique `normalizedFront`, and a blank-safe `sentences[0]` per card |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
