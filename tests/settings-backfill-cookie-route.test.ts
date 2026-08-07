// Unit test for POST /api/settings/backfill-cookie (G-30-2 fix).
//
// Imports the real, unmodified POST handler and calls it with a fake request
// object exposing only `.json()` — matching tests/review-route.test.ts's
// convention. Unlike that file, this route never touches Prisma, so there is
// no DB setup here.
import { describe, it, expect } from 'vitest'
import { readableForeground } from '@/lib/color'
import { POST } from '@/app/api/settings/backfill-cookie/route'

function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

describe('POST /api/settings/backfill-cookie', () => {
  it('sets the ks_settings cookie with the caller-supplied values', async () => {
    const res = await POST(
      fakeRequest({
        buttonColor: '#111111',
        rewardColor: '#222222',
        readingTextScale: 1.2,
        readingAid: true,
      }),
    )

    expect(res.status).toBe(200)

    const cookie = res.cookies.get('ks_settings')
    expect(cookie).toBeDefined()
    expect(cookie!.httpOnly).toBe(false)
    expect(cookie!.sameSite).toBe('lax')
    expect(cookie!.path).toBe('/')
    expect(cookie!.maxAge).toBe(60 * 60 * 24 * 365)

    expect(JSON.parse(cookie!.value)).toEqual({
      buttonColor: '#111111',
      buttonFg: readableForeground('#111111'),
      rewardColor: '#222222',
      rewardFg: readableForeground('#222222'),
      readingTextScale: 1.2,
      readingAid: true,
    })
  })

  it('returns 400 and sets no cookie when a required field is missing', async () => {
    const res = await POST(
      fakeRequest({
        buttonColor: '#111111',
        rewardColor: '#222222',
        readingTextScale: 1.2,
        // readingAid intentionally omitted
      }),
    )

    expect(res.status).toBe(400)
    expect(res.cookies.get('ks_settings')).toBeUndefined()
  })
})
