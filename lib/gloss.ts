/**
 * Server-side gloss helper.
 *
 * Used by /api/gloss to look up Korean words:
 *   1. Corpus-first (prisma.card lookup by normalizedFront).
 *   2. Setting-table cache (prefix "gloss:") for previously-resolved unknowns.
 *   3. LLM fallback via Claude Haiku (fast, cheap, single-word lookups).
 *
 * No `'use client'` — this module runs server-side only.
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

export interface GlossResult {
  dictionaryForm: string
  gloss: string
  partOfSpeech: string
  source: 'corpus' | 'cache' | 'llm'
  cardId?: string
}

const CACHE_KEY_PREFIX = 'gloss:'

// ── Cache helpers (Setting table, key/value) ──────────────────────────────

export async function getCachedGloss(normalizedWord: string): Promise<GlossResult | null> {
  const row = await prisma.setting.findUnique({
    where: { key: `${CACHE_KEY_PREFIX}${normalizedWord}` },
  })
  if (!row) return null
  try {
    return JSON.parse(row.value) as GlossResult
  } catch {
    return null
  }
}

export async function setCachedGloss(
  normalizedWord: string,
  result: GlossResult
): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${normalizedWord}`
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  })
}

// ── LLM fallback ──────────────────────────────────────────────────────────

export async function lookupViaLLM(word: string): Promise<{
  dictionaryForm: string
  gloss: string
  partOfSpeech: string
}> {
  const anthropic = new Anthropic()

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: 'You are a Korean language dictionary. Return only compact JSON.',
    messages: [
      {
        role: 'user',
        content: `Look up this Korean word or grammar pattern: "${word}"

Return a JSON object with exactly these three keys:
- "dictionaryForm": the base/dictionary form in Hangul (e.g. verb → 하다 form; noun → stem)
- "gloss": a concise English meaning, 6 words or fewer
- "partOfSpeech": exactly one of: "noun" | "verb" | "adjective" | "adverb" | "particle" | "expression" | "grammar" | "other"

Return ONLY the JSON object. No markdown, no explanation.`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response from Claude')

  const text = content.text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON object found in gloss response')
  return JSON.parse(jsonMatch[0]) as {
    dictionaryForm: string
    gloss: string
    partOfSpeech: string
  }
}
