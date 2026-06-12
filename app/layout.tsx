import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Nav from '@/components/Nav'
import { getButtonColor } from '@/lib/settings'
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
  const buttonColor = await getButtonColor()
  const buttonStyle = {
    '--button': buttonColor,
    '--button-foreground': readableForeground(buttonColor),
  } as React.CSSProperties

  return (
    <html lang="en" style={buttonStyle} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-8 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-8">
          {children}
        </main>
      </body>
    </html>
  )
}
