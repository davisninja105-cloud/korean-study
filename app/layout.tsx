import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Nav from '@/components/Nav'
import ThemeWatcher from '@/components/ThemeWatcher'
import FreshnessWatcher from '@/components/FreshnessWatcher'
import { GlossProvider } from '@/components/GlossProvider'
import { getButtonColor, getRewardColor, getReadingTextScale, getReadingAid } from '@/lib/settings'
import { readableForeground } from '@/lib/color'
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [buttonColor, rewardColor, readingScale, readingAid] = await Promise.all([
    getButtonColor(), getRewardColor(), getReadingTextScale(), getReadingAid(),
  ])
  const buttonStyle = {
    '--button': buttonColor,
    '--button-foreground': readableForeground(buttonColor),
    '--reward': rewardColor,
    '--reward-foreground': readableForeground(rewardColor),
    '--reading-scale': readingScale,
  } as React.CSSProperties

  return (
    <html lang="en" suppressHydrationWarning style={buttonStyle} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${readingAid ? ' hangul-spaced' : ''}`}>
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
        <ThemeWatcher />
        <FreshnessWatcher />
        <GlossProvider>
          <Nav />
          <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-8 pb-[calc(4.5rem+var(--sab,0px))] sm:pb-8">
            {children}
          </main>
        </GlossProvider>
      </body>
    </html>
  )
}
