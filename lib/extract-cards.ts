import Anthropic from '@anthropic-ai/sdk'
import { sentenceMatch } from './sentence-match'
import { normalizeFront } from './card-key'
import { filterComponents } from './filter-components'

export interface ExtractedSentence {
  korean:      string   // full sentence, no blank — targetForm appears verbatim
  targetForm:  string   // exact surface form in the sentence (inflected for grammar)
  translation: string   // English translation
}

export interface ExtractedCard {
  type:       'vocabulary' | 'grammar' | 'phrase'
  front:      string
  back:       string
  notes?:     string
  distractors: string[]         // 3 plausible-but-wrong English meanings (multiple-choice)
  sentences:   ExtractedSentence[] // 1–3 natural example sentences (see prompt rules)
  /**
   * Base-form lemmas this card is built from — the prerequisite items a learner
   * must already know to fully understand this card. Used to build CardDependency
   * edges in the sync route.
   * Examples: 먹다, 은/는, ~(으)면
   * Always Hangul; never includes the card's own headword.
   */
  components: string[]
}

export async function extractCardsFromNotes(
  notes: string,
  existingNormalizedFronts: string[] = [],
  emphasized: string[] = []
): Promise<ExtractedCard[]> {
  const anthropic = new Anthropic()

  const existingList =
    existingNormalizedFronts.length > 0
      ? existingNormalizedFronts.map((f) => `- ${f}`).join('\n')
      : '(none yet)'

  const emphasizedSection =
    emphasized.length > 0
      ? `
## Terms the tutor EMPHASIZED (bolded / underlined / highlighted in the source doc)
These terms were explicitly marked by the tutor as new and important. You MUST create a card
for each one, mapped to its base form (per the one-card-per-base-form rule below):
${emphasized.map((e) => `- ${e}`).join('\n')}
`
      : ''

  const message = await anthropic.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system:
      'You are a Korean language study assistant. You extract study cards from Korean tutoring lesson notes and prepare each card with example sentences so every study mode (flashcard, multiple-choice, fill-in-the-blank) works perfectly. You also identify prerequisite relationships between cards to enable foundation-first study sequencing.',
    messages: [
      {
        role: 'user',
        content: `Extract study cards from these Korean tutoring lesson notes.

## Core principle: EXHAUSTIVE extraction
Create a card for EVERY distinct Korean item taught in this lesson:
- All new vocabulary (one card per base/dictionary form — 가다, not 가요/갔다/가세요)
- All grammar patterns (e.g. ~(으)면, ~고 싶다, ~아/어야 하다)
- All set or idiomatic phrases whose meaning isn't fully transparent from the words alone
- Irregular conjugation forms or rules the tutor mentioned
- Grammatical particles, endings, or copulas — ONLY when the lesson explicitly teaches or explains
  them (e.g. "오늘은 은/는 to mark the topic"); otherwise no card, but list them in "components"
  for cards that use them

## One card per base form
- Vocabulary: use the dictionary/citation form (가다 not 가요; 먹다 not 먹어요)
- Grammar patterns: use the abstract pattern notation (e.g. ~(으)면, ~고)
- If a verb or adjective appears in many conjugated forms, one card for the base; note notable
  forms in "notes" field — do NOT emit separate cards per conjugation
${emphasizedSection}
## What to SKIP
- Greetings a beginner already knows (안녕하세요, 네, 감사합니다, 죄송합니다, etc.) — unless the
  lesson explicitly teaches them as NEW content
- Scheduling, admin, or meta text ("next week", "homework", "see you Tuesday")
- English-only asides or tutor commentary
- Romanization-only fragments with no Hangul

## Existing cards already in the deck — DO NOT generate cards for these
The list below shows normalized base-form fronts already in the database. Do NOT create a card
whose "front" (after stripping any English gloss in parentheses) matches anything here — even if
the exact formatting would differ (e.g. if "~(으)면" is listed, skip it even if you'd write it
as "(으)면" or "~으면"). Match by the core Hangul content, ignoring ~ prefix and English glosses.
${existingList}

## For EACH card, return an object with these fields:

- "type": "vocabulary" | "grammar" | "phrase"

- "front": Korean (Hangul). NEVER include romanization (Latin-letter transliteration such as
  "(kkujunhada)"). You MAY include a short ENGLISH clarifying gloss in parentheses where it
  genuinely helps disambiguation — e.g. "~(으)로 (direction particle)" or
  "Action verb ~는 + noun (present modifier)". Hangul-in-parens (e.g. "~(으)면") is fine.

- "back": concise English translation/meaning.

- "notes": (optional) usage context, formality level, conjugation tables, or examples. Plain text.

- "distractors": an array of EXACTLY 3 plausible-but-wrong English meanings in the same category
  and register as "back" — makes multiple-choice challenging. All different from "back" and each
  other.

- "sentences": 1–3 natural Korean example sentences (see SENTENCE RULES below).

- "components": JSON array of base-form Hangul lemmas that a learner must already know to
  understand this card. Use base/dictionary forms (먹다 not 먹어요; 은/는 for the topic particle).
  Only list it if this card actually depends on it as a prerequisite — never because it merely
  appears elsewhere in the lesson. A word or grammar pattern taught elsewhere in this same lesson
  is NOT automatically a component of every other card — list it here only when THIS card's own
  front or example sentences genuinely build on it as something the learner must already know.
  A component need not yet have its own card in the deck to qualify — that's fine, it still
  represents real prerequisite knowledge — but it MUST be something this specific card actually
  depends on, not just a topically-related or co-occurring item from the same lesson. Omit the
  card's own headword. Examples:
    • card 먹다 → components: ["밥", "을/를"] (vocabulary it's commonly paired with)
    • card ~(으)면 → components: ["가다", "이다"] (verbs used to illustrate it)
    • card 학교 → components: ["에", "가다"] (typical sentence components)
  This field drives "learn the building blocks first" study ordering.

## SENTENCE RULES (CRITICAL — load-bearing for fill-in-the-blank and Recall modes)

Each element of "sentences" must have:
- "korean": a FULL Korean sentence. RULE: search the lesson notes first — if they contain a
  sentence using this word/pattern, copy it EXACTLY as written. Only compose a new sentence if
  no suitable example exists in the lesson. No blanks — write the full sentence.
- "targetForm": the EXACT surface form as it appears in "korean". For vocab: the inflected form
  used in that sentence; for grammar: the actual conjugated form (가면, not ~(으)면). Must be a
  verbatim substring of "korean".
- "translation": non-empty English translation of the full sentence.

**BLANK-SAFETY GUARANTEE (CRITICAL):** A sentence is "blank-safe" when its targetForm:
  (a) appears verbatim in korean, (b) is 2+ Korean characters (not a single syllable/particle
  like 이, 가, 를, 에), and (c) appears EXACTLY ONCE in korean.
The FIRST sentence for every card MUST be blank-safe — it is used for Recall flashcards and
fill-in-the-blank mode. If the lesson's sentences are unsafe (e.g. the word is one char, or
appears twice), compose a blank-safe sentence and list it FIRST; authentic lesson sentences can
follow. Failing this rule silently disables two of three study modes.

For GRAMMAR cards: provide 2–3 sentences using DIFFERENT verbs or nouns with the same pattern
(e.g. ~(으)면 → 가면 / 먹으면 / 보면) so the learner abstracts the rule. Each must have a
different "targetForm". The first must be blank-safe.

For VOCABULARY and PHRASE cards: provide 1–3 sentences in varied natural contexts. First must
be blank-safe.

## General rules
- Card "front" is the abstract pattern for grammar (e.g. "~(으)면"), Korean word for vocab,
  full Korean phrase for phrases.
- Do not create duplicate cards within this response either.
- NEVER include romanization (Latin-letter transliteration) in ANY field — not in front, back,
  notes, or sentences. Hangul for Korean, English for meanings only.

Return ONLY a JSON array. No markdown fences, no explanation, no preamble.

Lesson notes:
${notes}`,
      },
    ],
  }).finalMessage()

  const content = message.content.find((b) => b.type === 'text')
  if (!content || content.type !== 'text') throw new Error('No text response from Claude')

  const text = content.text.trim()

  const deckSet = new Set(existingNormalizedFronts)
  return parseExtractionResponse(text, deckSet)
}

const VALID_CARD_TYPES = ['vocabulary', 'grammar', 'phrase'] as const

/**
 * Structural validation guard (GRAPH-02) — mirrors lib/gloss.ts's LLM-response
 * shape-check convention. Keeps a parsed card object only when it has a
 * non-empty `front`/`back` string and either no `type` (tolerated — defaults
 * to 'vocabulary' below) or a `type` that is one of the three valid values.
 * A present-but-invalid type (e.g. "noun") is rejected, never coerced.
 */
function isValidExtractedCard(c: unknown): c is Partial<ExtractedCard> {
  if (typeof c !== 'object' || c === null) return false
  const candidate = c as Partial<ExtractedCard>
  if (typeof candidate.front !== 'string' || candidate.front.trim().length === 0) return false
  if (typeof candidate.back !== 'string' || candidate.back.trim().length === 0) return false
  if (
    candidate.type !== undefined &&
    !(VALID_CARD_TYPES as readonly string[]).includes(candidate.type)
  ) {
    return false
  }
  return true
}

/**
 * Pure parser for Claude's raw extraction response text. Runs the tolerant
 * JSON salvage parser (unchanged from prior behavior — a dense/truncated
 * lesson still yields the cards that did complete) THEN per-card structural
 * validation (GRAPH-02: a malformed card object is dropped, never coerced
 * into an empty-string card) BEFORE the existing normalization step. No
 * Anthropic call inside — safe to unit test in isolation.
 *
 * `deckNormalizedFronts` (GRAPH-03) is the full set of every card's
 * normalizedFront already in the deck. After the existing self-dedup/
 * self-exclude step produces a card's components array, filterComponents()
 * drops any entry that does not resolve to a real deck card (direct
 * normalizeFront match or particle-stem fallback) — never by sentence-text
 * containment. Defaults to an empty Set so existing callers/tests that don't
 * pass a deck set simply get all components filtered out; the live caller
 * (extractCardsFromNotes) always passes the real deck set.
 */
export function parseExtractionResponse(
  text: string,
  deckNormalizedFronts: Set<string> = new Set()
): ExtractedCard[] {
  // Tolerant JSON parser: if the full parse fails (e.g. truncated output), trim back
  // to the last complete object before the array closes so a dense lesson still
  // yields the cards that did complete rather than losing them all.
  let parsed: Partial<ExtractedCard>[] = []
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    // Try to salvage a truncated array: find the last complete '}' and close the array
    const lastBrace = text.lastIndexOf('},')
    if (lastBrace !== -1) {
      try {
        const salvaged = text.slice(0, lastBrace + 1) + ']'
        const startBracket = salvaged.indexOf('[')
        if (startBracket !== -1) {
          parsed = JSON.parse(salvaged.slice(startBracket)) as Partial<ExtractedCard>[]
        }
      } catch (err) {
        console.warn('JSON salvage (no-bracket path) failed:', err)
      }
    }
    if (parsed.length === 0) throw new Error('No JSON array found in response')
  } else {
    try {
      parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedCard>[]
    } catch (parseErr) {
      // Truncated mid-array; try to salvage
      console.warn('Full JSON parse failed, attempting salvage:', parseErr)
      const lastBrace = jsonMatch[0].lastIndexOf('},')
      if (lastBrace !== -1) {
        try {
          parsed = JSON.parse(jsonMatch[0].slice(0, lastBrace + 1) + ']') as Partial<ExtractedCard>[]
        } catch (salvageErr) {
          console.warn('JSON salvage also failed:', salvageErr)
        }
      }
      if (parsed.length === 0) throw new Error('Failed to parse JSON response')
    }
  }

  // Structural validation (GRAPH-02): drop cards that are missing/empty
  // front/back or carry a present-but-invalid type, BEFORE normalization.
  const validCards = parsed.filter(isValidExtractedCard)

  // CR-01: same-lesson siblings aren't in the DB yet (existingNormalizedFronts
  // was fetched before this extraction call ran) but they ARE valid same-request
  // prerequisite targets — a single lesson's exhaustive extraction routinely
  // introduces several cards that legitimately reference each other. Union the
  // batch's own fronts into the resolution set before filtering each card's
  // components so a forward reference to a sibling card in this same response
  // survives instead of being stripped before it's ever persisted.
  const batchFronts = new Set(validCards.map((c) => normalizeFront(c.front ?? '')))
  const effectiveDeckSet = new Set([...deckNormalizedFronts, ...batchFronts])

  // Defensively normalize so a malformed field from the model can't break sync.
  return validCards.map((c) => {
    const front = c.front ?? ''
    const myKey = normalizeFront(front)

    // Clean components: array of non-empty strings, deduped, self-excluded.
    const rawComponents = Array.isArray(c.components) ? c.components : []
    const dedupedComponents = [...new Set(
      rawComponents
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
        .filter((x) => normalizeFront(x) !== myKey)
    )]
    // Deck-lookup filter (GRAPH-03): drop any component that doesn't resolve
    // to a real deck card (including same-batch siblings, CR-01). Order
    // matters — cheap self-dedup/self-exclude runs first, then this filter.
    const components = filterComponents(dedupedComponents, effectiveDeckSet)

    return {
      type:       (c.type ?? 'vocabulary') as ExtractedCard['type'],
      front,
      back:       c.back ?? '',
      notes:      c.notes,
      distractors: Array.isArray(c.distractors) ? c.distractors.slice(0, 3) : [],
      sentences: (Array.isArray(c.sentences) ? c.sentences : [])
        .filter((s): s is ExtractedSentence =>
          typeof s === 'object' && s !== null &&
          typeof s.korean === 'string' && s.korean.length > 0 &&
          typeof s.targetForm === 'string' && s.targetForm.length > 0 &&
          // Drop sentences where targetForm isn't verbatim in korean — they would
          // render as un-highlighted and produce a wrong fill-blank answer.
          sentenceMatch(s.korean, s.targetForm).found
        )
        .slice(0, 3)
        .map((s) => ({
          korean:      s.korean,
          targetForm:  s.targetForm,
          translation: typeof s.translation === 'string' ? s.translation : '',
        })),
      components,
    }
  })
}
