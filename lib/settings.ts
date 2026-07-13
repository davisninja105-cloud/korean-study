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

// Single source of truth for every Setting-table key name, exported so batched
// call sites (app/layout.tsx, app/api/settings/route.ts, lib/dashboard.ts) can
// build their `keys` array from these instead of re-typing string literals.
export const SETTING_KEYS = {
  dailyGoalSeconds: GOAL_KEY,
  dayStartHour: DAY_START_KEY,
  buttonColor: BUTTON_COLOR_KEY,
  rewardColor: REWARD_COLOR_KEY,
  sessionSize: SESSION_SIZE_KEY,
  readingTextScale: READING_SCALE_KEY,
  readingAid: READING_AID_KEY,
  lastAutoSyncedAt: LAST_AUTO_SYNCED_KEY,
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

function parseSessionSize(raw: string | undefined): number {
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
 * Batched equivalent of Promise.all([getButtonColor(), getRewardColor(),
 * getReadingTextScale(), getReadingAid()]) — the exact 4 keys app/layout.tsx
 * reads on every route render. One findMany instead of 4 findUnique calls.
 * Mirrors getButtonColor/getRewardColor's try/catch resilience: on any
 * failure (including partial-batch failure — a single query either succeeds
 * or throws) all four values degrade to their individual defaults, matching
 * what independent per-key failures would have produced.
 */
export async function getLayoutSettings(): Promise<{
  buttonColor: string
  rewardColor: string
  readingTextScale: number
  readingAid: boolean
}> {
  try {
    const map = await getSettings([
      SETTING_KEYS.buttonColor,
      SETTING_KEYS.rewardColor,
      SETTING_KEYS.readingTextScale,
      SETTING_KEYS.readingAid,
    ])
    return {
      buttonColor: parseButtonColor(map.get(SETTING_KEYS.buttonColor)),
      rewardColor: parseRewardColor(map.get(SETTING_KEYS.rewardColor)),
      readingTextScale: parseReadingTextScale(map.get(SETTING_KEYS.readingTextScale)),
      readingAid: parseReadingAid(map.get(SETTING_KEYS.readingAid)),
    }
  } catch (err) {
    console.error('Failed to read layout settings:', err)
    return {
      buttonColor: DEFAULT_ACTION_COLOR,
      rewardColor: DEFAULT_REWARD_COLOR,
      readingTextScale: 1,
      readingAid: false,
    }
  }
}

/**
 * Batched equivalent of the 8-key Promise.all in GET /api/settings.
 * lastAutoSyncedAt is a raw pass-through (null if absent) — no parse function
 * needed, matching getLastAutoSyncedAt()'s existing contract.
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
  const map = await getSettings(Object.values(SETTING_KEYS))
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
