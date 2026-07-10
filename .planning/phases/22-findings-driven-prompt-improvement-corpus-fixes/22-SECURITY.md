---
phase: 22
slug: findings-driven-prompt-improvement-corpus-fixes
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-10
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Pure shared function (`lib/sentence-match.ts`) | Consumed by client render code and server-side extraction/audit code; no untrusted input crosses a new boundary | Korean sentence strings (trusted deck content) |
| `scripts/prompt-eval.mts` → Anthropic API | Lesson content (developer's own tutor notes, trusted) sent to an already-authenticated SDK integration | Lesson text, extracted card JSON |
| `scripts/prompt-eval.mts` → Turso DB | Read-only queries only; the script must never gain a write path | Card/Lesson rows (read) |
| `scripts/fix-corpus-2026-07.mts` (developer machine) → production Turso | The fix script's `--apply` writes cross into production data holding irreplaceable FSRS/ReviewLog history | Card.front/normalizedFront rewrites, new Sentence rows |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-22-01 | Tampering | `lib/sentence-match.ts` `safeToBlank` predicate | low | mitigate | Full test matrix in `tests/sentence-match.test.ts` asserts unsafe for embedded-left, embedded-right, first-occurrence-embedded, and isolated-multi-occurrence cases — verified present and passing. | closed |
| T-22-02 | Tampering (of LLM output) | `extractCardsFromNotes` prompt / lesson content | low | accept | Prompt injection via lesson content is a pre-existing accepted characteristic since Phase 20 — lesson notes are the developer's own trusted tutor content, not third-party input. No new mitigation introduced or required. | closed |
| T-22-03 | Tampering | `scripts/prompt-eval.mts` accidentally persisting eval output | medium | mitigate | Verified directly: the script's only Prisma calls are `findUnique`/`findMany`/`$disconnect` — zero `create`/`update`/`delete`/`upsert` calls anywhere in the file. Non-persisting by construction. | closed |
| T-22-04 | Tampering | `scripts/fix-corpus-2026-07.mts` run with `--apply` against the wrong environment | high | mitigate | Verified: env loaded only from `.env`/`.env.local` (no CLI flag overrides `DATABASE_URL`); `dbHostOnly()` prints the resolved DB host before any query; dry-run is the default (`APPLY = process.argv.includes('--apply')`); FIX-REPORT.md documents the human approval checkpoint was honored before the `--apply` run ("Approved as-is... no adjustments"). | closed |
| T-22-05 | Tampering | Destroying FSRS state / ReviewLog history via delete-and-recreate | high | mitigate | Verified: `scripts/fix-corpus-2026-07.mts` contains exactly one write path per entity — `prisma.card.update()` (9 in-place front rewrites) and `prisma.sentence.create()` (additive-only for card 철). No `card.delete`/`card.create` calls exist in the file; cascade paths are never triggered. | closed |
| T-22-06 | Repudiation | Untraceable production data changes | medium | mitigate | Verified: `22-FIX-REPORT.md` and `22-POST-FIX-AUDIT.md` exist with a committed, dated, per-card-id record of exactly which rows changed (old→new front values, new Sentence rows) and why (decision IDs D-03 through D-10). | closed |
| T-22-SC | Tampering | npm/pip/cargo installs | low | accept | No packages installed or upgraded across all three plans in this phase (RESEARCH.md Package Legitimacy Audit confirmed none this phase). | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-02 | LLM prompt-injection surface via lesson notes is a pre-existing, deliberately accepted characteristic since Phase 20 (trusted first-party content, not third-party input). No behavior changed by this phase. | Phase 22 plan author | 2026-07-10 |
| AR-22-02 | T-22-SC | No dependency installs/upgrades performed in this phase. | Phase 22 plan author | 2026-07-10 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-10 | 7 | 7 | 0 | Claude (gsd-secure-phase, State B — built from PLAN.md threat models, verified directly against implementation files) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-10
