---
phase: 15
slug: studysession-refactor-sentence-selection-memoization
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-03
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → API (`/api/review`, `/api/review/undo`, `/api/activity`, `/api/settings`, `/api/tts`, `/api/gloss`) | Existing, unchanged — every call remains in `StudySession.tsx` (the parent) or in already-shipped leaf components (`AudioButton`, `GlossProvider`); this phase moves presentational JSX only and introduces no new fetch, endpoint, or request shape. | No change — same request/response shapes as before the refactor |
| `lib/sentence-selection.ts` (pure module) | No new attack surface: zero packages installed, no API route, no new user-input path, no new external-data ingestion. All data flowing through `selectSentence()` originates from already-trusted server-fetched `CardDTO`/`SentenceDTO` shapes the current code already renders. | Already-trusted server-fetched card/sentence data — no sensitivity change |
| user input → fill-blank comparison | `fillInput` and its `normalizeAnswer`-based `fillCorrect` comparison move verbatim from `StudySession` into `FillBlankMode`; `fillCorrect` is computed in the parent and passed down as a boolean prop. | Client-side string comparison only — no new validation surface |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-15-01 | Tampering / Information Disclosure | `lib/sentence-selection.ts`, `components/StudySession.tsx` | low | accept | No new attack surface (Plan 15-01 threat model): zero packages installed, no API route, no new user-input path, no new external-data ingestion. All data flowing through `selectSentence()` originates from already-trusted server-fetched `CardDTO`/`SentenceDTO` shapes the current code already renders. `hashStr` is a non-cryptographic FNV-1a used only for deterministic UI variety, not a security control — no change in that property. | closed |
| T-15-02 | Tampering / Information Disclosure | `components/FlashcardMode.tsx`, `components/MultipleChoiceMode.tsx`, `components/FillBlankMode.tsx`, `components/StudySession.tsx` | low | accept | No new attack surface (Plan 15-02 threat model): a pure structural decomposition — zero new packages, no new API route, no new user-input path, no new external-data ingestion. All data rendered by the mode components originates from already-trusted server-fetched `CardDTO`/`SentenceDTO` shapes the current code already renders, passed down as props. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-01 | Pure-module extraction with zero new packages/routes/inputs; only already-trusted server data flows through it; hashStr is a non-cryptographic UI-variety helper, not a security control | Plan 15-01 threat model | 2026-07-03 |
| AR-15-02 | T-15-02 | Pure structural component split with zero new packages/routes/inputs; mode components render only already-trusted props from the parent | Plan 15-02 threat model | 2026-07-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-03 | 2 | 2 | 0 | gsd-secure-phase (L1 grep, short-circuit: 0 open, plan-authored, ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-03
