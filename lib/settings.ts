import { prisma } from '@/lib/prisma'
import { DEFAULT_GOAL_SECONDS, DEFAULT_DAY_START_HOUR } from '@/lib/habit'

const GOAL_KEY = 'dailyGoalSeconds'
const DAY_START_KEY = 'habitDayStartHour'

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
