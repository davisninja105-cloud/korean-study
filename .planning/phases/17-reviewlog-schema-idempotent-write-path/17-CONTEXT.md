# Phase 17: ReviewLog Schema & Idempotent Write Path - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Every FSRS review is durably and idempotently recorded as an append-only audit trail (`ReviewLog`), so the history Phase 18 will display is trustworthy even under network retries and undo. This phase is schema + write-path only — no UI, no history page (that's Phase 18).

In scope: `ReviewLog` Prisma model + Turso DDL, a client-generated idempotency key threaded from `postReviewWithRetry` through `POST /api/review`, the `CardReview.update` + `ReviewLog.create` transaction, and cancelling in-flight background retries on undo.

Out of scope: the history view/page (Phase 18), card retirement/mastery flags (deferred milestone-wide), analytics/dashboards on review data.

</domain>

<decisions>
## Implementation Decisions

### ReviewLog detail level
- **D-01:** Each `ReviewLog` row stores the **full FSRS snapshot**, mirroring `CardReview`'s fields exactly: `state`, `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `reps`, `lapses`, `nextReview`, `lastReview` — plus `cardId`, `rating`, `createdAt`, and the idempotency key. User explicitly chose this over a leaner row (rating + cardId + nextReview only) because it costs a few extra columns now but means Phase 18 (or any future "why was this card hard" view) never needs a migration to backfill historical values it didn't originally capture.
- **D-02:** These are the *resulting* (post-update) values — i.e., the same object shape written to `CardReview` by `reviewCard()` in that same review. No separate "before" snapshot; the `Out of Scope` list explicitly excludes an analytics/diff dashboard, so before/after comparison isn't needed.

### Claude's Discretion
The user selected only "ReviewLog detail level" to discuss; everything else in this phase is either locked by the ROADMAP.md Approach note or left to Claude's judgment:
- **Duplicate-retry response:** When a retried request hits the idempotency unique-constraint (already applied), follow the existing P2002-catch idiom already used in `app/api/cards/[id]/route.ts` (Prisma unique-violation → friendly response, not a 500) — treat it as an idempotent success and return the current `CardReview` state, not an error. `postReviewWithRetry` already treats any `res.ok` as success, so this requires the route to return 200 (not 409/500) on a detected duplicate.
- **Transaction pattern:** Use `prisma.$transaction([...])` array form (not the callback form) — this is the only form already proven safe with the libSQL adapter in this codebase (`app/api/cards/[id]/route.ts`).
- **Idempotency key generation:** Client generates the key once per grade action (in `submitReview`'s event-handler flow, not render — purity-safe) and reuses the same key across all retry attempts of that action in `postReviewWithRetry`.
- **Retry cancellation scope:** Cancel only the in-flight retry chain for the specific `cardId` being undone (matches `undoRef`'s single-slot design — only one review is ever undoable at a time), not a blanket cancel-everything.
- **Cancellation UX:** Stays silent, matching the existing `postReviewWithRetry` pattern where the toast (`saveError`) only ever surfaces on retry *exhaustion* (failure), never on a routine cancel.
- **ReviewLog retention:** No pruning/cap — small personal single-tenant app; append-only forever is fine at this scale.
- **`ReviewLog.id`:** `cuid()` default, matching every other model in the schema (`Card`, `CardReview`, `CardDependency`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` (Phase 17 section, "ReviewLog Schema & Idempotent Write Path") — Approach note locks: model shape with `@@index([cardId])` / `@@index([createdAt])`, idempotency key threaded through `postReviewWithRetry` → `POST /api/review`, `CardReview.update` + `ReviewLog.create` inside one `prisma.$transaction([...])` (array form), and the three numbered Success Criteria
- `.planning/REQUIREMENTS.md` HIST-01, HIST-02, HIST-03 — exact requirement wording for this phase; HIST-04–07 (Phase 18) for downstream awareness of what fields the history view will eventually need
- `.planning/PROJECT.md` "Current Milestone: v1.4" section — milestone goal and deferred-scope framing

### Schema-change workflow (Turso gotcha)
- `CLAUDE.md` § "Schema changes (IMPORTANT — Turso gotcha)" — `prisma db push`/`migrate` do NOT work against `libsql://`; the process is: edit `prisma/schema.prisma` → `npx prisma generate` → `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` → run only the new DDL against Turso via `@libsql/client` `executeMultiple()`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/review/route.ts` — current `POST /api/review` handler: validates `cardId`/`rating` (including the `isGrade` type guard), looks up `CardReview`, calls `reviewCard()`, updates. This is the write path that needs the transaction + idempotency key added; existing validation/error-shape conventions (400 for bad input, generic 500, no schema leak) must be preserved.
- `app/api/review/undo/route.ts` — current undo handler: reverts `CardReview` fields to `prevState` sent by the client. Per HIST-06 (Phase 18, but binding on how this phase's data behaves), `ReviewLog` is never touched by undo — no mutation, no new row.
- `components/StudySession.tsx` — `postReviewWithRetry()` (lines ~106-140): 3-attempt bounded retry with backoff (500ms/1500ms), 8s `AbortController` timeout per attempt, 4xx = permanent failure (no retry), silent until exhaustion. This is the function that needs (a) idempotency-key generation/threading and (b) a cancellation hook callable from `handleUndo`. `submitReview()` (lines ~441-559) is where the key should be generated (event-handler flow, not render). `handleUndo()` (line ~566) is where cancellation must be triggered.
- `app/api/cards/[id]/route.ts` (lines ~78-96) — existing precedent for both `prisma.$transaction([...])` array-form usage (only such usage in the codebase today) and the P2002 unique-constraint catch idiom to model the duplicate-retry response on.
- `prisma/schema.prisma` `model CardReview` (line 70) — exact field set/types to mirror in `ReviewLog` (`state Int`, `stability Float`, `difficulty Float`, `elapsedDays Int`, `scheduledDays Int`, `reps Int`, `lapses Int`, `nextReview DateTime`, `lastReview DateTime?`).

### Established Patterns
- Every model uses `id String @id @default(cuid())` — no exceptions.
- Non-critical failures degrade gracefully (known-lemmas fetch → empty Set); critical failures throw/500. A `ReviewLog` write failing should likely be treated as critical (it's inside the same transaction as the `CardReview` update — if the transaction fails, both roll back together, which is exactly the atomicity idempotency needs).
- Background saves are always fire-and-forget with `.catch(() => {})` or an `onExhausted` callback — never awaited from the UI thread.

### Integration Points
- `POST /api/review` request body gains a new field (idempotency key) — client and server both need updating together.
- `prisma/schema.prisma` gains a new `model ReviewLog` — requires the manual Turso DDL workflow (not `prisma db push`).
- No new UI integration points — this phase has no client-visible surface beyond "reviews still save/undo correctly."

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX examples — this is a backend-only phase. The one concrete decision from discussion: ReviewLog rows are full FSRS snapshots (see D-01), not a lean subset.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The one todo that matched Phase 17 in the automated scan, `2026-07-02-fix-spurious-components-in-card-extraction.md`, is tagged `resolves_phase: 16` and was already addressed there — not relevant here, not folded.)

### Reviewed Todos (not folded)
- "Fix spurious components in card extraction" (`.planning/todos/pending/2026-07-02-fix-spurious-components-in-card-extraction.md`) — matched Phase 17 by keyword overlap only; its own frontmatter says `resolves_phase: 16`, and Phase 16 (Components[] Filter Fix) already shipped addressing it. Not folded here.

</deferred>

---

*Phase: 17-ReviewLog Schema & Idempotent Write Path*
*Context gathered: 2026-07-04*
