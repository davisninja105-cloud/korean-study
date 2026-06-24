import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, computeAuthToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }))

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'APP_PASSWORD is not configured' }, { status: 500 })
  }
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const token = await computeAuthToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
  return res
}
