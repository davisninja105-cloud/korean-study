---
phase: 16
slug: components-filter-fix
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-04
---

# Phase 16 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Claude extraction response → sync pipeline | Untrusted-ish LLM output whose `components[]` strings may be fabrications, or whose card objects may be malformed/truncated, before being persisted via Prisma | Extracted card JSON (front/back/type/components/sentences) |
| In-memory keyToId map → CardDependency writes | The lookup's scope decides which real cards can be resolved as prerequisites; too-narrow scope silently drops valid leaf-node edges | normalizedFront → cardId map |
| Dry-run script → Turso (read-only) | Diagnostic reads production corpus; no user-controllable input | Read-only Card rows |
| Cleanup script → production Turso corpus (write) | Developer-run script mutates live `Card.components` values and `CardDependency` rows | Card.components, CardDependency rows |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-16-02 | Tampering (data integrity) | `lib/filter-components.ts` — spurious `CardDependency` edges | medium | mitigate | Deck-lookup `filterComponents()` drops components resolving to no real card; 7/7 unit tests lock the keep/drop contract | closed |
| T-16-03 | Tampering (SQL injection) | `scripts/dry-run-filter.mjs` | low | accept | Read-only, fixed queries, no user input | closed |
| T-16-04 | Tampering (data integrity) | `parseExtractionResponse` — malformed card silently coerced into an empty-string card | medium | mitigate | `isValidExtractedCard` structural filter drops cards with missing/empty front/back or invalid type before `.map()`/persist; 6/6 unit tests | closed |
| T-16-05 | Denial of Service (data-loss regression) | Over-strict validation discarding a whole truncated response | medium | mitigate | Per-element filter layered on top of the unchanged array-level truncation-salvage parser; dedicated test asserts salvage still yields completed cards | closed |
| T-16-06 | Tampering (data integrity) | Unfiltered `components[]` creating spurious `CardDependency` edges that corrupt foundation-first sequencing | high | mitigate | `filterComponents()` wired into `parseExtractionResponse`, fed the full deck set, before persist; 5/5 new tests assert spurious-dropped / real-retained end-to-end | closed |
| T-16-07 | Tampering (data integrity, false negative) | `keyToId` scoped to components-not-null under-links real leaf-node prerequisites | medium | mitigate | `keyToId` seeded from ALL cards (no `where` clause) in both `app/api/sync/route.ts` and `scripts/local-resync.mts`; stale `keyToId.delete` branch removed; confirmed via grep (0 matches) + full test suite (93/93) | closed |
| T-16-08 | Tampering (data integrity, production write) | Unsafe/partial mutation of `Card.components`/`CardDependency` corrupting the live corpus | high | mitigate | Dry-run by default, writes gated behind explicit `--apply`; before/after counts compared to the 16-01 baseline (exact match); batched `prisma.$transaction` writes; blocking-human checkpoint (never auto-approved); script never deletes `Card`/`Lesson` rows; production run applied, idempotency confirmed (0/0/0 on re-run) | closed |
| T-16-09 | Tampering (over-pruning) | Reconciliation deletes valid `CardDependency` edges if deck set built too narrowly | high | mitigate | Desired-edge set recomputed from CLEANED components using an ALL-cards `keyToId`; dry-run surfaced prune/add deltas for human review before any delete; idempotent re-run confirmed 0 further changes | closed |
| T-16-10 | Tampering (SQL/ORM injection) | `scripts/retro-filter-cleanup.mts` queries | low | accept | All reads/writes go through Prisma parameterized calls (`findMany`/`$transaction`/`deleteMany`/`upsert`) — no raw SQL string interpolation confirmed by grep (no `$queryRaw`/`executeRaw` usage) | closed |
| T-16-SC | Tampering (supply chain) | npm installs across all 4 plans | low | accept | Zero new dependencies introduced this phase (per-plan RESEARCH.md Package Legitimacy Audit: N/A) | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-16-01 | T-16-03 | `dry-run-filter.mjs` is read-only, fixed queries, no user-controllable input; SQL injection surface is nil | Plan 16-01 threat model | 2026-07-03 |
| R-16-02 | T-16-10 | `retro-filter-cleanup.mts` uses only Prisma parameterized calls, no raw SQL, corpus-wide fixed operation with no external input | Plan 16-04 threat model | 2026-07-03 |
| R-16-03 | T-16-SC | No package installs performed in any of the 4 plans this phase | Plans 16-01 – 16-04 threat models | 2026-07-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-04 | 10 | 10 | 0 | orchestrator (L1 grep-depth verification against plan-time STRIDE registers; register_authored_at_plan_time: true for all 4 plans) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-04
