import { describe, it, expect } from 'vitest'
import manifest from '../app/manifest'

describe('manifest', () => {
  const result = manifest()

  it('sets background_color to the dark chrome color', () => {
    expect(result.background_color).toBe('#0b0f1a')
  })

  it('sets theme_color to the dark chrome color', () => {
    expect(result.theme_color).toBe('#0b0f1a')
  })

  it('leaves all other fields unchanged', () => {
    expect(result.name).toBe('Korean Study')
    expect(result.short_name).toBe('Korean')
    expect(result.description).toBe('Korean language study app with spaced repetition')
    expect(result.start_url).toBe('/')
    expect(result.display).toBe('standalone')
    expect(result.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
  })
})
