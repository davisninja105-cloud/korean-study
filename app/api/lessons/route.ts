import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const lessons = await prisma.lesson.findMany({
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      orderIndex: true,
      title: true,
      createdAt: true,
      _count: { select: { cards: true } },
    },
  })
  return NextResponse.json(lessons)
}
