import { describe, it, expect } from 'vitest'
import fs from 'fs'

const css = fs.readFileSync('app/globals.css', 'utf-8')

describe('--skeleton-bg token (PERCEPT-01)', () => {
  it('is defined exactly 3 times', () => {
    const matches = css.match(/--skeleton-bg:/g) ?? []
    expect(matches.length).toBe(3)
  })

  it("light :root block's --skeleton-bg is #f3f4f6", () => {
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'))
    const match = rootBlock.match(/--skeleton-bg:\s*(#[0-9a-fA-F]+);/)
    expect(match?.[1]).toBe('#f3f4f6')
  })

  it("dark @media block and dark [data-theme='dark'] block both set --skeleton-bg to #1c2030, byte-identical", () => {
    const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)')
    const mediaEnd = css.indexOf('\n}\n', mediaStart) // closes the outer @media block
    const mediaBlock = css.slice(mediaStart, mediaEnd)
    const mediaMatch = mediaBlock.match(/--skeleton-bg:\s*(#[0-9a-fA-F]+);/)

    const dataThemeStart = css.indexOf(':root[data-theme="dark"]')
    const dataThemeEnd = css.indexOf('\n}\n', dataThemeStart)
    const dataThemeBlock = css.slice(dataThemeStart, dataThemeEnd)
    const dataThemeMatch = dataThemeBlock.match(/--skeleton-bg:\s*(#[0-9a-fA-F]+);/)

    expect(mediaMatch?.[1]).toBe('#1c2030')
    expect(dataThemeMatch?.[1]).toBe('#1c2030')
    expect(mediaMatch?.[1]).toBe(dataThemeMatch?.[1])
  })

  it('dark --skeleton-bg is NOT equal to dark --background (the defect this token fixes)', () => {
    const dataThemeStart = css.indexOf(':root[data-theme="dark"]')
    const dataThemeEnd = css.indexOf('\n}\n', dataThemeStart)
    const dataThemeBlock = css.slice(dataThemeStart, dataThemeEnd)
    const skeletonMatch = dataThemeBlock.match(/--skeleton-bg:\s*(#[0-9a-fA-F]+);/)
    const backgroundMatch = dataThemeBlock.match(/--background:\s*(#[0-9a-fA-F]+);/)

    expect(skeletonMatch?.[1]).toBeDefined()
    expect(backgroundMatch?.[1]).toBeDefined()
    expect(skeletonMatch?.[1]).not.toBe(backgroundMatch?.[1])
  })

  it('@theme inline exposes --color-skeleton: var(--skeleton-bg)', () => {
    expect(css).toContain('--color-skeleton: var(--skeleton-bg);')
  })
})
