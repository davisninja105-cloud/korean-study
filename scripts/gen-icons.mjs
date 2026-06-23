#!/usr/bin/env node
/**
 * gen-icons.mjs — rasterise public/icon.svg into the icon set.
 *
 * Run once locally after editing public/icon.svg, then commit the PNGs:
 *   node scripts/gen-icons.mjs
 *
 * Requires `sharp` (already in node_modules via Next.js image optimisation).
 * Requires the system to have Apple SD Gothic Neo or another Korean font so
 * that the 한 character renders correctly (macOS: built-in; Linux: install
 * `fonts-noto-cjk`).
 *
 * Outputs:
 *   public/icon-192.png         — general icon (standard)
 *   public/icon-512.png         — large icon (standard)
 *   public/apple-icon.png       — Apple touch icon (180 × 180, no rounded corners
 *                                  — iOS adds its own mask)
 *   public/icon-512-maskable.png — maskable icon: same design but 한 fits within
 *                                  the central 80% safe zone.
 */

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

// Standard icon SVG (content fills ~72% of canvas — fine for standard icons)
const svgStd = readFileSync(join(root, 'public', 'icon.svg'))

// Maskable icon SVG: same background, but 한 is sized to sit inside the 80%
// safe zone (80% of 512 = 409px; text centered at 256, scaled down to ~248px
// font size, baseline at ~310). The outer 10% on each side is pure brand color.
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#3b82f6"/>
  <text
    x="256"
    y="310"
    text-anchor="middle"
    font-family="'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    font-weight="700"
    font-size="248"
    fill="#ffffff"
    letter-spacing="-4"
  >한</text>
</svg>`

async function generate(svgBuf, outPath, size) {
  await sharp(Buffer.from(svgBuf))
    .resize(size, size)
    .png()
    .toFile(outPath)
  console.log(`✓ ${outPath.replace(root + '/', '')}  (${size}×${size})`)
}

async function main() {
  console.log('Generating icons from public/icon.svg …\n')

  await generate(svgStd,      join(root, 'public', 'icon-192.png'),          192)
  await generate(svgStd,      join(root, 'public', 'icon-512.png'),          512)
  await generate(svgStd,      join(root, 'public', 'apple-icon.png'),        180)
  await generate(svgMaskable, join(root, 'public', 'icon-512-maskable.png'), 512)

  console.log('\nDone. Commit the new PNGs and run `npm run build` to verify.')
}

main().catch((e) => { console.error(e); process.exit(1) })
