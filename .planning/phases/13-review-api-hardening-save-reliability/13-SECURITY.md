---
phase: 13
slug: review-api-hardening-save-reliability
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-02
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → API (`/api/review`, `/api/cards/[id]`) | Untrusted JSON body (`cardId`, `rating`, `front`, `sentences`) crosses here; requests are authenticated by the single shared-password HMAC cookie (middleware.ts) but body contents are attacker-controllable. | JSON body — low sensitivity (card content + rating), single-tenant |
| study client → `/api/review` (background save) | The optimistic client fires a background save across the network; the retry wrapper is self-initiated client traffic (authenticated via the shared-password cookie). No new untrusted-input surface — payload is the same `{ cardId, rating }` already validated server-side by Plan 01. | JSON body — same `{ cardId, rating }`, single-tenant |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-13-01 | Tampering | `POST /api/review` `rating` field | medium | mitigate | `Number.isInteger` + bounds (1–4) guard at `app/api/review/route.ts:16` returns 400 before `reviewCard()` (line 36) runs — rejects non-integers, out-of-range (0, 99, negative), and non-number types. | closed |
| T-13-02 | Information Disclosure | `POST /api/review` 500 path | low | mitigate | try/catch (`route.ts:30-47`) `console.error`s the raw error server-side and returns generic `{ error: 'Failed to record review' }` — internal Prisma/schema details never reach the client. | closed |
| T-13-03 | Information Disclosure | `PUT /api/cards/[id]` collision 400 message | low | accept | Friendly 400 confirms a front already exists (theoretically enabling front-enumeration), but this is a single-tenant app (one shared password, no multi-tenancy) — only the sole owner can enumerate their own cards. Message wording required by ROADMAP Success Criterion 3. | closed |
| T-13-04 | Denial of Service | `POST /api/review` unhandled throw | low | mitigate | try/catch (`route.ts:30-47`) prevents a DB hiccup from throwing an unhandled 500; failures return a controlled structured response. | closed |
| T-13-05 | Denial of Service | `postReviewWithRetry` retry loop | low | mitigate | Retries hard-bounded at 3 total attempts (`StudySession.tsx:116` `for (attempt < 3)`) with 500ms/1500ms backoff — a persistent failure cannot spin an unbounded request loop. | closed |
| T-13-06 | Tampering / state integrity | `handleUndo` restoration | low | mitigate | `if (!isMountedRef.current) return` at `StudySession.tsx:596` guards the entire restoration block (including `seenCardIdsRef.current` write at line 600) so an interrupted undo cannot leave inconsistent client session state. | closed |
| T-13-07 | Information Disclosure | save-failure toast copy | low | accept | Toast shows generic `'Couldn't save your last review — check your connection.'` only; it does not surface server error details or card contents. | closed |
| T-13-SC | Tampering | dependency installs | n/a | accept | No package-manager installs in this phase — P2002 error class ships with the already-generated Prisma client; the hand-rolled Toast uses existing React + Tailwind tokens. No supply-chain surface added. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-13-01 | T-13-03 | Front-enumeration via collision 400 message is single-tenant-only (sole owner enumerating their own cards); message wording required by ROADMAP Success Criterion 3. | gsd-security-auditor (plan-time, confirmed L1) | 2026-07-02 |
| AR-13-02 | T-13-07 | Toast copy is a generic connection message; no server error details or card contents surfaced. | gsd-security-auditor (plan-time, confirmed L1) | 2026-07-02 |
| AR-13-03 | T-13-SC | No package-manager installs in the phase; no supply-chain surface added. | gsd-security-auditor (plan-time, confirmed L1) | 2026-07-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-02 | 8 | 8 | 0 | gsd-security-auditor (short-circuited — L1 grep-depth, asvs_level=1, register authored at plan time) |

### Audit Notes

- **Register origin:** Authored at plan time — both `13-01-PLAN.md` and `13-02-PLAN.md` contained parseable `<threat_model>` blocks. No retroactive-STRIDE construction needed.
- **SUMMARY threat flags:** Both SUMMARYs reported `None` — no new network endpoints, auth paths, file access patterns, or trust-boundary schema changes beyond the plan-time register.
- **Short-circuit applied:** `threats_open: 0 AND register_authored_at_plan_time: true AND asvs_level == 1` → L1 grep-depth verification sufficient; auditor spawn skipped per workflow Step 3 short-circuit rule.
- **L1 verification evidence (grep-depth):**
  - T-13-01: `Number.isInteger` + bounds guard at `route.ts:16` precedes `reviewCard(` at `route.ts:36` ✓
  - T-13-02/T-13-04: `try {` at `route.ts:30`, `catch` at `route.ts:44`, `console.error` at `:45`, generic `'Failed to record review'` at `:47` ✓
  - T-13-03: `P2002` check at `cards/[id]/route.ts:60`, `'This front already exists'` at `:62`, `status: 400` at `:63` ✓
  - T-13-05: `for (let attempt = 0; attempt < 3; attempt++)` at `StudySession.tsx:116`, `backoffMs = [500, 1500]` at `:115` ✓
  - T-13-06: `if (!isMountedRef.current) return` at `StudySession.tsx:596` precedes `seenCardIdsRef.current =` at `:600` ✓
  - T-13-07: `'Couldn't save your last review — check your connection.'` at `StudySession.tsx:532` ✓
  - T-13-SC: no `package.json`/lockfile commits in phase 13 git log ✓
- **Related findings (non-blocking, out-of-register):** Code review `13-REVIEW.md` recorded 5 warnings (WR-01 `req.json()` outside try, WR-02 PUT 500 leaks `e.message`, WR-03 card+sentences non-atomic, WR-04 no fetch timeout/retries-4xx, WR-05 `cardId` not string-validated). None rise to a threat-register violation; they are robustness gaps beyond the REVIEW-01..05 contract, recorded for a future hardening pass.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-02
