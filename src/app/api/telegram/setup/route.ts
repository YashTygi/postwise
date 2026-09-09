import { NextResponse } from 'next/server'
import { setWebhook } from '@/lib/telegram'

// Run once after deploy: GET /api/telegram/setup?secret=$CRON_SECRET
export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const target = `${process.env.NEXT_PUBLIC_SITE_URL}/api/telegram`
  await setWebhook(target, process.env.TELEGRAM_WEBHOOK_SECRET!)
  return NextResponse.json({ ok: true, webhook: target })
}
