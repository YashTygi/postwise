import { NextResponse } from 'next/server'
import { extractPendingDna } from '@/lib/jobs/style'

export const maxDuration = 60

export async function POST(req: Request) {
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 })
  const count = await extractPendingDna(userId)
  return NextResponse.json({ ok: true, processed: count })
}
