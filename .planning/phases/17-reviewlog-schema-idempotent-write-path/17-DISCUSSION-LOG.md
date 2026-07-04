# Phase 17: ReviewLog Schema & Idempotent Write Path - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 17-ReviewLog Schema & Idempotent Write Path
**Areas discussed:** ReviewLog detail level

---

## Gray areas offered

| Area | Description | Selected for discussion |
|------|-------------|--------------------------|
| ReviewLog detail level | Full FSRS snapshot per row vs. a leaner row (rating + resulting nextReview only) | ✓ |
| Duplicate-retry response | What `POST /api/review` returns when a retried request hits the idempotency unique-constraint | |
| None of these — you decide | Skip discussion entirely | |

**User's choice:** "ReviewLog detail level" (declined to discuss duplicate-retry response — left to Claude's discretion).

---

## ReviewLog detail level

| Option | Description | Selected |
|--------|-------------|----------|
| Full FSRS snapshot (recommended) | Mirror CardReview exactly: state, stability, difficulty, elapsedDays, scheduledDays, reps, lapses, nextReview, lastReview — plus rating, cardId, createdAt, idempotencyKey. Costs a few extra columns but supports any future history/analytics view without backfill. | ✓ |
| Lean row | Just rating, cardId, createdAt, idempotencyKey, and resulting nextReview — enough for Phase 18's mastery-language display. Smaller table but can't backfill stability/difficulty trends later. | |

**User's choice:** Full FSRS snapshot.
**Notes:** No additional follow-up questions — user confirmed "I'm ready for context" after this single decision.

---

## Claude's Discretion

The user declined to discuss anything beyond ReviewLog detail level. The following were left to Claude's judgment (captured in CONTEXT.md `<decisions>` → "Claude's Discretion"):
- Duplicate-retry response shape (idempotent-success via existing P2002-catch idiom, not an error)
- Transaction form (`prisma.$transaction([...])` array form, matching existing precedent in `app/api/cards/[id]/route.ts`)
- Idempotency key generation point (client, in `submitReview`'s event-handler flow)
- Retry-cancellation scope (per-cardId, not global)
- Cancellation UX (silent, matching existing retry-failure toast pattern)
- ReviewLog retention (no pruning/cap)
- `ReviewLog.id` strategy (`cuid()`, matching every other model)

## Deferred Ideas

None raised during discussion. One automated todo-match (`2026-07-02-fix-spurious-components-in-card-extraction.md`) was reviewed and found to be already resolved by Phase 16 (`resolves_phase: 16` in its own frontmatter) — not folded into this phase.
