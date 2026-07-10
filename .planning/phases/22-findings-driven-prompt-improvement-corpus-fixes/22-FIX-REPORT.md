# Phase 22 Fix Report — FIX-01 / FIX-02

Applied against the live Turso production deck (`libsql://korean-study-jasond28.aws-us-west-2.turso.io`) via `scripts/fix-corpus-2026-07.mts --apply`, following user approval of the dry-run report ("Approved as-is" — all 9 front rewrites and all 3 철 sentences applied exactly as shown, no adjustments).

Before/after evidence: `.planning/audits/card-audit-2026-07-07.md` (Phase 21, pre-fix — unmodified) vs `.planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-POST-FIX-AUDIT.md` (this phase, post-fix, captured 2026-07-10).

## (a) Applied fixes — DB writes

All 9 rewrites and the 철 sentence creation were mutated **in place by id** in a single chunked `$transaction` — no `Card` row was deleted or recreated, so `CardReview` (FSRS state) and `ReviewLog` history for every affected card are untouched.

### Front rewrites (9) — D-06/D-07/D-08

| Card id | Old front | New front | Decision |
|---|---|---|---|
| `cmqln565802oc0gsat0vy110z` | 소 (작을 소, small) | 소 (작을 소) | D-06 |
| `cmqln56i902of0gsajqgbyk9a` | 고 (높을 고, high) | 고 (높을 고) | D-06 |
| `cmqln56tv02oi0gsa7lmwtm4p` | 식 (알 식, knowledge) | 식 (알 식) | D-06 |
| `cmqlngfdh036t0gsaguju6n2h` | 용 (~용, for use) | 용 (~용) | D-06 |
| `cmr42yyvi000gwhsa3uw44l4v` | 료 (~료, fee/fare) | 료 (~료) | D-06 |
| `cmqllei7z009i0gsanauns8au` | Action verb ~는 + noun (present modifier) | 동사 ~는 | D-07 |
| `cmqlleits009n0gsaym0ytmh0` | Action verb ~(으)ㄴ + noun (past modifier) | 동사 ~(으)ㄴ | D-07/D-08 |
| `cmqllejjt009s0gsavynqplsf` | Action verb ~(으)ㄹ + noun (future modifier) | 동사 ~(으)ㄹ | D-07 |
| `cmqllejxv009x0gsa14saekdl` | Descriptive verb ~(으)ㄴ + noun (modifier) | 형용사 ~(으)ㄴ | D-07/D-08 |

For every row, `front` and `normalizedFront` were recomputed and written together in the same `prisma.card.update()` call (CLAUDE.md hard rule). The write-time collision re-check (re-run at execution, not just at research time) found zero collisions across all 9 rewrites.

### 철 sentences (3 new rows) — D-04

Card `cmqlmqdoa02430gsax79l6oza` ("철 (iron / 鐵)") had zero sentences before this fix. Three `Sentence` rows were created (additive insert only — no `Card` row touched):

| orderIndex | korean | targetForm | translation |
|---|---|---|---|
| 0 | 철은 아주 단단한 금속이에요. | 철 | Iron is a very hard metal. |
| 1 | 이 다리는 철로 만들어졌어요. | 철 | This bridge is made of iron. |
| 2 | 지하철을 타고 회사에 가요. | 철 | I take the subway to work. |

Per D-04, natural Korean glues a particle directly onto 철 with no space (철은/철로/지하철), so 철 stays embedded (Hangul-adjacent) under the word-boundary blank-safety rule even after this fix — this card is **accepted as Exposure/multiple-choice-only**, not a bug. It is no longer zero-sentence (confirmed in the post-fix audit's "Zero-sentence cards: 0"), and correctly now appears under "Zero-safe cards" in the post-fix report as the sole, expected, accepted entry.

## (b) Resolved without DB writes

**Card 다** (`cmqlm1w0u014k0gsa6eydclfd`) — the audit's one zero-safe finding — required **zero database mutation**. Plan 22-01 changed `sentenceMatch()`'s single-char blank-safety predicate to distinguish isolated single-char targets (string-edge/whitespace/punctuation on both sides) from embedded ones (Hangul-adjacent). Card 다's two existing sentences ("지난 모든 시즌을 다 봤어요.", "밥을 다 먹었어요.") already have 다 isolated between spaces with no other occurrence — they became blank-safe **as-is** the moment the rule landed (D-03). Verified: card 다's id appears nowhere in `22-POST-FIX-AUDIT.md` (confirmed via `grep -Fq` in the post-fix audit).

**Prompt revision (PROMPT-01/PROMPT-02, plan 22-02)** ensures future extractions do not reintroduce the same error classes: the revised `extract-cards.ts` prompt drops English-labeled grammar fronts (D-07), disambiguates 동사/형용사 (D-08), uses Hangul-only Sino-Korean root glosses (D-06), and adds a loanword/acronym exception (D-09). Validated against real lessons 4/12/17 via `scripts/prompt-eval.mts`:

| metric | before (baseline) | after (revised prompt) | delta | verdict |
|---|---|---|---|---|
| frontRomanization | 4 | 0 | -4 | PASS (must strictly decrease) |
| sentenceRomanization | 0 | 3 | +3 | INFO* (report-only — D-09 accepted-loanword false positive) |
| zeroSafe | 0 | 0 | +0 | PASS |
| zeroSentence | 0 | 0 | +0 | PASS |

**Overall verdict: PASS** (source: `22-02-SUMMARY.md` § After-Run Diff Table). This is the PROMPT-02 evidence closing the loop between the corpus fix (this plan) and prompt quality going forward — future syncs extracting new lessons will not reintroduce D-06/D-07/D-08-class fronts, and the sentenceRomanization uptick is the expected, non-regressive D-09 loanword signal (an authentic CRT/DST-style borrowing faithfully reproduced in lesson 12), not a prompt defect.

## (c) Accepted residuals register

These findings are **deliberately not fixed** and are expected to keep appearing in every future audit pass. Documented here so no future audit re-investigates them.

| Finding | Card id(s) | Decision | Why accepted |
|---|---|---|---|
| CRT 렌즈 — romanization-flagged front | `cmqlmj2il01up0gsarwkragfi` | D-09 | CRT is a real, untranslated English acronym used in authentic Korean speech (like PC방), not romanization. No fix; will keep flagging. |
| CRT/DST — romanization-flagged sentences (3, across cards 시작되다/싫어하다/CRT 렌즈) | `cmqlmifek01p60gsa8beoh1vv`, `cmqlmifny01p90gsad93kzt4w`, `cmqlmj2il01up0gsarwkragfi` | D-09 | Same loanword/acronym exception, applied consistently to sentences as well as fronts. Sentences checked directly: "주말에 DST가 시작됐어요.", "사람들이 DST를 싫어해요."/"네, 엄청 싫어해요.", "저는 밤에 CRT 렌즈를 껴요." — all the same embedded-acronym pattern, not a defect. |
| 보다 vs ~보다 (더) — near-duplicate cluster | `cmqlkqxht004204l8wrmk6ybr`, `cmqllyt7101120gsa5s23lf3z` | D-10 (reviewed-not-duplicate) | Homonyms with genuinely different meaning/POS ("to see/watch" vs comparison particle "more than") that only collide because `superNormalize()` strips punctuation/parens before fuzzy-grouping. No DB action — near-duplicate *merging* is out of scope for this milestone. |
| 고 vs ~고 (and) — near-duplicate cluster | `cmqln56i902of0gsajqgbyk9a`, `cmqllemlx00aj0gsa8upznpxe` | D-10 (reviewed-not-duplicate) | Homonyms with genuinely different meaning/POS (Sino-Korean root "high/top" vs listing connector "and"). The 고 rewrite (D-06) changes the front string but not the `superNormalize()` fuzzy key, so the cluster persists by design — expected, not a regression. |
| 철 — zero-safe (single remaining zero-safe finding) | `cmqlmqdoa02430gsax79l6oza` | D-04 (accepted, see §a) | New sentences intentionally glue particles directly onto 철 (natural Korean usage); the card is Exposure/multiple-choice-only, never Recall/fill-blank. Not a defect — the alternative (forcing an artificial isolated-token sentence) would be unnatural Korean. |

### Post-audit arrivals (out of this phase's bounded fix scope)

Two cards **not present** in the Phase 21 pre-fix audit (`card-audit-2026-07-07.md`) appear as new romanization-flagged fronts in the post-fix audit — confirmed as genuinely new via `grep` against the Phase 21 report (zero hits):

| Card id | Front | Note |
|---|---|---|
| `cmrbwv4h1000504l9tbdf39w0` | 거 (informal 것, thing) | Arrived via Phase 19 cron auto-sync between the Phase 21 audit (2026-07-07) and this post-fix audit (2026-07-10). Also contributes to the near-duplicate landscape only incidentally (not clustered with any of the 9 rewrite ids). |
| `cmrbwv4we000904l99ya3oa8d` | 게 (것이 contraction) | Same drift window. Forms a new near-duplicate cluster with `~게 (adverbial -ly)` (`cmqlkr6c9006f04l86q2u6wg4`) — a third homonym pair, structurally identical to the D-10 pattern (fuzzy key "게"). |

These arrived through normal deck growth (new lesson content synced after the Phase 21 audit snapshot), not through this fix script's writes. They are explicitly **out of this phase's bounded scope** (FIX-01/FIX-02 targeted the 10 findings from the Phase 21 audit only) and are flagged here for a future audit/fix cycle to pick up, rather than being silently absorbed into this phase's fix count.

## Verification summary

- `--apply` run: 9 card fronts rewritten (front + normalizedFront together), 3 Sentence rows created for 철, zero aborts, zero Card delete/create operations.
- Post-fix audit (`22-POST-FIX-AUDIT.md`): 다's id absent everywhere; zero-sentence count = 0; all 9 REWRITES ids absent from flagged fronts; CRT id still flagged (accepted); 철's id present under zero-safe (accepted).
- `.planning/audits/card-audit-2026-07-07.md` (Phase 21 evidence) verified byte-identical to its committed state — untouched by this phase's audit re-run (different UTC date, no path collision).
- `npm test` and `npm run lint`: green (see commit).
