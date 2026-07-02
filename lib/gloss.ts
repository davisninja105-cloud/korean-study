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
  } catch (err) {
    console.warn('Failed to parse cached gloss for', normalizedWord, err)
    return null
  }
}

const MAX_GLOSS_CACHE_ENTRIES = 2000

export async function setCachedGloss(
  normalizedWord: string,
  result: GlossResult
): Promise<void> {
  const count = await prisma.setting.count({
    where: { key: { startsWith: CACHE_KEY_PREFIX } },
  })
  if (count >= MAX_GLOSS_CACHE_ENTRIES) return

  const key = `${CACHE_KEY_PREFIX}${normalizedWord}`
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  })
}

// ── Bulk preload reader ───────────────────────────────────────────────────

// Bound on the preload payload. Fixed server-side (never client-controllable)
// so the response size stays bounded even as the cache approaches
// MAX_GLOSS_CACHE_ENTRIES (2000). See GET /api/gloss/preload.
export const GLOSS_PRELOAD_LIMIT = 300

/**
 * Bulk-read previously-resolved gloss entries for the client mount-time
 * preload (PERF-02).
 *
 * Returns up to `limit` { word, entry } pairs from the Setting table, scoped
 * to `gloss:`-prefixed keys ONLY — the `startsWith: CACHE_KEY_PREFIX` filter
 * guarantees app-config settings (buttonColor, dailyGoalSeconds,
 * sessionSize, habitDayStartHour, …) are never read or serialized
 * (threat T-14-05). The `take: limit` bound guarantees the payload can never
 * grow unbounded (threat T-14-04).
 *
 * The Setting table has no timestamp column, so "recent" is the DB's natural
 * key order; the limit is the only bound. Each row's `value` is JSON.parsed
 * inside a try/catch that skips + warns malformed entries (mirroring
 * getCachedGloss) — a corrupt cache row never crashes the preload
 * (threat T-14-06). The recovered `word` is the normalized form (the part of
 * the key after `gloss:`), which is the SAME key the client cache uses, so a
 * preloaded entry is a hit on the next tap of that word.
 */
export async function getRecentGlosses(
  limit: number = GLOSS_PRELOAD_LIMIT
): Promise<{ word: string; entry: GlossResult }[]> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: CACHE_KEY_PREFIX } },
    take: limit,
  })
  const out: { word: string; entry: GlossResult }[] = []
  for (const row of rows) {
    try {
      const entry = JSON.parse(row.value) as GlossResult
      out.push({ word: row.key.slice(CACHE_KEY_PREFIX.length), entry })
    } catch (err) {
      console.warn('Failed to parse cached gloss for', row.key, err)
    }
  }
  return out
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
