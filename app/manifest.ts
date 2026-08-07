import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Korean Study',
    short_name: 'Korean',
    description: 'Korean language study app with spaced repetition',
    start_url: '/',
    display: 'standalone',
    // PERCEPT-02: pinned to the dark chrome color to kill the white
    // splash-screen flash on cold PWA launch. KNOWN TRADE-OFF (WR-01 in
    // 30-REVIEW-FIX.md): this file is a single static manifest with no
    // light/dark variant, while the app's actual theme is a real System /
    // Light / Dark user choice (see lib/theme.ts) — a user on System with a
    // light OS, or who explicitly picks Light, now gets the opposite flash
    // instead (dark splash → light UI once the pre-paint theme script in
    // app/layout.tsx runs). Accepted for now on the assumption that dark
    // theme covers the majority of real usage; revisit if that assumption
    // stops holding (e.g. a per-OS-preference manifest via two static
    // manifest routes, or a `link rel="manifest"` swap keyed off the
    // pre-paint theme script).
    background_color: '#0b0f1a',
    theme_color: '#0b0f1a',
    icons: [
      { src: '/icon-192.png',          sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png',          sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
