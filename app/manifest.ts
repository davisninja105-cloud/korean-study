import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Korean Study',
    short_name: 'Korean',
    description: 'Korean language study app with spaced repetition',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0f1a',
    theme_color: '#0b0f1a',
    icons: [
      { src: '/icon-192.png',          sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png',          sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
