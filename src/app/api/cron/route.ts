import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'
import { isNotNull } from 'drizzle-orm'
import { usableAccounts } from '@/lib/jobs/accounts'
import { ingestCommits } from '@/lib/jobs/github'
import { ingestRepos } from '@/lib/jobs/repos'
import { ingestTrends } from '@/lib/jobs/trends'
import { sendCheckin, sendOpinionPrompt } from '@/lib/jobs/checkin'
import { proposeAngles, topUpQueue } from '@/lib/jobs/weekly'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Vercel cron sends `Authorization: Bearer $CRON_SECRET` automatically.
// GitHub Actions sends `?secret=` — same check, either way in.
function authorized(req: Request) {
  return (
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` ||
    new URL(req.url).searchParams.get('secret') === process.env.CRON_SECRET
  )
}

// Split into three jobs rather than one: each has to finish inside the 60s
// function budget, and repo summarising plus draft generation together do not.
type Job = 'daily' | 'weekly' | 'drafts'

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const job = (new URL(req.url).searchParams.get('job') ?? 'daily') as Job
  const users = await db.select().from(userProfiles).where(isNotNull(userProfiles.telegramChatId))
  const log: Record<string, unknown>[] = []

  for (const user of users) {
    const entry: Record<string, unknown> = { user: user.email }
    try {
      if (job === 'weekly') {
        // Repo summaries live here, not in the daily run: a project's character
        // does not change day to day, and the free Gemini tier allows only 20
        // requests per day per model.
        for (const account of await usableAccounts(user.id)) {
          entry[`repos:${account.label}`] = await ingestRepos(user.id, account)
        }
        entry.angles = await proposeAngles(user)
      } else if (job === 'drafts') {
        entry.queue = await topUpQueue(user)
      } else {
        for (const account of await usableAccounts(user.id)) {
          entry[`commits:${account.label}`] = await ingestCommits(user.id, account)
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

  // Return 500 when any user's run errored. A 200 with the error buried in the
  // body makes the GitHub Actions step green, which is how a broken drafts job
  // ran unnoticed.
  const failed = log.filter(l => l.error)
  return NextResponse.json(
    { ok: failed.length === 0, job, ran: log },
    { status: failed.length ? 500 : 200 },
  )
}
