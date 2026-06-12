import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, computeAuthToken } from '@/lib/auth'

export async function proxy(req: NextRequest) {
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
