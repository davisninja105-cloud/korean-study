#!/usr/bin/env node
/**
 * gen-sw.mjs — post-build generator that walks .next/static and writes
 * public/sw.js.
 *
 * Runs automatically as part of `npm run build` (chained in package.json,
 * after `next build`) because — unlike scripts/gen-icons.mjs, whose PNG
 * output only changes when the source SVG is manually edited and is
 * committed — this file's output (the precache list and the versioned
 * CACHE_NAME) changes on every single deploy.
 *
 * Exports three pure helpers so tests/gen-sw.test.ts can drive them without
 * touching the real build tree: resolveBuildId, collectPrecacheList,
 * renderServiceWorker. The `main` block below (which does the actual file
 * walking/writing) only runs when this file is invoked directly.
 */

import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

// Fixed shell assets precached alongside every hashed .next/static file —
// the fonts + icon set the app shell references immediately on first paint.
export const SHELL_ASSETS = [
  '/fonts/PretendardVariable.woff2',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-icon.png',
  '/manifest.webmanifest',
]

/**
 * Same fallback chain app/api/version/route.ts already uses, so the
 * worker's cache name and Phase 34's IndexedDB namespace move together on
 * every deploy.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveBuildId(env) {
  return env.VERCEL_GIT_COMMIT_SHA ?? env.VERCEL_DEPLOYMENT_ID ?? 'local-dev'
}

/**
 * Walk `staticDir` recursively, keep only real files, map each to a
 * `/_next/static/`-prefixed POSIX URL, concatenate `shellAssets`, and return
 * the result sorted with a plain lexicographic comparator — so two runs over
 * the same tree produce byte-identical output (OFFLINE-01 ordering edge).
 *
 * @param {string} staticDir absolute path to .next/static
 * @param {string[]} shellAssets
 * @returns {string[]}
 */
export function collectPrecacheList(staticDir, shellAssets) {
  const files = []
  let entries
  try {
    entries = readdirSync(staticDir, { recursive: true })
  } catch {
    entries = []
  }
  for (const entry of entries) {
    const full = join(staticDir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const urlPath = '/_next/static/' + relative(staticDir, full).split('\\').join('/')
    files.push(urlPath)
  }
  return [...files, ...shellAssets].sort()
}

/**
 * Strip the leading `export ` keyword from each exported declaration in
 * `runtimeSource` and substitute it plus the JSON-stringified cache name and
 * precache array into the template's three tokens.
 *
 * @param {{ runtimeSource: string, template: string, cacheName: string, precache: string[] }} params
 * @returns {string}
 */
export function renderServiceWorker({ runtimeSource, template, cacheName, precache }) {
  const inlinedRuntime = runtimeSource.replace(/^export\s+/gm, '')
  return template
    .replace('__SW_RUNTIME__', inlinedRuntime)
    .replace('__CACHE_NAME__', JSON.stringify(cacheName))
    .replace('__PRECACHE_LIST__', JSON.stringify(precache))
}

async function main() {
  const staticDir = join(root, '.next', 'static')
  const precache = collectPrecacheList(staticDir, SHELL_ASSETS)

  const staticFileCount = precache.length - SHELL_ASSETS.length
  if (staticFileCount <= 0) {
    console.error(
      `gen-sw: .next/static (${staticDir}) yielded zero files — refusing to emit a service worker with nothing to precache. Run "next build" first.`
    )
    process.exit(1)
  }

  const buildId = resolveBuildId(process.env)
  const cacheName = `ks-shell-${buildId}`
  const runtimeSource = readFileSync(join(__dir, 'sw-runtime.mjs'), 'utf8')
  const template = readFileSync(join(__dir, 'sw-template.js'), 'utf8')

  const rendered = renderServiceWorker({ runtimeSource, template, cacheName, precache })
  const outPath = join(root, 'public', 'sw.js')
  writeFileSync(outPath, rendered)
  console.log(`gen-sw: wrote ${outPath.replace(root + '/', '')} — cache "${cacheName}", ${precache.length} precache entries`)
}

// Only run main() when this file is invoked directly (`node scripts/gen-sw.mjs`),
// not when imported by tests/gen-sw.test.ts — compare process.argv[1] resolved
// to a file URL against import.meta.url.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
