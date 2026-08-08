// Route-level test for GET /api/cards/due (32-03-PLAN.md Task 3).
//
// getStudyCards() now returns { cards, lessons } (StudyCardsResult), but this
// route must keep responding with a bare CardDTO[] JSON array —
// components/StudyClient.tsx's filter and study-ahead re-fetches both parse
// the response via Array.isArray semantics (`.then((cards: CardDTO[]) =>
// ...)` directly on the parsed body), and wrapping it in an object would
// break them silently at runtime with no type error.
//
// This test mocks @/lib/study-cards directly (not @/lib/prisma) since the
// concern here is the route's own wrapping/unwrapping behavior, not
// getStudyCards()'s internal pipeline (already covered end-to-end by
// tests/study-cards.test.ts's mocked-prisma suite).
//
// The handler only ever reads `req.nextUrl.searchParams` — a real `URL`
// object satisfies that shape without needing a full NextRequest, following
// the same "build the minimal object it actually needs" convention as
// tests/review-route.test.ts's fakeRequest().

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/study-cards', () => ({
  getStudyCards: vi.fn(),
}))

import { getStudyCards } from '@/lib/study-cards'
import { GET } from '@/app/api/cards/due/route'

function fakeRequest(url: string) {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0]
}

describe('GET /api/cards/due — bare array response contract', () => {
  beforeEach(() => {
    ;(getStudyCards as ReturnType<typeof vi.fn>).mockReset()
  })

  it('responds with a bare JSON array, not the { cards, lessons } object getStudyCards() returns', async () => {
    ;(getStudyCards as ReturnType<typeof vi.fn>).mockResolvedValue({
      cards: [{ id: 'card-1' }],
      lessons: [{ id: 'lesson-1', orderIndex: 1, title: 'Lesson 1' }],
    })

    const res = await GET(fakeRequest('http://localhost/api/cards/due'))
    const body: unknown = await res.json()

    expect(Array.isArray(body)).toBe(true)
    expect(body).toEqual([{ id: 'card-1' }])
  })

  it('still passes scope through to getStudyCards() and stays a bare array for scope=ahead', async () => {
    ;(getStudyCards as ReturnType<typeof vi.fn>).mockResolvedValue({
      cards: [],
      lessons: [],
    })

    const res = await GET(fakeRequest('http://localhost/api/cards/due?scope=ahead'))
    const body: unknown = await res.json()

    expect(Array.isArray(body)).toBe(true)
    expect(getStudyCards).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'ahead' })
    )
  })
})
