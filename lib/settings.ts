import { prisma } from '@/lib/prisma'
import { DEFAULT_GOAL_SECONDS, DEFAULT_DAY_START_HOUR, DEFAULT_SESSION_SIZE } from '@/lib/habit'

const GOAL_KEY = 'dailyGoalSeconds'
const DAY_START_KEY = 'habitDayStartHour'
const BUTTON_COLOR_KEY = 'buttonColor'
const SESSION_SIZE_KEY = 'sessionSize'

export const DEFAULT_BUTTON_COLOR = '#3b82f6'
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

export async function getButtonColor(): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: BUTTON_COLOR_KEY } })
    return row && HEX_RE.test(row.value) ? row.value : DEFAULT_BUTTON_COLOR
  } catch {
    return DEFAULT_BUTTON_COLOR
  }
}

export async function setButtonColor(hex: string): Promise<string> {
  const value = HEX_RE.test(hex) ? hex.toLowerCase() : DEFAULT_BUTTON_COLOR
  await prisma.setting.upsert({
    where: { key: BUTTON_COLOR_KEY },
    create: { key: BUTTON_COLOR_KEY, value },
    update: { value },
  })
  return value
}
