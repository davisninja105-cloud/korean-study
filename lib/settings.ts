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

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export async function getDailyGoalSeconds(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: GOAL_KEY } })
  const n = row ? parseInt(row.value, 10) : NaN
  return Number.isFinite(n) ? n : DEFAULT_GOAL_SECONDS
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
  const n = row ? parseInt(row.value, 10) : NaN
  return Number.isFinite(n) ? n : DEFAULT_DAY_START_HOUR
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
  const n = row ? parseInt(row.value, 10) : NaN
  return Number.isFinite(n) ? n : DEFAULT_SESSION_SIZE
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
  const n = row ? parseFloat(row.value) : NaN
  return Number.isFinite(n) ? Math.max(0.9, Math.min(1.4, n)) : 1
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
  return row?.value === '1'
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
    return row && HEX_RE.test(row.value) ? row.value : DEFAULT_ACTION_COLOR
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
    return row && HEX_RE.test(row.value) ? row.value : DEFAULT_REWARD_COLOR
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
