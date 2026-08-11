import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Nav from '@/components/Nav'
import ThemeWatcher from '@/components/ThemeWatcher'
import ServiceWorkerProvider from '@/components/ServiceWorkerProvider'
import OfflineQueueFlusher from '@/components/OfflineQueueFlusher'
import FreshnessWatcher from '@/components/FreshnessWatcher'
import { GlossProvider } from '@/components/GlossProvider'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Korean Study',
  description: 'Korean language study app with spaced repetition',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Korean Study',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f1a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Pre-paint theme resolution — runs during HTML parse, before first paint,
            so a stored/System dark preference never flashes light on load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`,
          }}
        />
        {/* Pre-paint safe-area-inset-bottom freeze — sets --sab before first paint so
            the main content bottom padding and nav bar are correct on iPhones with a
            home indicator even before React hydration fires. The Nav useEffect guard
            (if !existing) becomes a no-op in the common case. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var tmp=document.createElement('div');tmp.style.paddingBottom='env(safe-area-inset-bottom)';document.body.appendChild(tmp);var sab=getComputedStyle(tmp).paddingBottom;document.body.removeChild(tmp);document.documentElement.style.setProperty('--sab',sab||'0px');}catch(e){}})();`,
          }}
        />
        {/* Pre-paint settings resolution — RootLayout is a plain (non-async)
            function now, so it never awaits a DB read for buttonColor/rewardColor/
            readingTextScale/readingAid (LAYOUT-01: no blocking DB round trip on
            the cold path). Instead this script reads the ks_settings cookie
            (written by PUT /api/settings alongside its Setting-table writes,
            and re-seeded by app/settings/page.tsx on every /settings visit —
            see CR-01 in 30-REVIEW-FIX.md) and corrects the CSS custom
            properties + hangul-spaced class before first paint, exactly
            mirroring the theme-resolution script above. A missing or
            malformed cookie silently falls through to the CSS :root defaults
            (which already match DEFAULT_ACTION_COLOR/DEFAULT_REWARD_COLOR) —
            the outer try/catch guarantees this script can never throw and
            block render.
            KNOWN GAP: a browser session that (a) already had customized DB
            settings before the ks_settings cookie mechanism shipped, AND
            (b) never navigates to PUT /api/settings or GET /settings after
            that deploy, will keep seeing the CSS :root defaults everywhere
            except a page that triggers one of those two writers. Closing
            this fully would mean seeding the cookie from middleware.ts on
            any cookie-less request, but middleware runs on the Edge runtime
            by default while lib/prisma.ts's local dev fallback needs Node.js
            filesystem access — a deliberate follow-up, not a quick patch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )ks_settings=([^;]*)/);if(!m)return;var v=JSON.parse(decodeURIComponent(m[1]));var s=document.documentElement.style;if(v.buttonColor)s.setProperty('--button',v.buttonColor);if(v.buttonFg)s.setProperty('--button-foreground',v.buttonFg);if(v.rewardColor)s.setProperty('--reward',v.rewardColor);if(v.rewardFg)s.setProperty('--reward-foreground',v.rewardFg);if(v.readingTextScale)s.setProperty('--reading-scale',v.readingTextScale);if(v.readingAid)document.documentElement.classList.add('hangul-spaced');}catch(e){}})();`,
          }}
        />
        <ThemeWatcher />
        <ServiceWorkerProvider />
        <OfflineQueueFlusher />
        <FreshnessWatcher>
          <GlossProvider>
            <Nav />
            <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-8 pb-[calc(4.5rem+var(--sab,0px))] sm:pb-8">
              {children}
            </main>
          </GlossProvider>
        </FreshnessWatcher>
      </body>
    </html>
  )
}
