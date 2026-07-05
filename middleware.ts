import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, computeAuthToken, isValidCronAuth } from '@/lib/auth'

const CRON_SYNC_PATH = '/api/cron/sync'

export async function middleware(req: NextRequest) {
  // Vercel Cron requests carry a bearer token, never the session cookie —
  // authenticate this path separately and return early so it never falls
  // through into the cookie/redirect logic below (a cron request must get a
  // clean 401, not a /login redirect).
  if (req.nextUrl.pathname === CRON_SYNC_PATH) {
    const authHeader = req.headers.get('authorization')
    if (isValidCronAuth(authHeader, process.env.CRON_SECRET)) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value

  let authed = false
  try {
    authed = !!cookie && cookie === (await computeAuthToken())
  } catch {
    authed = false // AUTH_SECRET missing — fail closed
  }

  if (authed) return NextResponse.next()

  // Unauthenticated: 401 for API calls, redirect to /login for pages.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  // Protect everything except the login page/route, Next internals, and
  // public PWA assets (manifest + icons).
  matcher: [
    '/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png|apple-icon.*\\.png).*)',
  ],
}
