/**
 * Re-runs card extraction for a single lesson that has 0 cards.
 * Usage: node scripts/reextract-lesson.mjs <orderIndex>
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const targetOrderIndex = parseInt(process.argv[2] ?? '22', 10)

// Load env
const envVars = {}
for (const f of ['.env', '.env.local']) {
  try {
    for (const line of readFileSync(resolve(__dir, '..', f), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
      if (m) envVars[m[1]] = m[2]
    }
  } catch {}
}

const dbUrl   = process.env.DATABASE_URL        ?? envVars.DATABASE_URL
const dbToken = process.env.DATABASE_AUTH_TOKEN ?? envVars.DATABASE_AUTH_TOKEN
const apiKey  = process.env.ANTHROPIC_API_KEY   ?? envVars.ANTHROPIC_API_KEY

if (!dbUrl)  { console.error('DATABASE_URL not set'); process.exit(1) }
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1) }

const db = createClient({ url: dbUrl, authToken: dbToken ?? undefined })
const anthropic = new Anthropic({ apiKey })

// sentenceMatch (replicated from lib/sentence-match.ts)
function sentenceMatch(korean, targetForm) {
  if (!targetForm || !korean) return { found: false, index: -1, safeToBlank: false }
  const firstIndex = korean.indexOf(targetForm)
  if (firstIndex === -1) return { found: false, index: -1, safeToBlank: false }
  if (targetForm.length <= 1) return { found: true, index: firstIndex, safeToBlank: false }
  const secondIndex = korean.indexOf(targetForm, firstIndex + 1)
  if (secondIndex !== -1) return { found: true, index: firstIndex, safeToBlank: false }
  return { found: true, index: firstIndex, safeToBlank: true }
}

// 1. Load lesson
const { rows: lessonRows } = await db.execute({
  sql: `SELECT id, rawContent FROM "Lesson" WHERE "orderIndex" = ?`,
  args: [targetOrderIndex],
})
if (!lessonRows.length) {
  console.error(`No lesson found with orderIndex=${targetOrderIndex}`)
  process.exit(1)
}
const lessonId   = String(lessonRows[0][0] ?? lessonRows[0].id)
const rawContent = String(lessonRows[0][1] ?? lessonRows[0].rawContent)
console.log(`Lesson ${targetOrderIndex} (id: ${lessonId.slice(0, 8)}...): ${rawContent.length} chars`)

// 2. Verify it truly has 0 cards
const { rows: cardCheck } = await db.execute({
  sql: `SELECT COUNT(*) FROM "Card" WHERE "lessonId" = ?`,
  args: [lessonId],
})
const cardCount = Number(cardCheck[0][0] ?? cardCheck[0]['COUNT(*)'])
if (cardCount > 0) {
  console.log(`Lesson already has ${cardCount} cards — nothing to do.`)
  process.exit(0)
}

// 3. Load existing fronts for dedup
const { rows: frontRows } = await db.execute(`SELECT front FROM "Card"`)
const existingFronts = frontRows.map(r => String(r[0] ?? r.front))
console.log(`Existing card fronts: ${existingFronts.length}`)

const existingList = existingFronts.length > 0
  ? existingFronts.map(f => `- ${f}`).join('\n')
  : '(none yet)'

// 4. Call Claude
console.log('Calling Claude for card extraction...')
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 16384,
  system: 'You are a Korean language study assistant. You extract high-value study cards from Korean tutoring lesson notes and prepare each card with example sentences so every study mode (flashcard, multiple-choice, fill-in-the-blank) works perfectly.',
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
${rawContent}`,
    },
  ],
})

const content = message.content[0]
if (content.type !== 'text') throw new Error('Unexpected response type from Claude')
const text = content.text.trim()

// 5. Parse response (same tolerant logic as extract-cards.ts)
let parsed = []
const jsonMatch = text.match(/\[[\s\S]*\]/)
if (!jsonMatch) {
  const lastBrace = text.lastIndexOf('},')
  if (lastBrace !== -1) {
    try {
      const salvaged = text.slice(0, lastBrace + 1) + ']'
      const startBracket = salvaged.indexOf('[')
      if (startBracket !== -1) parsed = JSON.parse(salvaged.slice(startBracket))
    } catch {}
  }
  if (!parsed.length) throw new Error('No JSON array found in response')
} else {
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    const lastBrace = jsonMatch[0].lastIndexOf('},')
    if (lastBrace !== -1) {
      try { parsed = JSON.parse(jsonMatch[0].slice(0, lastBrace + 1) + ']') } catch {}
    }
    if (!parsed.length) throw new Error('Failed to parse JSON response')
  }
}

// 6. Normalize (same logic as extract-cards.ts)
const cards = parsed.map(c => ({
  type: c.type ?? 'vocabulary',
  front: c.front ?? '',
  back: c.back ?? '',
  notes: c.notes ?? null,
  distractors: Array.isArray(c.distractors) ? c.distractors.slice(0, 3) : [],
  sentences: (Array.isArray(c.sentences) ? c.sentences : [])
    .filter(s =>
      typeof s === 'object' && s !== null &&
      typeof s.korean === 'string' && s.korean.length > 0 &&
      typeof s.targetForm === 'string' && s.targetForm.length > 0 &&
      sentenceMatch(s.korean, s.targetForm).found
    )
    .slice(0, 3)
    .map(s => ({
      korean: s.korean,
      targetForm: s.targetForm,
      translation: typeof s.translation === 'string' ? s.translation : '',
    })),
}))

console.log(`Claude extracted ${cards.length} cards. Fronts:`)
for (const c of cards) console.log(`  [${c.type}] ${c.front} → ${c.back}`)

if (!cards.length) {
  console.log('No cards extracted — nothing to save.')
  process.exit(0)
}

// 7. Save cards to DB
console.log('\nSaving to DB...')
for (const card of cards) {
  // Generate a cuid-like ID (timestamp + random)
  const id = 'cm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO "Card" (id, front, back, type, notes, distractors, lessonId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      card.front,
      card.back,
      card.type,
      card.notes,
      card.distractors.length ? JSON.stringify(card.distractors) : null,
      lessonId,
      now,
      now,
    ],
  })

  // Create Sentence rows
  for (let i = 0; i < card.sentences.length; i++) {
    const s = card.sentences[i]
    const sid = 'cm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    await db.execute({
      sql: `INSERT INTO "Sentence" (id, korean, targetForm, translation, orderIndex, cardId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [sid, s.korean, s.targetForm, s.translation, i, id, now, now],
    })
  }

  // Create CardReview row (no createdAt/updatedAt in schema; all other fields default)
  const rid = 'cm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  await db.execute({
    sql: `INSERT INTO "CardReview" (id, cardId) VALUES (?, ?)`,
    args: [rid, id],
  })

  console.log(`  Saved: ${card.front}`)
}

console.log(`\nDone! Added ${cards.length} cards to lesson ${targetOrderIndex}.`)
