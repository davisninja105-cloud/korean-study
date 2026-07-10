# Card Database Quality Audit — 2026-07-10

Read-only audit produced by `npx tsx scripts/audit-cards.mts` against the live Turso deck. Every finding carries the card id so Phase 22 can fix cards in place by id (never delete+recreate — cascades wipe FSRS state + ReviewLog history).

## Summary

| Check class | Findings |
| --- | --- |
| Total cards scanned | 1056 |
| Blank-safety — zero-safe cards | 1 |
| Blank-safety — unsafe-first cards | 0 |
| Blank-safety — sentences with targetForm not found | 0 |
| Zero-sentence cards | 0 |
| Romanization — flagged fronts | 3 |
| Romanization — flagged sentences | 3 |
| Distractor anomalies | 0 |
| normalizedFront inconsistencies | 0 |
| Untrimmed fronts | 0 |
| Near-duplicate clusters | 3 |
| Stale components — cards affected | 0 |
| Stale components — total stale entries | 0 |
| Stale components — malformed JSON rows | 0 |

## Blank-safety violations

Three labelled sub-lists — Phase 22 fix strategy differs per sub-class (reorder vs regenerate vs retire).

### Zero-safe cards (no sentence is blank-safe — regenerate)

- [vocabulary] front: "철 (iron / 鐵)" — back: "iron; the Sino-Korean root '鐵' meaning iron/rail in train words" — id: cmqlmqdoa02430gsax79l6oza

### Unsafe-first cards (sentences[0] unsafe but a later one is safe — reorder orderIndex in place)

None found.

### Sentences with targetForm not found (renders un-highlighted — fix or drop the sentence)

None found.

## Zero-sentence cards

Flagged with hasLegacyCloze so Phase 22 can use legacy cloze data as a possible fix source.

None found.

## Romanization leakage

### Flagged fronts (Latin survives after normalizeFront strips the trailing gloss)

- [vocabulary] front: "CRT 렌즈" — back: "CRT (orthokeratology) lenses" — id: cmqlmj2il01up0gsarwkragfi
- [vocabulary] front: "거 (informal 것, thing)" — back: "thing / one (casual, spoken form of 것)" — id: cmrbwv4h1000504l9tbdf39w0
- [grammar] front: "게 (것이 contraction)" — back: "contraction of 것이 (the thing + subject marker)" — id: cmrbwv4we000904l99ya3oa8d

### Flagged sentences (Latin in sentence korean — no gloss allowance there)

- [vocabulary] front: "시작되다" — id: cmqlmifek01p60gsa8beoh1vv — flagged sentence orderIndex values: 0
- [vocabulary] front: "싫어하다" — id: cmqlmifny01p90gsad93kzt4w — flagged sentence orderIndex values: 0
- [vocabulary] front: "CRT 렌즈" — id: cmqlmj2il01up0gsarwkragfi — flagged sentence orderIndex values: 0

## Distractor anomalies

None found.

## normalizedFront inconsistencies

### Stored vs recomputed value

None found.

### Untrimmed fronts

None found.

## Near-duplicate clusters

Grouped by superNormalize(normalizedFront); clusters of 2+ members, sorted by member count descending.

### Fuzzy key: "보다" (2 cards)

- [vocabulary] front: "보다" — back: "to see / watch" — id: cmqlkqxht004204l8wrmk6ybr
- [grammar] front: "~보다 (더) (comparison: more than)" — back: "more than; compared to" — id: cmqllyt7101120gsa5s23lf3z

### Fuzzy key: "게" (2 cards)

- [grammar] front: "~게 (adverbial -ly)" — back: "turns an adjective into an adverb (-ly)" — id: cmqlkr6c9006f04l86q2u6wg4
- [grammar] front: "게 (것이 contraction)" — back: "contraction of 것이 (the thing + subject marker)" — id: cmrbwv4we000904l99ya3oa8d

### Fuzzy key: "고" (2 cards)

- [grammar] front: "~고 (and / listing connector)" — back: "and (connects clauses or lists separate facts)" — id: cmqllemlx00aj0gsa8upznpxe
- [vocabulary] front: "고 (높을 고)" — back: "Sino-Korean root meaning 'high / top'" — id: cmqln56i902of0gsajqgbyk9a


## Stale components (summary)

Counts only — run `npx tsx scripts/retro-filter-cleanup.mts` (dry-run default) for the per-card before/after view.

- Cards affected: 0
- Total stale entries: 0
- Malformed JSON rows: 0
