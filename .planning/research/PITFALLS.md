# Pitfalls Research

**Domain:** Auditing/modifying an existing LLM extraction pipeline over a live, identity-anchored SRS database (v1.5 Extraction Quality & Reliability)
**Researched:** 2026-07-06
**Confidence:** HIGH (grounded in direct reads of `lib/sync.ts`, `lib/extract-cards.ts`, `lib/card-key.ts`, `lib/filter-components.ts`, `lib/link-dependencies.ts`, `lib/study-cards.ts`, `scripts/relink-dependencies.mjs`, `app/api/cron/sync/route.ts`, `prisma/schema.prisma`, `.planning/codebase/CONCERNS.md`; web corroboration LOW confidence, used only for cross-checking general patterns)

Phase legend used throughout:
- **audit** — DB audit of ~511 existing cards
- **prompt-review** — reviewing/updating the `extract-cards.ts` prompt from audit findings
- **bug-fix-1** — logging the silent known-lemmas degradation in `lib/study-cards.ts`
- **bug-fix-2** — auto-relinking forward-reference `CardDependency` edges when the sync backlog drains

## Critical Pitfalls

### Pitfall 1: Delete-and-recreate "fixes" silently wipe FSRS state AND review history

**What goes wrong:**
An audit fix (or a "just re-extract this lesson cleanly" instinct) deletes a card and recreates it with corrected content. `Card.id` is the FK anchor for everything: `CardReview` (`onDelete: Cascade`), `ReviewLog` (`onDelete: Cascade` — the WR-04 schema comment explicitly documents that history dies with its card), `Sentence`, and `CardDependency` in **both directions** (`CardToPrereqs` and `PrereqToCards` both cascade). Deleting one card also silently deletes every edge where it was someone else's prerequisite. No error is raised anywhere — the learner just loses months of scheduling state and the `/history` page loses rows.

**Why it happens:**
Delete-and-recreate is the easiest way to apply a batch of content fixes, and `wipe-card-data.mjs` sits right there in `scripts/` as a tempting precedent. The cascades make it *feel* clean — nothing errors.

**How to avoid:**
- Hard rule for the entire milestone: **fixes mutate cards in place by `id`** (`prisma.card.update`), never delete+create. Mirror the `app/api/cards/[id]/route.ts` precedent: when changing `front`, recompute and set `normalizedFront` in the same update, and handle the P2002 collision (that collision means you found a true duplicate — see Pitfall 3 for the merge procedure).
- Any fix script follows the `retro-filter-cleanup.mts` template: **dry-run by default**, `--apply` to mutate, idempotent, developer-run locally.
- Before any `--apply` run against Turso, snapshot: `turso db shell korean-study ".dump"` (or at minimum export `Card`, `CardReview`, `ReviewLog`, `CardDependency`) so recovery is possible.

**Warning signs:**
Any plan step containing "recreate", "re-add", or `prisma.card.delete` outside an explicit user-initiated card deletion; `ReviewLog` or `CardDependency` row counts dropping after a fix run.

**Phase to address:** audit (fix-application step), enforced as a constraint in prompt-review too.

---

### Pitfall 2: Expecting the improved prompt to repair existing cards via re-sync — it structurally cannot

**What goes wrong:**
The team updates the prompt, runs a sync (or `local-resync.mts`), and expects existing card quality to improve. It won't, for two independent reasons in the current code:
1. `Lesson.contentHash @unique` + the hash-skip in `runSync` (and `local-resync.mts`, which is "idempotent — skips already-synced lessons by contentHash") means **already-synced lessons are never re-extracted at all**. The new prompt only applies to *future* lessons.
2. Even if a lesson were force-re-extracted (Lesson row deleted first), the sync UPDATE branch deliberately preserves most of the card: `lessonId` and `review` are never touched (good), but **sentences are refreshed only when the card currently has zero** (`existing.sentences.length === 0`), and `components` only when the new extraction returned a non-empty array (WR-02). `type` isn't even in `updateData`; only `back`, `notes`, `distractors` refresh. So a prompt change that produces better sentences or better categorization does not propagate to existing cards.

**Why it happens:**
The pipeline was designed for *incremental ingestion*, not *retroactive repair*. That design is correct (it's what protects FSRS state), but it means "fix the prompt" and "fix the 511 existing cards" are two entirely separate workstreams, and the milestone must treat them as such.

**How to avoid:**
- Set the expectation in the phase plan explicitly: **prompt changes are prospective**. Retroactive fixes to existing cards come from the audit's targeted fix scripts (in-place updates by `id`), not from re-syncing.
- If a lesson genuinely must be re-extracted (e.g., its extraction was badly truncated), the procedure is deliberate: delete only the `Lesson` row, re-sync, and accept that existing cards are only partially refreshed (and check how orphaned `lessonId` values interact with the lesson-range filter, which joins through the `lesson` relation). This should be rare, not the default repair mechanism.
- Do NOT "fix" the UPDATE branch to overwrite sentences/type wholesale as part of prompt-review — that turns every routine re-sync into a destructive overwrite of any manual `CardEditor` edits the user has made. If sentence refresh is ever wanted, gate it behind an explicit flag only scripts pass.

**Warning signs:**
A plan that says "re-run local-resync to apply the new prompt"; audit findings marked "will be fixed by prompt update" for cards that already exist.

**Phase to address:** prompt-review (scope definition), audit (owns retroactive fixes).

---

### Pitfall 3: Prompt phrasing drift creates near-duplicate cards that the `@unique` constraint cannot catch

**What goes wrong:**
`normalizeFront` is intentionally narrow: NFC + whitespace collapse + strip *one trailing English-ASCII paren group*. It does **not** strip the `~` prefix (rule 4: "Leave a leading ~ — it's meaningful"), does not unify `~(으)면` / `(으)면` / `~으면`, and keeps Hangul-containing parens. The DB constraint only blocks *exact* normalized collisions. The real near-dupe defense is the prompt itself — the "Existing cards already in the deck — DO NOT generate" list plus the instruction to "match by the core Hangul content, ignoring ~ prefix and English glosses". A prompt rewrite that changes front-formatting conventions (different gloss style, different pattern notation, dropping/reordering the existing-fronts list, or weakening the match-by-core-Hangul instruction) makes future extractions phrase *already-known concepts* differently → `findUnique` misses → a fresh card with fresh FSRS state is created alongside the old one. The learner now reviews the same grammar pattern twice, and history/graph edges split across two ids. Web corroboration (LOW): identity drift under prompt changes is the standard failure mode for LLM extraction over identity-keyed stores; the standard mitigation is exactly what this system does — feed existing keys as reuse hints + post-hoc dedup.

**Why it happens:**
The prompt's dedup-hint sections look like verbose fat to trim during a prompt review ("the DB constraint handles dedup anyway"). It doesn't — the constraint handles only exact-match; the prompt handles semantic-match.

**How to avoid:**
- Treat these prompt sections as **load-bearing API**: the existing-fronts list, the "match by core Hangul, ignore ~ prefix" rule, the one-card-per-base-form rule, and the front-formatting conventions. Changes to any of them require a dedup regression check.
- Add a **dry-run extraction diff** to prompt-review's verification: run the new prompt against 2–3 already-synced lessons' raw text (offline, no DB writes), `normalizeFront` every returned front, and diff against the deck. Every returned front should either exact-match an existing `normalizedFront` or match nothing under `find-duplicates.mjs`'s fuzzy key (strips `~` and all parens). Any fuzzy-hit-but-not-exact-hit is a near-dupe the new prompt would create.
- Run `scripts/find-duplicates.mjs` after the first few post-change syncs; make it part of the milestone's verification checklist.
- If the audit finds existing near-dupes: the merge procedure is (1) pick survivor (usually higher FSRS reps), (2) re-point loser's `ReviewLog` rows and `CardDependency` edges (both directions) to survivor, (3) merge sentences if survivor lacks them, (4) delete loser. Steps 2–3 must run **before** the delete or the cascades destroy what you meant to migrate. Script it; don't do it by hand per card.

**Warning signs:**
`newCards > 0` on a sync of a doc with no genuinely new vocabulary; `find-duplicates.mjs` groups growing after the prompt change; two cards whose fronts differ only by `~`, parens, or gloss text.

**Phase to address:** prompt-review (primary), audit (detects pre-existing near-dupes and owns the merge script).

---

### Pitfall 4: Prompt changes to `components[]` phrasing silently thin the knowledge graph via `filterComponents`

**What goes wrong:**
`filterComponents` (v1.4) keeps a component only if it resolves to a real deck card — direct `normalizeFront` match or particle-stem fallback. It cannot distinguish "hallucinated" from "real prerequisite phrased in a way that doesn't resolve." If prompt-review changes how the model phrases components (e.g., more abstract grammar notation, polite forms like 이에요 instead of 이다, or surface forms instead of base lemmas), a larger fraction of *legitimate* components stops resolving and gets silently dropped before persist. The graph doesn't error — it quietly loses edges, and foundation-first sequencing degrades with no signal. WR-02 makes the shrinkage asymmetric: a persisted non-empty-but-smaller `components` value replaces the fuller old one for good, while an empty result never overwrites — drift accumulates unevenly.

**Why it happens:**
The prompt's components section and the deterministic filter were tuned *together* in Phase 16. Reviewing the prompt in isolation treats the filter as a safety net when it's actually a coupled contract: the prompt must emit components in exactly the shape `normalizeFront`/`splitParticle` can resolve.

**How to avoid:**
- Any change to the components prompt section must be validated with a before/after metric on the same lesson texts: **count of components surviving `filterComponents` per card**, old prompt vs new. A drop means the new prompt emits unresolvable phrasings, not that hallucinations decreased.
- Keep the prompt's component examples (`먹다 not 먹어요; 은/는 for the topic particle`) aligned with what actually resolves — those examples are the model's format spec for the filter.
- The audit's "components accuracy" check should measure two distinct things separately: (a) stored components that don't resolve to deck cards (stale pre-filter rows — fixable by re-running `retro-filter-cleanup.mts`), and (b) cards with suspiciously few/zero components (possible over-filtering). Conflating them produces a misleading "accuracy" number.

**Warning signs:**
Average `components[]` length per newly-synced card drops sharply after the prompt change; new cards with `components: null` for obviously composite grammar patterns; `CardDependency` edge count per new lesson trending toward zero.

**Phase to address:** prompt-review (with audit providing the baseline metric).

---

### Pitfall 5: Auto-relink triggered on `remaining === 0` fires at the wrong times — and `remaining=0` doesn't mean "drained"

**What goes wrong:**
The obvious trigger — "run relink when the sync response says `remaining === 0`" — is wrong in three directions:
1. **False positive (fires when not drained):** `remaining = newLessonData.length - batch.length`. A batch lesson whose extraction *fails* is not persisted (no Lesson row), so with a 1-lesson backlog that fails: `remaining=0, failed=1` — the backlog is NOT drained (the lesson reappears as new next sync), but the naive trigger fires anyway. The real drain condition includes `failed === 0`.
2. **Fires constantly:** every no-new-content sync returns `remaining: 0` (`'No new content since last sync'`). The daily cron plus every pull-to-refresh would run a full-corpus relink — idempotent, but O(cards-with-components) lookups plus per-edge upserts against Turso from a Vercel function, i.e., hundreds of sequential WAN round-trips added to every sync.
3. **Timeout stacking:** the one sync that *actually* drains the backlog just spent 30–90 s in Opus extraction. On Hobby's hard 60 s cap, appending relink to that same request risks the function being killed mid-relink — the response never reaches the client, SyncPanel reports failure for a sync that succeeded (contentHash dedup protects the data, but the UX reads as breakage and the relink is half-done until the next trigger).

**Why it happens:**
`SyncResult.remaining` was designed as UI copy ("N more — sync again"), not as a lifecycle event. Overloading it as a completion signal imports its edge cases.

**How to avoid:**
- Trigger condition: `remaining === 0 && failed === 0 && newLessons > 0` — "this request persisted the last lesson of a backlog." Fires exactly once per drain, never on no-op syncs.
- Make the relink pass **cheap enough for budget leftovers**: one `findMany` for all cards with components (`id`, `normalizedFront`, `components`), one `findMany` for existing edges, resolve in memory via `resolveDependencyEdges` from `lib/link-dependencies.ts`, set-diff, and insert **only the missing edges** (usually a handful — forward references only). Never re-upsert all ~1500 edges per run.
- If even that is too tight after a 50+ s extraction, defer: set a `Setting` flag (`relinkPending`) when the drain condition hits and execute the relink at the *start* of the next sync request (the no-new-content fast path has the whole 60 s free). This also gives idempotent recovery from a killed relink for free.

**Warning signs:**
Sync latency increasing on no-op syncs; Vercel function duration near 60 s on the final backlog sync; `failures[]` non-empty in the same response that triggered a relink.

**Phase to address:** bug-fix-2.

---

### Pitfall 6: Automating relink by porting `relink-dependencies.mjs` re-embeds already-drifted logic

**What goes wrong:**
The manual script carries its own **copy** of `normalizeFront` ("Must mirror lib/card-key.ts") — and it has *already drifted*: the script's Hangul-detection regex is `[가-힣ᄀ-ᇿ]` (line 61) while `lib/card-key.ts` uses `[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]` (line 33, with compatibility Jamo ranges). Porting the script's logic into the sync path — instead of importing `lib/card-key.ts` + `lib/link-dependencies.ts` — ships that drift into production, where relink and sync compute *different* keys for the same component and disagree about which edges exist.

There is also a subtler, pre-existing asymmetry the automation will trip over: `filterComponents` **retains** a component via the `splitParticle` stem fallback (e.g., `학교에` retained because card `학교` exists), but `resolveDependencyEdges` resolves by **direct `normalizeFront` lookup only** — a stem-retained component is persisted in `components` yet creates **no edge**, on the sync path and on any relink built from the same resolver. Consequence: "relink ran and created 0 new edges" is NOT proof the graph is complete; and a relink that "helpfully" adds stem-fallback resolution would create edges the live sync path never creates — two code paths, two graphs.

**Why it happens:**
The script predates `lib/link-dependencies.ts` (its IN-02 header notes this exact resolve loop was independently reimplemented four times, which is how CR-02 slipped through one call site). Automation naturally starts from the thing being automated — the script — rather than the shared lib.

**How to avoid:**
- The auto-relink implementation imports `resolveDependencyEdges` and `normalizeFront` from `lib/` — zero ported logic from the `.mjs` script. Once automated, delete `relink-dependencies.mjs` or reduce it to a thin wrapper over the same lib code so the drifted copy can't be run again.
- Decide the stem-fallback asymmetry **explicitly** and document it: either (a) keep direct-lookup-only in both places and accept that stem-form components are metadata without edges, or (b) add stem-fallback to `resolveDependencyEdges` itself so sync and relink change together. Never fix it in only one call site.
- Auto-relink must be **add-only** (upsert on the `cardId_prerequisiteId` compound key, self-edge skip preserved). Pruning stale edges stays in the developer-run `retro-filter-cleanup.mts` — an automatic pruner running concurrently with a sync mid-upsert could delete edges for cards whose refreshed components haven't been written yet.

**Warning signs:**
Any `function normalizeFront` definition appearing in new relink code; relink and sync producing different edge counts for the same corpus; a diff that edits `scripts/relink-dependencies.mjs` instead of `lib/`.

**Phase to address:** bug-fix-2.

---

### Pitfall 7: Cron sync and manual sync overlapping — auto-relink widens an existing race

**What goes wrong:**
Nothing prevents the daily cron (`GET /api/cron/sync`) and a manual sync (pull-to-refresh / SyncPanel) from running concurrently — both call `runSync` with no lock. Today the blast radius is contained by constraints: `contentHash @unique` makes the second `lesson.create` throw (its compensating path leaves no orphan), and card upserts collide safely on `normalizedFront`. The known soft spot is `orderIndex`: both requests read the same `_max.orderIndex` after extraction and can assign duplicate order indices (no unique constraint), which wobbles lesson-range filtering. Adding auto-relink widens exposure: a relink reading `Card.components` while the other request is mid-upsert sees a half-written lesson — harmless for an **add-only, idempotent** relink (missing edges arrive on the next trigger), but genuinely unsafe if the relink prunes (Pitfall 6) or if a `relinkPending` flag is cleared by one request while the other's writes are in flight. Both requests can also independently satisfy the drain condition and double-fire. Web corroboration (LOW): standard serverless guidance is idempotency-first plus skip-if-running guards, since OS-level locks are unavailable.

**Why it happens:**
Single-tenant apps rarely think about concurrency; the Phase 19 cron made concurrent invocation a *scheduled certainty* (10:00 UTC daily) rather than an unlikely double-tap, and v1.5 is the first feature to hang additional work off sync completion.

**How to avoid:**
- Rely on idempotency, not locking: add-only relink + compound-key upsert means a double-fired or interleaved relink converges to the same edge set. Design for "runs twice concurrently" as the normal case.
- If using the `relinkPending` flag pattern: clear the flag *before* doing the relink work (a concurrent run at worst re-sets it and the work runs once more later) rather than after (a crash leaves it stuck, or a concurrent clear loses a needed run). With add-only idempotent work, one extra run is free; never running is the failure mode to avoid.
- Don't build a real mutex (Setting-row lock with TTL, etc.) — on Hobby, a function can be killed at 60 s without cleanup, and a leaked lock silently disables relinking forever. The no-lock failure mode (redundant idempotent work) is strictly better.
- Note in the plan (out of scope to fix): the `orderIndex` duplicate race predates this milestone; don't let bug-fix-2 take a dependency on `orderIndex` uniqueness.

**Warning signs:**
Duplicate `orderIndex` values in `Lesson` (a freebie check for the audit); relink logging two executions within the same minute.

**Phase to address:** bug-fix-2.

---

### Pitfall 8: Logging the known-lemmas failure without its cause, or in a way that changes the degradation contract

**What goes wrong:**
Three sub-failures hide in this one-line fix to `lib/study-cards.ts`:
1. **Logging the symptom, not the cause.** `console.warn('known-lemmas query failed')` without `knownRowsResult.reason` records that degradation happened but leaves the actual transient Turso error — the thing CONCERNS.md wants diagnosed — as unknowable as before.
2. **Breaking the DB-01 contract while "improving" it.** The graceful-degradation shape (`Promise.allSettled`; pool failure throws, known-lemmas failure → empty Set) is a validated requirement. A refactor that surfaces the failure by throwing, or converts to sequential awaits "so the error is catchable," trades a degraded-but-working study session for a 500 — and `app/study/page.tsx` is an RSC with **no error boundary** (CONCERNS: "RSC pages have no fetch error fallback"), so the user gets the framework error screen.
3. **Log without a consumer.** `getStudyCards` runs on every `/study` render and every `/api/cards/due` call; a sustained Turso degradation emits a warn per page view into Vercel's log stream, which nobody watches for this app. The fix ships, the box gets checked, and the degradation remains effectively invisible — silence has just been relocated. Also: libSQL error messages can embed the database URL/hostname; log `reason.message` / `String(reason)`, not the full serialized error object.

**How to avoid:**
- Minimal, contract-preserving shape: in the existing rejected branch, `console.error('[study-cards] known-lemmas query failed; degrading to empty set:', knownRowsResult.reason instanceof Error ? knownRowsResult.reason.message : String(knownRowsResult.reason))`. No control-flow change, no new throw paths.
- Prefix the message (`[study-cards]`) so Vercel log search can find it — that's the realistic "consumer" at this app's scale. If the milestone wants one step further, a counter in the `Setting` table is the app-native pattern, but it adds a write to a read path; weigh it, don't default to it.
- Add/extend a unit test asserting degradation still returns cards (with `unknownCount` computed against an empty set) when the second query rejects — locking the contract against risk (2).

**Warning signs:**
The diff touching more than a few lines of `study-cards.ts`; removal of `Promise.allSettled`; a log statement that stringifies the whole rejection object.

**Phase to address:** bug-fix-1.

---

### Pitfall 9: Heuristic audit checks that re-implement runtime logic — false positives at report-killing scale

**What goes wrong:**
At 511 cards, an audit rule with even a 10% false-positive rate emits ~50 bogus findings; mixed into real findings, the whole report gets skimmed and shelved — the audit phase produces a document instead of fixes. Two systematic FP sources in this codebase:
1. **Re-implementation drift** (the same disease as Pitfall 6): an audit checker that re-implements blank-safety, front-normalization, or particle-splitting instead of importing `sentenceMatch`, `normalizeFront`, and `splitParticle` will disagree with the runtime — flagging cards that actually work, or passing cards that don't. Precedent exists: the relink script's drifted regex; the TESTING.md doc that claimed zero coverage after tests existed.
2. **Judgment calls dressed as rules.** Korean-specific checks are heuristic by nature: `splitParticle` mis-splits are a *documented accepted ambiguity* (기다리는); vocabulary-vs-phrase categorization is genuinely fuzzy at the boundary; "sentence sounds unnatural" is not decidable deterministically. Running these as pass/fail rules floods the report. Conversely, an LLM-judge audit pass hallucinates its own findings and can't be re-verified cheaply.

**How to avoid:**
- **Every deterministic check imports the runtime helper it audits.** Blank-safety = `sentenceMatch(s.korean, s.targetForm)` + the 2-char/exactly-once rules exactly as `extract-cards.ts` applies them; components resolution = `filterComponents` + the deck set; dedup = `normalizeFront` + `find-duplicates.mjs`'s fuzzy key. An audit finding is then by construction a runtime-visible defect.
- **Tier the report.** Tier 1 = deterministic, mechanically verifiable, candidate for scripted fix: first sentence not blank-safe, targetForm not a verbatim substring, stored components that don't resolve, `distractors` count ≠ 3, empty `translation`, near-dupe fuzzy-key groups, cards with zero sentences. Tier 2 = heuristic, human-eyeball only: categorization, sentence naturalness, gloss quality — sample-review, cap the list, never auto-fix.
- **Calibrate before running corpus-wide:** run each rule on a hand-checked sample of ~20 cards; if precision isn't near-perfect, the rule is actually Tier 2. One hour that saves the report's credibility.
- Report *counts per rule* first, findings second — a rule flagging 200/511 cards is telling you about the rule, not the deck.
- Audit is **read-only**; fixes are a separate, dry-run-by-default script step (matches the milestone's "findings-first" framing and the `retro-filter-cleanup.mts` precedent). Never mutate while measuring.
- Each finding carries `card.id` + rule name + concrete evidence (the sentence text, the unresolvable component string) so any single finding is spot-checkable in seconds.

**Warning signs:**
Any audit-script function that reimplements matching/normalization; a rule flagging >20% of the deck; findings without card ids; a plan step that both detects and fixes in one pass.

**Phase to address:** audit.

---

### Pitfall 10: Prompt review breaking the truncation-salvage / validation parsing contract

**What goes wrong:**
`parseExtractionResponse` is load-bearing and battle-tested (WR-01 depth-aware salvage, GRAPH-02 structural validation, CR-01 same-batch sibling union). A prompt change that alters the output envelope — a wrapping object instead of a bare array, new per-card fields, markdown fences, or significantly longer outputs — interacts with all of it: the greedy `/\[[\s\S]*\]/` regex, the depth-1 top-level-card-boundary assumption, and `isValidExtractedCard`'s field checks. Longer outputs also raise truncation frequency at `max_tokens: 32000` (exhaustive Opus extraction already runs 30–90 s), meaning *more* salvage-path executions in production, not fewer. CONCERNS.md states the standing rule: "Any prompt-schema change must update the salvage tests in `tests/extract-cards.test.ts` in the same commit."

**How to avoid:**
- Keep the output contract frozen unless an audit finding requires changing it: bare JSON array, same field names. Prompt-review should change *instructions* (categorization guidance, sentence quality, components phrasing), not *shape*.
- If shape must change: update `parseExtractionResponse`, `isValidExtractedCard`, and the salvage tests in the same commit, including a truncated-fixture test for the new shape.
- Watch the output-length budget: if the new prompt asks for more per-card content, verify the longest existing lesson still completes under `max_tokens` and the 60 s window — otherwise every sync of a dense lesson silently loses trailing cards to salvage.

**Warning signs:**
`'Full JSON parse failed, attempting salvage'` warn frequency rising after deploy; card counts per lesson dropping for dense lessons; salvage tests untouched in a commit that edits the prompt.

**Phase to address:** prompt-review.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Fix cards by hand in Turso shell instead of a dry-run script | Fast for 1–2 cards | No record of changes; no idempotency; a typo'd `normalizedFront` breaks dedup silently | 1–2 cards max, with `find-duplicates.mjs` run after |
| Trigger relink on bare `remaining === 0` | Simplest condition | Full-corpus relink on every no-op sync (daily cron + every pull-to-refresh) | Never — require `failed === 0 && newLessons > 0` too |
| Keep `relink-dependencies.mjs` alongside the automated path | No deletion risk | Two divergent relink implementations; the drifted `normalizeFront` copy stays runnable | Only if reduced to a wrapper over `lib/link-dependencies.ts` |
| Unprefixed `console.warn` for the known-lemmas log | One line | Unfindable in Vercel's log stream; the fix is cosmetic | Never — a `[study-cards]` prefix costs nothing |
| Auto-fix Tier-2 (heuristic) audit findings | Bigger "fixed N cards" number | Wrong fixes on false positives mutate learner-visible content unreviewed | Never — Tier 2 is human-review only |
| Widen the sync UPDATE branch to refresh sentences/type so re-sync "applies" the new prompt | Retroactive fixes look free | Every re-sync overwrites manual CardEditor edits; destructive by default | Never in the request path; script-only behind an explicit flag |

## Integration Gotchas

Internal seams (this milestone touches no new external services):

| Seam | Common Mistake | Correct Approach |
|------|----------------|------------------|
| Prompt ↔ `normalizeFront` | Assuming DB `@unique` handles semantic dedup | The prompt's existing-fronts list + formatting conventions ARE the semantic dedup layer; the constraint catches only exact matches |
| Prompt ↔ `filterComponents` | Tuning components instructions without re-checking filter survival | Before/after metric: components surviving the filter per card on the same lesson text |
| `filterComponents` ↔ `resolveDependencyEdges` | Assuming everything the filter retains becomes an edge | Stem-fallback retention creates NO edge (direct-lookup resolver); decide the asymmetry explicitly, change both or neither |
| Relink ↔ `lib/` helpers | Porting `relink-dependencies.mjs` logic | Import `normalizeFront` + `resolveDependencyEdges`; the script's copy has already drifted (narrower Hangul regex) |
| Cron sync ↔ manual sync | Assuming serialized execution | Add-only + idempotent relink; treat concurrent double-fire as normal; no Setting-row mutex (leaked-lock risk on 60 s kills) |
| Audit checks ↔ runtime helpers | Re-implementing blank-safety/matching in the audit script | Import `sentenceMatch`, `normalizeFront`, `splitParticle`, `filterComponents` — the audit must see exactly what runtime sees |
| Fix scripts ↔ FSRS/ReviewLog | delete+create for content fixes | `update` by `id` only; recompute `normalizedFront` on front edits; scripted merge (re-point logs/edges before delete) for true dupes |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-corpus relink appended to the drain-completing sync request | Final backlog sync killed at 60 s; SyncPanel shows failure for a sync that succeeded | Diff-in-memory + insert-missing-only; or defer via `relinkPending` to the next (fast) sync | Immediately on Hobby when extraction took >45 s |
| Per-edge sequential upserts from Vercel → Turso | Relink adds seconds of WAN round-trips per run | Batch: 2 reads + set-diff + `createMany` of missing edges only | ~100+ edges over WAN latency |
| Audit script querying card-by-card | Slow, hammers Turso | One `findMany` with `include: { sentences, review }` — 511 cards fits trivially in memory | Never at this scale, but the per-row habit invites it |
| Prompt output growth past `max_tokens` / 60 s | Rising salvage warnings; dense lessons lose trailing cards | Check output length on the longest existing lesson before shipping the prompt | Dense lessons first |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging the full known-lemmas rejection object | libSQL errors can embed the database URL/hostname in Vercel logs | Log `reason.message` / `String(reason)` only |
| Audit fix scripts reading prod credentials but mutating by default | One accidental run mutates 511 live cards | Dry-run by default, `--apply` required — the `retro-filter-cleanup.mts` convention |
| Surfacing raw relink/audit errors in the sync JSON response | Internal schema/error leakage to the client (T-13-02 precedent) | Detail stays in `console.error`; client gets counts only |

## "Looks Done But Isn't" Checklist

- [ ] **Prompt updated:** Often missing the dry-run dedup diff — verify new-prompt extraction of 2–3 known lessons produces zero fuzzy-key near-dupes against the deck
- [ ] **Prompt updated:** Often missing salvage-test updates — verify `tests/extract-cards.test.ts` touched in the same commit if any output-shape change
- [ ] **Prompt updated:** Often missing the components-survival metric — verify filter-survival rate did not drop vs the old prompt
- [ ] **Auto-relink shipped:** Often missing the failed-lesson case — verify the trigger requires `failed === 0 && newLessons > 0`, not bare `remaining === 0`
- [ ] **Auto-relink shipped:** Often missing timeout headroom — verify the drain-completing request stays under 60 s with relink included (or relink is deferred)
- [ ] **Auto-relink shipped:** Often missing script retirement — verify `relink-dependencies.mjs` is deleted or delegates to `lib/link-dependencies.ts`
- [ ] **Known-lemmas logging:** Often missing the cause — verify the log includes `knownRowsResult.reason`, and a test locks the empty-Set degradation behavior
- [ ] **Audit report:** Often missing calibration — verify each Tier-1 rule was precision-checked on ~20 hand-verified cards before the corpus run
- [ ] **Audit fixes applied:** Often missing identity preservation — verify zero `Card.id` churn (`CardReview`/`ReviewLog` row counts unchanged; no deletes outside scripted dupe-merges)
- [ ] **Audit fixes applied:** Often missing `normalizedFront` recompute — verify every front edit also updated `normalizedFront` and handled the P2002 collision path

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cards deleted+recreated (FSRS/ReviewLog lost) | HIGH | Only recoverable from a pre-run Turso dump; otherwise state is gone — this is why the snapshot-before-`--apply` rule exists |
| Near-dupes created by prompt drift | MEDIUM | `find-duplicates.mjs` to enumerate; scripted merge (re-point ReviewLog + edges to survivor, then delete loser); tighten prompt hint sections |
| Graph thinned by over-filtering components | LOW–MEDIUM | Fix prompt phrasing, re-run `retro-filter-cleanup.mts`/relink — but `components` values already shrunk under WR-02 are only recoverable by re-extraction |
| Relink double-fired or killed mid-run | LOW | Add-only + compound-key upsert: just run again (or wait for next trigger) |
| Known-lemmas log spams during sustained outage | LOW | Prefixed message; at single-user scale, tolerate or add a per-request-once guard |
| Audit report flooded with FPs | LOW | Re-tier the offending rule, recalibrate on a sample, regenerate — provided the audit was read-only |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Delete-and-recreate wipes FSRS/history | audit | `CardReview`/`ReviewLog` row counts unchanged after fix runs; no `card.delete` in fix scripts |
| 2. Expecting re-sync to repair existing cards | prompt-review (scoping) | Plan explicitly separates prospective prompt changes from retroactive fix scripts |
| 3. Prompt drift → near-dupe cards | prompt-review | Dry-run extraction diff vs deck; `find-duplicates.mjs` clean after first post-change syncs |
| 4. Components over-filtered by phrasing change | prompt-review | Filter-survival metric non-decreasing on same-lesson before/after |
| 5. Wrong relink trigger / timeout stacking | bug-fix-2 | Trigger tested for failed-lesson and no-op-sync cases; drain request under 60 s |
| 6. Ported script drift; stem-fallback asymmetry | bug-fix-2 | Relink imports `lib/` helpers; asymmetry decision documented; script retired |
| 7. Cron/manual overlap | bug-fix-2 | Relink is add-only + idempotent; double-fire converges; no mutex introduced |
| 8. Logging without cause / contract break | bug-fix-1 | Log includes `reason`; degradation unit test green; `Promise.allSettled` shape intact |
| 9. Audit FP flood / re-implemented checks | audit | Checks import runtime helpers; per-rule precision calibrated on a 20-card sample; tiered report |
| 10. Parsing contract broken by prompt change | prompt-review | Salvage tests updated in same commit; salvage-warning rate flat post-deploy |

## Sources

- Direct source reads (HIGH confidence): `lib/sync.ts`, `lib/extract-cards.ts`, `lib/card-key.ts`, `lib/filter-components.ts`, `lib/link-dependencies.ts`, `lib/study-cards.ts`, `scripts/relink-dependencies.mjs`, `app/api/cron/sync/route.ts`, `prisma/schema.prisma`
- Project docs (HIGH confidence): `.planning/codebase/CONCERNS.md` (2026-07-06), `.planning/PROJECT.md`, `CLAUDE.md`
- Web corroboration (LOW confidence, general patterns only): [Zep — LLM extraction at scale, entity reuse hints + post-hoc dedup](https://blog.getzep.com/llm-rag-knowledge-graphs-faster-and-more-dynamic/), [Cronitor — preventing duplicate cron executions](https://cronitor.io/guides/how-to-prevent-duplicate-cron-executions), [CronBeacon — idempotency as the primary cron property](https://cronbeacon.dev/guides/cron-job-best-practices), [OneUptime — CronJob concurrency policies](https://oneuptime.com/blog/post/2026-02-09-cronjob-concurrency-policy-allow-forbid/view)
- Observed drift evidence: `scripts/relink-dependencies.mjs:61` Hangul regex `[가-힣ᄀ-ᇿ]` vs `lib/card-key.ts:33` `[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]`

---
*Pitfalls research for: v1.5 Extraction Quality & Reliability (Korean Study app)*
*Researched: 2026-07-06*
