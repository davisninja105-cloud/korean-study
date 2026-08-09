import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  return NextResponse.json({ version })
}
