import Anthropic from '@anthropic-ai/sdk'
import { sentenceMatch } from './sentence-match'

const anthropic = new Anthropic()

export interface ExtractedSentence {
  korean: string      // full sentence, no blank — targetForm appears verbatim
  targetForm: string  // exact surface form in the sentence (inflected for grammar)
  translation: string // English translation
}

export interface ExtractedCard {
  type: 'vocabulary' | 'grammar' | 'phrase'
  front: string
  back: string
  notes?: string
  distractors: string[]       // 3 plausible-but-wrong English meanings (multiple-choice)
  sentences: ExtractedSentence[] // 1–3 natural example sentences (see prompt rules)
}

export async function extractCardsFromNotes(
  notes: string,
  existingFronts: string[] = []
): Promise<ExtractedCard[]> {
  const existingList =
    existingFronts.length > 0
      ? existingFronts.map((f) => `- ${f}`).join('\n')
      : '(none yet)'

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    system:
      'You are a Korean language study assistant. You extract high-value study cards from Korean tutoring lesson notes and prepare each card with example sentences so every study mode (flashcard, multiple-choice, fill-in-the-blank) works perfectly.',
    messages: [
      {
        role: 'user',
        content: `Extract study cards from these Korean tutoring lesson notes.

## What to make a card for (be selective — quality over quantity)
- Genuinely new or important vocabulary.
- Grammar patterns (e.g. "~(으)면", "~고 싶다").
- Set or idiomatic phrases whose meaning isn't obvious from the words alone.
- Irregular conjugations or forms the tutor emphasized.

## What to SKIP (do not make cards for these)
- Greetings or words a beginner already knows (안녕하세요, 네, 감사합니다, etc.).
- Scheduling, administrative, or meta text ("next week", "homework", "see you Tuesday").
- English-only asides or the tutor's commentary.
- Romanization-only fragments with no Hangul.
- Anything already in the existing deck (listed below) — do not recreate it.

## Existing cards already in the deck (DO NOT duplicate these fronts)
${existingList}

## For EACH card, return an object with:
- "type": "vocabulary" | "grammar" | "phrase"
- "front": Korean (Hangul). NEVER include romanization (Latin-letter transliteration of the Korean sounds, e.g. "(kkujunhada)"). You MAY include a short ENGLISH clarifying gloss in parentheses where it genuinely helps, e.g. "~(으)로 (direction particle)" or "Action verb ~는 + noun (present modifier)". Grammar patterns may also use Hangul in parentheses, e.g. "~(으)면".
- "back": concise English translation/meaning.
- "notes": (optional) usage context, formality level, or conjugation info.
- "distractors": an array of EXACTLY 3 plausible-but-wrong English meanings, in the same category/register as "back" (so a multiple-choice question is challenging, not trivial). They must all be different from "back" and from each other.
- "sentences": an array of 1–3 natural Korean example sentences (see rules below).

## Sentence rules (IMPORTANT)
Each element of "sentences" must have:
- "korean": a full Korean sentence. RULE: search the lesson notes first — if they contain a sentence with this word/pattern, copy it EXACTLY as written (do not paraphrase, clean up, or replace it). Only compose a new sentence if no suitable example exists in the lesson notes. NO blanks — write the full sentence.
- "targetForm": the EXACT surface form as it appears in "korean" — e.g. for vocab: the inflected form used; for grammar: the actual conjugated form (가면, not ~(으)면). Must be a verbatim substring of "korean".
- "translation": a non-empty English translation of the full Korean sentence.

**BLANK-SAFETY GUARANTEE (CRITICAL):** A sentence is "blank-safe" when its targetForm (a) appears verbatim in korean, (b) is 2+ Korean characters (not a single syllable/particle like 이, 가, 를), and (c) appears EXACTLY ONCE in korean. The FIRST sentence for every card MUST be blank-safe — it is used for Recall flashcards and fill-in-the-blank mode. If the doc's sentences are not blank-safe for this word (e.g. the word is one character, or the sentence repeats it), compose one natural blank-safe sentence and list it FIRST; the authentic doc sentence(s) can follow. Failing this rule makes two of three study modes silently degrade.

For GRAMMAR cards: provide 2–3 sentences using DIFFERENT verbs or nouns with the same pattern (e.g. ~(으)면 → 가면 / 먹으면 / 보면) so the learner abstracts the rule. Each must have a different "targetForm". The first must be blank-safe.

For VOCABULARY and PHRASE cards: provide 1–3 sentences in varied natural contexts. The first must be blank-safe.

## Rules
- For grammar patterns, "front" is the abstract pattern (e.g. "~(으)면") and "back" is the English explanation (e.g. "if/when [condition]").
- For vocabulary, "front" is the Korean word, "back" is the English meaning.
- For phrases, "front" is the full Korean phrase, "back" is the English translation.
- If a word appears in multiple forms, create one card for the base form and note conjugations.
- Do not create duplicate cards within this response either.
- NEVER include romanization (Latin-letter transliteration) anywhere — not in "front", "back", "notes", or any field. Use Hangul for Korean and English for meanings only.

Return ONLY a JSON array. No markdown fences, no explanation.

Lesson notes:
${notes}`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  const text = content.text.trim()

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
      } catch { /* leave parsed empty */ }
    }
    if (parsed.length === 0) throw new Error('No JSON array found in response')
  } else {
    try {
      parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedCard>[]
    } catch {
      // Truncated mid-array; try to salvage
      const lastBrace = jsonMatch[0].lastIndexOf('},')
      if (lastBrace !== -1) {
        try {
          parsed = JSON.parse(jsonMatch[0].slice(0, lastBrace + 1) + ']') as Partial<ExtractedCard>[]
        } catch { /* leave empty */ }
      }
      if (parsed.length === 0) throw new Error('Failed to parse JSON response')
    }
  }

  // Defensively normalize so a malformed field from the model can't break sync.
  return parsed.map((c) => ({
    type: (c.type ?? 'vocabulary') as ExtractedCard['type'],
    front: c.front ?? '',
    back: c.back ?? '',
    notes: c.notes,
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
        korean: s.korean,
        targetForm: s.targetForm,
        translation: typeof s.translation === 'string' ? s.translation : '',
      })),
  }))
}
