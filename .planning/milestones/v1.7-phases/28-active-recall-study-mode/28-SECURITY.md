---
phase: 28
slug: active-recall-study-mode
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-23
---

# Phase 28 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → API | Unchanged across both plans — no new routes, inputs, env vars, or schema changes; middleware auth gate untouched | none (no new surface) |
| DB legacy column → render | Legacy `Card.distractors` JSON was parsed client-side only by the deleted MC options builder | legacy JSON string column |
| card content → render | User-owned card text (`card.back`, sentence translations) rendered in the new hint/prompt/reveal surfaces | Korean/English card text |
| e2e harness → test DB | New mutate op writes to the isolated file: SQLite e2e DB only | test fixture data |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-28-01 | Tampering/DoS | `components/StudySession.tsx` (legacy distractors JSON reader) | low | mitigate | MC-only reader and the field were deleted from `StudySession`'s local `Card` interface; verified no `components/` file references `distractors`; `lib/audit-checks.ts:240` is the sole `JSON.parse` call on the column (ASVS V5) | closed |
| T-28-SC | Tampering | npm installs | low | accept | Zero new packages installed across phase 28 — `git log -- package.json` shows no phase-28 commits touching it | closed |
| T-28-02 | Information Disclosure / XSS | `FlashcardMode` hint + prompt + reveal rendering | low | mitigate | `card.back` and `chosenSentence.translation` render exclusively as React text nodes (auto-escaped); verified no `dangerouslySetInnerHTML`/`innerHTML` in `components/FlashcardMode.tsx` (ASVS V5) | closed |
| T-28-03 | Tampering | `e2e/helpers/mutate.ts` new op | low | mitigate | Op is registered only in the e2e tsx-subprocess harness against the isolated test DB; verified no import of `helpers/mutate` from `app/`, `components/`, or `lib/` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-28-SC | T-28-SC | Zero new npm packages installed during phase 28 (RESEARCH §Package Legitimacy Audit: none installed; no [ASSUMED]/[SUS]/[SLOP] entries) — no new supply-chain surface | gsd-secure-phase (grep-verified, ASVS L1) | 2026-07-23 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-23 | 4 | 4 | 0 | gsd-secure-phase (L1 grep verification, short-circuit — register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-23
