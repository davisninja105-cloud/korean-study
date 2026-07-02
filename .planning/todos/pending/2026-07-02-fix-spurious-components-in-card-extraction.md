---
created: 2026-07-02T22:40:26.445Z
title: Fix spurious components in card extraction
area: general
files:
  - lib/extract-cards.ts:110-117
  - app/api/sync/route.ts:240-264
---

## Problem

Claude's card extraction (`lib/extract-cards.ts`) sometimes produces spurious `components` entries — prerequisite lemmas that the card's content doesn't actually use. Discovered during Phase 14 UAT while inspecting CardDependency edges.

**Concrete example:**
- Card front: `몸에 알이 배겼을 것 같아요` (phrase, back: "I think my muscles are probably sore")
- This sentence uses `~ㄹ 것 같다` ("I think/seems like"), NOT `~(으)ㄴ 후에` ("after doing")
- Yet Claude listed `~(으)ㄴ 후에` in the card's `components: ["몸", "알이 배기다", "~(으)ㄴ 후에"]`
- At sync time, `~(으)ㄴ 후에` resolved to a real grammar card → a CardDependency edge was created linking the phrase to an unrelated grammar pattern

The edge-creation code (`app/api/sync/route.ts:240-264`) is **correct** — it faithfully resolves whatever components Claude returns via `normalizeFront()` + `keyToId` lookup. The defect is in the extraction layer: Claude hallucinates prerequisite relationships that don't reflect the card's actual content.

**Impact:** Semantically wrong CardDependency edges pollute the knowledge graph. At study time, `sequenceCards()` (`lib/sequence.ts`) uses these edges for foundation-first ordering — spurious edges can surface unrelated grammar patterns as "prerequisites" before the card that actually uses them.

## Solution

TBD. Possible approaches:

1. **Prompt tightening** (`lib/extract-cards.ts:110-117`): constrain the `components` field to only include lemmas/patterns that actually appear in the card's `sentences[]` or `notes` — add an explicit instruction like "Only list a component if it appears verbatim (or in a recognizable conjugated form) in at least one of this card's example sentences."
2. **Post-extraction validation**: after Claude returns the card JSON, programmatically filter `components[]` against the card's `sentences[].korean` text — drop any component whose base form can't be found (even loosely) in the sentence text.
3. **Manual correction UI**: add a card-editor affordance to let the user remove spurious components and relink dependencies ( heavier, but catches issues Claude can't self-police).

Option 2 is likely the highest leverage — a deterministic filter catches the most egregious hallucinations without re-prompting.
