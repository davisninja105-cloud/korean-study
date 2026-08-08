import { prisma } from '@/lib/prisma'
import { DEFAULT_GOAL_SECONDS, DEFAULT_DAY_START_HOUR, DEFAULT_SESSION_SIZE } from '@/lib/habit'
import { DEFAULT_ACTION_COLOR, DEFAULT_REWARD_COLOR } from '@/lib/palettes'

const GOAL_KEY = 'dailyGoalSeconds'
const DAY_START_KEY = 'habitDayStartHour'
const BUTTON_COLOR_KEY = 'buttonColor'
const REWARD_COLOR_KEY = 'rewardColor'
const SESSION_SIZE_KEY = 'sessionSize'
const READING_SCALE_KEY = 'readingTextScale'
const READING_AID_KEY = 'readingAid'
const LAST_AUTO_SYNCED_KEY = 'lastAutoSyncedAt'
// Phase 32 (STUDY-03): opaque change token invalidating lib/study-cache.ts's
// in-memory invariant snapshot. Written ONLY by bumpStudyCacheVersion() below,
// called ONLY from lib/sync.ts:runSync() and lib/relink-dependencies.ts:
// relinkAllDependencies() — never from PUT /api/settings, which handles a
// fixed, explicit key set and gains no branch for this one.
const STUDY_CACHE_VERSION_KEY = 'studyCacheVersion'

// Single source of truth for every Setting-table key name. NOTE: getAllSettings()
// below does NOT spread Object.values(this) — it uses an explicit array of the
// eight user-facing keys, so adding studyCacheVersion here does not change what
// GET /api/settings fetches or returns.
export const SETTING_KEYS = {
  dailyGoalSeconds: GOAL_KEY,
  dayStartHour: DAY_START_KEY,
  buttonColor: BUTTON_COLOR_KEY,
  rewardColor: REWARD_COLOR_KEY,
  sessionSize: SESSION_SIZE_KEY,
  readingTextScale: READING_SCALE_KEY,
  readingAid: READING_AID_KEY,
  lastAutoSyncedAt: LAST_AUTO_SYNCED_KEY,
  studyCacheVersion: STUDY_CACHE_VERSION_KEY,
} as const

const HEX_RE = /^#[0-9a-fA-F]{6}$/

// --- Pure parse functions: raw string-or-undefined in, validated value out.
// Each existing getter's default/validation/fallback logic lives here exactly
// once, shared by both the standalone getter (its own findUnique round-trip)
// and the batched getSettings() call sites below — so the two paths can never
// drift out of sync on defaults or validation rules.

function parseDailyGoalSeconds(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) ? n : DEFAULT_GOAL_SECONDS
}

function parseDayStartHour(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) ? n : DEFAULT_DAY_START_HOUR
}

// Exported (Phase 32-04): lib/study-cache.ts's refreshStudyCache() reads
// sessionSize off the SAME combined invariants query as edges/lemmas/lessons
// (a raw TEXT-or-null column, never a separate getSessionSize() round trip)
// and reuses this exact parse/default logic rather than duplicating it.
export function parseSessionSize(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) ? n : DEFAULT_SESSION_SIZE
}

function parseReadingTextScale(raw: string | undefined): number {
  const n = raw ? parseFloat(raw) : NaN
  return Number.isFinite(n) ? Math.max(0.9, Math.min(1.4, n)) : 1
}

function parseReadingAid(raw: string | undefined): boolean {
  return raw === '1'
}

function parseButtonColor(raw: string | undefined): string {
  return raw && HEX_RE.test(raw) ? raw : DEFAULT_ACTION_COLOR
}

function parseRewardColor(raw: string | undefined): string {
  return raw && HEX_RE.test(raw) ? raw : DEFAULT_REWARD_COLOR
}

/**
 * Batched Setting lookup — one `prisma.setting.findMany({ where: { key: { in: keys } } })`
 * instead of N individual `findUnique` round-trips. Returns a Map of key → raw
 * stored value (missing rows are simply absent from the Map). Callers pass the
 * result through the matching `parse*` function above (or the standalone getter's
 * own logic) to get a validated, defaulted value — this function does no
 * validation itself, only the batched fetch.
 */
export async function getSettings(keys: string[]): Promise<Map<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  return new Map(rows.map((r) => [r.key, r.value]))
}

export async function getDailyGoalSeconds(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: GOAL_KEY } })
  return parseDailyGoalSeconds(row?.value)
}

export async function setDailyGoalSeconds(seconds: number): Promise<number> {
  const clamped = Math.max(60, Math.min(3600, Math.round(seconds))) // 1–60 min
  await prisma.setting.upsert({
    where: { key: GOAL_KEY },
    create: { key: GOAL_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  })
  return clamped
}

export async function getDayStartHour(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: DAY_START_KEY } })
  return parseDayStartHour(row?.value)
}

export async function setDayStartHour(hour: number): Promise<number> {
  const clamped = Math.max(0, Math.min(23, Math.round(hour)))
  await prisma.setting.upsert({
    where: { key: DAY_START_KEY },
    create: { key: DAY_START_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  })
  return clamped
}

export async function getSessionSize(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: SESSION_SIZE_KEY } })
  return parseSessionSize(row?.value)
}

export async function setSessionSize(n: number): Promise<number> {
  const clamped = Math.max(5, Math.min(100, Math.round(n)))
  await prisma.setting.upsert({
    where: { key: SESSION_SIZE_KEY },
    create: { key: SESSION_SIZE_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  })
  return clamped
}

export async function getReadingTextScale(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: READING_SCALE_KEY } })
  return parseReadingTextScale(row?.value)
}

export async function setReadingTextScale(scale: number): Promise<number> {
  const clamped = Math.max(0.9, Math.min(1.4, Math.round(scale * 10) / 10))
  await prisma.setting.upsert({
    where: { key: READING_SCALE_KEY },
    create: { key: READING_SCALE_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  })
  return clamped
}

export async function getReadingAid(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: READING_AID_KEY } })
  return parseReadingAid(row?.value)
}

export async function setReadingAid(on: boolean): Promise<boolean> {
  await prisma.setting.upsert({
    where: { key: READING_AID_KEY },
    create: { key: READING_AID_KEY, value: on ? '1' : '0' },
    update: { value: on ? '1' : '0' },
  })
  return on
}

// Raw ISO timestamp of the last successful cron-triggered sync. Unlike the
// setters above, this returns void: its only caller (the cron route) already
// holds the ISO string it just wrote and never round-trips it through the
// return value, unlike the Settings page pattern where PUT echoes the
// clamped/validated value back for client state sync.
export async function getLastAutoSyncedAt(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: LAST_AUTO_SYNCED_KEY } })
  return row?.value ?? null
}

export async function setLastAutoSyncedAt(iso: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: LAST_AUTO_SYNCED_KEY },
    create: { key: LAST_AUTO_SYNCED_KEY, value: iso },
    update: { value: iso },
  })
}

export async function getButtonColor(): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: BUTTON_COLOR_KEY } })
    return parseButtonColor(row?.value)
  } catch (err) {
    console.error('Failed to read buttonColor setting:', err)
    return DEFAULT_ACTION_COLOR
  }
}

export async function setButtonColor(hex: string): Promise<string> {
  const value = HEX_RE.test(hex) ? hex.toLowerCase() : DEFAULT_ACTION_COLOR
  await prisma.setting.upsert({
    where: { key: BUTTON_COLOR_KEY },
    create: { key: BUTTON_COLOR_KEY, value },
    update: { value },
  })
  return value
}

export async function getRewardColor(): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: REWARD_COLOR_KEY } })
    return parseRewardColor(row?.value)
  } catch (err) {
    console.error('Failed to read rewardColor setting:', err)
    return DEFAULT_REWARD_COLOR
  }
}

export async function setRewardColor(hex: string): Promise<string> {
  const value = HEX_RE.test(hex) ? hex.toLowerCase() : DEFAULT_REWARD_COLOR
  await prisma.setting.upsert({
    where: { key: REWARD_COLOR_KEY },
    create: { key: REWARD_COLOR_KEY, value },
    update: { value },
  })
  return value
}

/**
 * Batched equivalent of the 8-key Promise.all in GET /api/settings.
 * lastAutoSyncedAt is a raw pass-through (null if absent) — no parse function
 * needed, matching getLastAutoSyncedAt()'s existing contract.
 *
 * Deliberately uses an explicit array of the eight user-facing keys (NOT
 * Object.values(SETTING_KEYS)) so that studyCacheVersion — a server-internal
 * invalidation token, never a user-facing setting — cannot leak into this
 * response just because a new key was added to SETTING_KEYS.
 */
export async function getAllSettings(): Promise<{
  dailyGoalSeconds: number
  dayStartHour: number
  buttonColor: string
  rewardColor: string
  sessionSize: number
  readingTextScale: number
  readingAid: boolean
  lastAutoSyncedAt: string | null
}> {
  const map = await getSettings([
    SETTING_KEYS.dailyGoalSeconds,
    SETTING_KEYS.dayStartHour,
    SETTING_KEYS.buttonColor,
    SETTING_KEYS.rewardColor,
    SETTING_KEYS.sessionSize,
    SETTING_KEYS.readingTextScale,
    SETTING_KEYS.readingAid,
    SETTING_KEYS.lastAutoSyncedAt,
  ])
  return {
    dailyGoalSeconds: parseDailyGoalSeconds(map.get(SETTING_KEYS.dailyGoalSeconds)),
    dayStartHour: parseDayStartHour(map.get(SETTING_KEYS.dayStartHour)),
    buttonColor: parseButtonColor(map.get(SETTING_KEYS.buttonColor)),
    rewardColor: parseRewardColor(map.get(SETTING_KEYS.rewardColor)),
    sessionSize: parseSessionSize(map.get(SETTING_KEYS.sessionSize)),
    readingTextScale: parseReadingTextScale(map.get(SETTING_KEYS.readingTextScale)),
    readingAid: parseReadingAid(map.get(SETTING_KEYS.readingAid)),
    lastAutoSyncedAt: map.get(SETTING_KEYS.lastAutoSyncedAt) ?? null,
  }
}

/**
 * Batched equivalent of the 2-key Promise.all in lib/dashboard.ts getActivityData().
 */
export async function getActivitySettings(): Promise<{
  dailyGoalSeconds: number
  dayStartHour: number
}> {
  const map = await getSettings([SETTING_KEYS.dailyGoalSeconds, SETTING_KEYS.dayStartHour])
  return {
    dailyGoalSeconds: parseDailyGoalSeconds(map.get(SETTING_KEYS.dailyGoalSeconds)),
    dayStartHour: parseDayStartHour(map.get(SETTING_KEYS.dayStartHour)),
  }
}

/**
 * Bump the `studyCacheVersion` change token — the single writer of the
 * Setting row that lib/study-cache.ts's in-memory invariant snapshot uses to
 * decide whether it is stale (Phase 32, STUDY-03).
 *
 * This is deliberately an OPAQUE change token compared only for inequality —
 * `${Date.now()}-${randomSuffix}` — NOT the monotonic counter Phase 33's
 * VERS-01 will introduce for the freshness backstop. A plain upsert (not a
 * read-modify-write increment) is used specifically so two concurrent bumps
 * (e.g. a sync and a relink landing in the same request) can never lose a
 * change to a lost-update race: whichever upsert lands last simply wins with
 * its own fresh token, and any caller-held stale token still compares unequal
 * to it.
 *
 * Called unconditionally from lib/sync.ts:runSync() and
 * lib/relink-dependencies.ts:relinkAllDependencies() — the only two mutating
 * code paths that create/change CardDependency edges or the normalizedFront
 * lemma set. Never called from PUT /api/settings.
 */
export async function bumpStudyCacheVersion(): Promise<string> {
  const token = `${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`
  await prisma.setting.upsert({
    where: { key: STUDY_CACHE_VERSION_KEY },
    create: { key: STUDY_CACHE_VERSION_KEY, value: token },
    update: { value: token },
  })
  return token
}
