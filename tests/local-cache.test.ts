// Vitest unit coverage for lib/local-cache.ts under fake-indexeddb (Node has
// no native IndexedDB). Every behavior bullet from 34-01-PLAN.md Task 2 gets
// its own `it`. Plain describe/it/expect, no DOM — matches
// tests/sequence.test.ts / tests/card-key.test.ts's style.
//
// The polyfill import MUST be the first line, before importing
// @/lib/local-cache — the module itself captures nothing at import time, but
// `openDB` (called lazily inside getDb()) needs the global `indexedDB` to
// already exist by the time any exported function actually runs.
import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  readCache,
  writeCache,
  patchStudyCard,
  patchCachedCard,
  removeCachedCard,
  insertCachedCard,
  patchActivitySlice,
  fetchCacheContextOrLastKnown,
  LAST_CONTEXT_KEY,
  type StudyCachePayload,
  type CardsCachePayload,
  type HomeCachePayload,
  type HabitsCachePayload,
} from '../lib/local-cache'
import type { CardDTO, ActivityDTO, StatsDTO } from '../lib/dto'

function card(id: string, overrides: Partial<CardDTO> = {}): CardDTO {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    type: 'vocabulary',
    front: `front-${id}`,
    back: `back-${id}`,
    notes: null,
    normalizedFront: `front-${id}`,
    components: null,
    distractors: null,
    lessonId: null,
    lesson: null,
    review: null,
    sentences: [],
    ...overrides,
  }
}

// A fresh buildId per test avoids cross-test IndexedDB state bleed (each
// buildId opens a genuinely separate database).
let buildIdCounter = 0
function freshBuildId(): string {
  buildIdCounter += 1
  return `test-build-${buildIdCounter}`
}

describe('readCache / writeCache round-trip', () => {
  it('writeCache then readCache for the same (buildId, route) round-trips data unchanged and returns the dataVersion it was written with', async () => {
    const buildId = freshBuildId()
    await writeCache(buildId, 'habits', { foo: 'bar' }, 'v1')
    const entry = await readCache<{ foo: string }>(buildId, 'habits')
    expect(entry?.data).toEqual({ foo: 'bar' })
    expect(entry?.dataVersion).toBe('v1')
  })

  it('writeCache twice for the same (buildId, route) leaves one entry; the second dataVersion wins', async () => {
    const buildId = freshBuildId()
    await writeCache(buildId, 'habits', { foo: 'first' }, 'v1')
    await writeCache(buildId, 'habits', { foo: 'second' }, 'v2')
    const entry = await readCache<{ foo: string }>(buildId, 'habits')
    expect(entry?.data).toEqual({ foo: 'second' })
    expect(entry?.dataVersion).toBe('v2')
  })

  it('readCache with a buildId that was never written returns undefined — a different build ID is a different database', async () => {
    const writtenBuildId = freshBuildId()
    await writeCache(writtenBuildId, 'habits', { foo: 'bar' }, 'v1')
    const neverWrittenBuildId = freshBuildId()
    const entry = await readCache(neverWrittenBuildId, 'habits')
    expect(entry).toBeUndefined()
  })

  it('readCache for a route key never written under an existing build ID returns undefined', async () => {
    const buildId = freshBuildId()
    await writeCache(buildId, 'habits', { foo: 'bar' }, 'v1')
    const entry = await readCache(buildId, 'study')
    expect(entry).toBeUndefined()
  })

  it('two different buildId values yield isolated databases — writing under one never appears under the other', async () => {
    const buildIdA = freshBuildId()
    const buildIdB = freshBuildId()
    await writeCache(buildIdA, 'habits', { who: 'A' }, 'v1')
    await writeCache(buildIdB, 'habits', { who: 'B' }, 'v1')
    const entryA = await readCache<{ who: string }>(buildIdA, 'habits')
    const entryB = await readCache<{ who: string }>(buildIdB, 'habits')
    expect(entryA?.data).toEqual({ who: 'A' })
    expect(entryB?.data).toEqual({ who: 'B' })
  })
})

describe('graceful failure — a cache read/write NEVER throws into a client render', () => {
  it('readCache resolves undefined and writeCache resolves without throwing when the underlying IndexedDB operation fails', async () => {
    const buildId = freshBuildId()
    const realIndexedDB = globalThis.indexedDB
    // Stub the global to simulate an unavailable/erroring IndexedDB (quota,
    // private-mode restriction, etc).
    // @ts-expect-error — deliberately assigning a throwing stub for this test
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable (simulated)')
      },
    }
    try {
      await expect(readCache(buildId, 'habits')).resolves.toBeUndefined()
      await expect(writeCache(buildId, 'habits', { foo: 'bar' }, 'v1')).resolves.toBeUndefined()
    } finally {
      globalThis.indexedDB = realIndexedDB
    }
  })
})

describe('patchStudyCard', () => {
  const buildId = () => freshBuildId()

  it('replaces that card in the study entry array in place and preserves array order', async () => {
    const bId = buildId()
    const c1 = card('c1')
    const c2 = card('c2')
    const c3 = card('c3')
    await writeCache<StudyCachePayload>(bId, 'study', [c1, c2, c3], 'v1')

    const updatedC2 = card('c2', { front: 'updated-front' })
    await patchStudyCard(bId, 'c2', updatedC2)

    const entry = await readCache<StudyCachePayload>(bId, 'study')
    expect(entry?.data.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(entry?.data[1].front).toBe('updated-front')
    // dataVersion preserved — a device-originated write doesn't invent a new version.
    expect(entry?.dataVersion).toBe('v1')
  })

  it('removes that card from the study entry when updatedCard is null', async () => {
    const bId = buildId()
    await writeCache<StudyCachePayload>(bId, 'study', [card('c1'), card('c2')], 'v1')
    await patchStudyCard(bId, 'c1', null)
    const entry = await readCache<StudyCachePayload>(bId, 'study')
    expect(entry?.data.map((c) => c.id)).toEqual(['c2'])
  })

  it('is a no-op on a missing study entry — does not throw and does not create an entry', async () => {
    const bId = buildId()
    await expect(patchStudyCard(bId, 'nope', card('nope'))).resolves.toBeUndefined()
    const entry = await readCache<StudyCachePayload>(bId, 'study')
    expect(entry).toBeUndefined()
  })

  // WR-01 regression (34-REVIEW.md): a non-null updatedCard whose id has
  // already been removed from the entry (e.g. it graduated out of the
  // session and was then undone) must be RE-INSERTED, not silently dropped.
  // POST /api/review/undo doesn't bump the server dataVersion, so this patch
  // is the only mechanism that can bring the card back before an unrelated
  // write happens to trigger a real revalidation.
  it('re-inserts a non-null updatedCard whose id is no longer present (undo-after-graduation)', async () => {
    const bId = buildId()
    const c1 = card('c1')
    const c2 = card('c2')
    await writeCache<StudyCachePayload>(bId, 'study', [c1, c2], 'v1')

    // Grade graduates c1 out of the session — write-through removes it.
    await patchStudyCard(bId, 'c1', null)
    let entry = await readCache<StudyCachePayload>(bId, 'study')
    expect(entry?.data.map((c) => c.id)).toEqual(['c2'])

    // Undo restores the pre-grade card.
    await patchStudyCard(bId, 'c1', c1)
    entry = await readCache<StudyCachePayload>(bId, 'study')
    expect(entry?.data.some((c) => c.id === 'c1')).toBe(true)
    expect(entry?.data).toHaveLength(2)
  })
})

function cardsPayload(groups: CardsCachePayload['groups']): CardsCachePayload {
  return { groups, groupCounts: { byType: [], total: 0 } }
}

describe('patchCachedCard', () => {
  it('applies the updater to the matching card in whichever group holds it (same-type edit, no relocation)', async () => {
    const bId = freshBuildId()
    const vocabCard = card('c1', { type: 'vocabulary' })
    await writeCache(
      bId,
      'cards',
      cardsPayload({ vocabulary: { loaded: [vocabCard], nextCursor: null, hasMore: false } }),
      'v1',
    )

    await patchCachedCard(bId, 'c1', (c) => ({ ...c, front: 'renamed' }))

    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry?.data.groups.vocabulary.loaded[0].front).toBe('renamed')
    expect(entry?.data.groups.vocabulary.loaded[0].type).toBe('vocabulary')
  })

  it('relocates the card into the destination group when the updater changes its type AND the destination group already has loaded rows', async () => {
    const bId = freshBuildId()
    const vocabCard = card('c1', { type: 'vocabulary' })
    const existingGrammarCard = card('g1', { type: 'grammar' })
    await writeCache(
      bId,
      'cards',
      cardsPayload({
        vocabulary: { loaded: [vocabCard], nextCursor: null, hasMore: false },
        grammar: { loaded: [existingGrammarCard], nextCursor: null, hasMore: false },
      }),
      'v1',
    )

    await patchCachedCard(bId, 'c1', (c) => ({ ...c, type: 'grammar' }))

    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry?.data.groups.vocabulary.loaded.map((c) => c.id)).toEqual([])
    expect(entry?.data.groups.grammar.loaded.map((c) => c.id)).toEqual(['c1', 'g1'])
  })

  it('removes the card from its old group WITHOUT splicing it into an unfetched destination group (loaded.length === 0)', async () => {
    const bId = freshBuildId()
    const vocabCard = card('c1', { type: 'vocabulary' })
    await writeCache(
      bId,
      'cards',
      cardsPayload({
        vocabulary: { loaded: [vocabCard], nextCursor: null, hasMore: false },
        phrase: { loaded: [], nextCursor: null, hasMore: true }, // never fetched
      }),
      'v1',
    )

    await patchCachedCard(bId, 'c1', (c) => ({ ...c, type: 'phrase' }))

    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry?.data.groups.vocabulary.loaded).toEqual([])
    // Destination group untouched — the card does not appear anywhere;
    // it will resurface once a real fetch populates the phrase group.
    expect(entry?.data.groups.phrase.loaded).toEqual([])
  })

  it('is a no-op when the cards entry does not exist', async () => {
    const bId = freshBuildId()
    await expect(patchCachedCard(bId, 'nope', (c) => c)).resolves.toBeUndefined()
    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry).toBeUndefined()
  })

  it('is a no-op when the card is not found in any group', async () => {
    const bId = freshBuildId()
    await writeCache(
      bId,
      'cards',
      cardsPayload({ vocabulary: { loaded: [card('c1')], nextCursor: null, hasMore: false } }),
      'v1',
    )
    await patchCachedCard(bId, 'nonexistent', (c) => ({ ...c, front: 'x' }))
    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry?.data.groups.vocabulary.loaded[0].front).toBe(card('c1').front)
  })
})

describe('removeCachedCard', () => {
  it('drops the id from every group', async () => {
    const bId = freshBuildId()
    await writeCache(
      bId,
      'cards',
      cardsPayload({
        vocabulary: { loaded: [card('c1'), card('c2')], nextCursor: null, hasMore: false },
        grammar: { loaded: [card('c1')], nextCursor: null, hasMore: false },
      }),
      'v1',
    )
    await removeCachedCard(bId, 'c1')
    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry?.data.groups.vocabulary.loaded.map((c) => c.id)).toEqual(['c2'])
    expect(entry?.data.groups.grammar.loaded.map((c) => c.id)).toEqual([])
  })
})

describe('insertCachedCard', () => {
  it('prepends into the group matching the card type only when that group already has loaded rows', async () => {
    const bId = freshBuildId()
    await writeCache(
      bId,
      'cards',
      cardsPayload({ vocabulary: { loaded: [card('existing')], nextCursor: null, hasMore: false } }),
      'v1',
    )
    await insertCachedCard(bId, card('new1', { type: 'vocabulary' }))
    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry?.data.groups.vocabulary.loaded.map((c) => c.id)).toEqual(['new1', 'existing'])
  })

  it('does not insert into a group that has never been fetched (loaded.length === 0)', async () => {
    const bId = freshBuildId()
    await writeCache(
      bId,
      'cards',
      cardsPayload({ vocabulary: { loaded: [], nextCursor: null, hasMore: true } }),
      'v1',
    )
    await insertCachedCard(bId, card('new1', { type: 'vocabulary' }))
    const entry = await readCache<CardsCachePayload>(bId, 'cards')
    expect(entry?.data.groups.vocabulary.loaded).toEqual([])
  })
})

describe('patchActivitySlice', () => {
  function activity(overrides: Partial<ActivityDTO> = {}): ActivityDTO {
    return { days: [], dailyGoalSeconds: 600, dayStartHour: 2, ...overrides }
  }
  function stats(): StatsDTO {
    return { totalCards: 0, dueCards: 0, totalLessons: 0, cardsByType: [], masteredCount: 0, cardsByState: [] }
  }

  it('updates dailyGoalSeconds/dayStartHour on BOTH the home entry activity slice and the habits entry, leaving other fields untouched', async () => {
    const bId = freshBuildId()
    const homePayload: HomeCachePayload = { stats: stats(), activity: activity() }
    const habitsPayload: HabitsCachePayload = {
      days: [],
      dailyGoalSeconds: 600,
      dayStartHour: 2,
      masteredCount: 42,
      cardsByState: [{ state: 2, stateLabel: 'Review', _count: 5 }],
    }
    await writeCache(bId, 'home', homePayload, 'v1')
    await writeCache(bId, 'habits', habitsPayload, 'v1')

    await patchActivitySlice(bId, { dailyGoalSeconds: 900, dayStartHour: 4 })

    const homeEntry = await readCache<HomeCachePayload>(bId, 'home')
    expect(homeEntry?.data.activity.dailyGoalSeconds).toBe(900)
    expect(homeEntry?.data.activity.dayStartHour).toBe(4)
    expect(homeEntry?.data.stats).toEqual(stats()) // untouched

    const habitsEntry = await readCache<HabitsCachePayload>(bId, 'habits')
    expect(habitsEntry?.data.dailyGoalSeconds).toBe(900)
    expect(habitsEntry?.data.dayStartHour).toBe(4)
    expect(habitsEntry?.data.masteredCount).toBe(42) // untouched
    expect(habitsEntry?.data.cardsByState).toEqual([{ state: 2, stateLabel: 'Review', _count: 5 }]) // untouched
  })

  it('is a no-op for whichever entry is absent', async () => {
    const bId = freshBuildId()
    const habitsPayload: HabitsCachePayload = {
      days: [],
      dailyGoalSeconds: 600,
      dayStartHour: 2,
      masteredCount: 0,
      cardsByState: [],
    }
    await writeCache(bId, 'habits', habitsPayload, 'v1')
    // 'home' entry deliberately never written.
    await expect(patchActivitySlice(bId, { dailyGoalSeconds: 700 })).resolves.toBeUndefined()

    const homeEntry = await readCache<HomeCachePayload>(bId, 'home')
    expect(homeEntry).toBeUndefined()
    const habitsEntry = await readCache<HabitsCachePayload>(bId, 'habits')
    expect(habitsEntry?.data.dailyGoalSeconds).toBe(700)
  })
})

describe('fetchCacheContextOrLastKnown — offline cold-launch localStorage fallback', () => {
  let store: Map<string, string>
  let originalLocalStorage: unknown
  let hadLocalStorage: boolean
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    store = new Map<string, string>()
    hadLocalStorage = 'localStorage' in globalThis
    originalLocalStorage = hadLocalStorage ? (globalThis as { localStorage?: unknown }).localStorage : undefined
    // Minimal Map-backed localStorage stand-in — Vitest's node environment has no native localStorage.
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
      clear: () => { store.clear() },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size },
    } as Storage
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    if (hadLocalStorage) {
      ;(globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
    globalThis.fetch = originalFetch
  })

  function mockFetchOk(version: string, buildId: string) {
    globalThis.fetch = (async () =>
      ({ ok: true, json: async () => ({ version, buildId }) }) as unknown as Response) as typeof globalThis.fetch
  }

  function mockFetchFail() {
    globalThis.fetch = (async () => {
      throw new Error('network down (simulated)')
    }) as typeof globalThis.fetch
  }

  it('a live success returns the live context with no stale marker and writes the pair to storage', async () => {
    mockFetchOk('v1', 'build1')
    const ctx = await fetchCacheContextOrLastKnown()
    expect(ctx).toEqual({ version: 'v1', buildId: 'build1' })
    expect(ctx?.stale).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(LAST_CONTEXT_KEY) as string)).toEqual({ version: 'v1', buildId: 'build1' })
  })

  it('a subsequent failure returns the previously stored pair marked stale', async () => {
    mockFetchOk('v1', 'build1')
    await fetchCacheContextOrLastKnown()
    mockFetchFail()
    const ctx = await fetchCacheContextOrLastKnown()
    expect(ctx).toEqual({ version: 'v1', buildId: 'build1', stale: true })
  })

  it('a failure with nothing stored returns null', async () => {
    mockFetchFail()
    const ctx = await fetchCacheContextOrLastKnown()
    expect(ctx).toBeNull()
  })

  it('a stored value that is malformed JSON returns null', async () => {
    localStorage.setItem(LAST_CONTEXT_KEY, '{not valid json')
    mockFetchFail()
    const ctx = await fetchCacheContextOrLastKnown()
    expect(ctx).toBeNull()
  })

  it('a stored object missing one of the two string fields returns null', async () => {
    localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify({ version: 'v1' }))
    mockFetchFail()
    const ctx = await fetchCacheContextOrLastKnown()
    expect(ctx).toBeNull()
  })

  it('a stored value whose fields are non-strings returns null', async () => {
    localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify({ version: 1, buildId: 2 }))
    mockFetchFail()
    const ctx = await fetchCacheContextOrLastKnown()
    expect(ctx).toBeNull()
  })

  it('a live success overwrites a previously stored older pair', async () => {
    localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify({ version: 'v-old', buildId: 'build-old' }))
    mockFetchOk('v2', 'build2')
    const ctx = await fetchCacheContextOrLastKnown()
    expect(ctx).toEqual({ version: 'v2', buildId: 'build2' })
    expect(JSON.parse(localStorage.getItem(LAST_CONTEXT_KEY) as string)).toEqual({ version: 'v2', buildId: 'build2' })
  })

  it('does not throw when localStorage is entirely absent from the global scope', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage
    mockFetchFail()
    await expect(fetchCacheContextOrLastKnown()).resolves.toBeNull()

    mockFetchOk('v1', 'build1')
    await expect(fetchCacheContextOrLastKnown()).resolves.toEqual({ version: 'v1', buildId: 'build1' })
  })
})

describe('every helper resolves (never rejects) on IndexedDB failure', () => {
  beforeEach(() => {})

  it('patch helpers resolve without throwing when the underlying IndexedDB operation fails', async () => {
    const bId = freshBuildId()
    const realIndexedDB = globalThis.indexedDB
    // @ts-expect-error — deliberately assigning a throwing stub for this test
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable (simulated)')
      },
    }
    try {
      await expect(patchStudyCard(bId, 'c1', null)).resolves.toBeUndefined()
      await expect(patchCachedCard(bId, 'c1', (c) => c)).resolves.toBeUndefined()
      await expect(removeCachedCard(bId, 'c1')).resolves.toBeUndefined()
      await expect(insertCachedCard(bId, card('c1'))).resolves.toBeUndefined()
      await expect(patchActivitySlice(bId, { dailyGoalSeconds: 1 })).resolves.toBeUndefined()
    } finally {
      globalThis.indexedDB = realIndexedDB
    }
  })
})
