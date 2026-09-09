import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'
import { isNotNull } from 'drizzle-orm'
import { ingestCommits } from '@/lib/jobs/github'
import { ingestTrends } from '@/lib/jobs/trends'
import { sendCheckin, sendOpinionPrompt } from '@/lib/jobs/checkin'
import { proposeAngles } from '@/lib/jobs/weekly'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Vercel cron sends `Authorization: Bearer $CRON_SECRET` automatically.
// GitHub Actions sends `?secret=` — same check, either way in.
function authorized(req: Request) {
  const url = new URL(req.url)
  return (
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` ||
    url.searchParams.get('secret') === process.env.CRON_SECRET
  )
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const job = new URL(req.url).searchParams.get('job') ?? 'daily'
  const users = await db.select().from(userProfiles).where(isNotNull(userProfiles.telegramChatId))
  const log: Record<string, unknown>[] = []

  for (const user of users) {
    const entry: Record<string, unknown> = { user: user.email }
    try {
      if (job === 'weekly') {
        entry.angles = await proposeAngles(user)
      } else {
        if (user.githubUsername) {
          entry.commits = await ingestCommits(user.id, user.githubUsername)
        }
        entry.trends = await ingestTrends(user.id)
        entry.checkin = await sendCheckin(user)
        // Opinion pushes twice a week — more often and it becomes homework.
        const day = new Date().getUTCDay()
        if (day === 2 || day === 5) entry.opinion = await sendOpinionPrompt(user)
      }
    } catch (err) {
      entry.error = String(err)
      console.error(`cron ${job} failed for ${user.email}:`, err)
    }
    log.push(entry)
  }

  return NextResponse.json({ ok: true, job, ran: log })
}
