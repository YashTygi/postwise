import Link from 'next/link'
import { db } from '@/lib/db'
import { commits, dailyEntries, posts, styleReferences, trendItems } from '@/lib/db/schema'
import { and, count, desc, eq, gte, isNotNull } from 'drizzle-orm'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function Stat({ label, value, href, hint }: { label: string; value: number | string; href: string; hint?: string }) {
  return (
    <Link href={href} className="rounded-xl border bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 transition-colors">
      <p className="text-2xl font-medium tabular-nums">{value}</p>
      <p className="text-sm">{label}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Link>
  )
}

// Data loading lives outside the component: Date.now() during render trips
// React's purity rule, and this reads better anyway.
async function loadStats(uid: string) {
  const week = new Date(Date.now() - 7 * 864e5)
  const [[entryCount], [commitCount], [trendCount], [draftCount], styleSets, pending, latest] =
    await Promise.all([
      db.select({ n: count() }).from(dailyEntries)
        .where(and(eq(dailyEntries.userId, uid), isNotNull(dailyEntries.rawInput))),
      db.select({ n: count() }).from(commits)
        .where(and(eq(commits.userId, uid), gte(commits.committedAt, week))),
      db.select({ n: count() }).from(trendItems)
        .where(and(eq(trendItems.userId, uid), eq(trendItems.status, 'new'))),
      db.select({ n: count() }).from(posts)
        .where(and(eq(posts.userId, uid), eq(posts.status, 'pending_review'))),
      db.select().from(styleReferences).where(eq(styleReferences.userId, uid)),
      db.select().from(dailyEntries)
        .where(and(eq(dailyEntries.userId, uid), isNotNull(dailyEntries.promptAsked)))
        .orderBy(desc(dailyEntries.createdAt)).limit(1),
      db.select().from(dailyEntries)
        .where(and(eq(dailyEntries.userId, uid), isNotNull(dailyEntries.rawInput)))
        .orderBy(desc(dailyEntries.createdAt)).limit(3),
    ])
  return { entryCount, commitCount, trendCount, draftCount, styleSets, pending, latest }
}

export default async function DashboardPage() {
  const { profile } = await currentUser()
  const { entryCount, commitCount, trendCount, draftCount, styleSets, pending, latest } =
    await loadStats(profile.id)

  const setup = [
    { done: !!profile.telegramChatId, label: 'Link Telegram', href: '/settings' },
    { done: !!profile.githubUsername, label: 'Set GitHub username', href: '/settings' },
    { done: styleSets.some(s => s.kind === 'craft'), label: 'Add a craft style set', href: '/settings' },
    { done: styleSets.some(s => s.kind === 'positioning'), label: 'Add a positioning style set', href: '/settings' },
    { done: entryCount.n > 0, label: 'Answer your first check-in', href: '/journal' },
  ]
  const remaining = setup.filter(s => !s.done)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">{profile.fullName ?? profile.email}</h1>
        <p className="text-sm text-muted-foreground">
          {profile.linkedinHeadline ?? profile.profession ?? 'Set your profession on Settings'}
        </p>
      </div>

      {remaining.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4">
          <p className="text-sm font-medium mb-2">Finish setup ({setup.length - remaining.length}/{setup.length})</p>
          <ul className="space-y-1">
            {remaining.map(s => (
              <li key={s.label}>
                <Link href={s.href} className="text-sm underline underline-offset-4">{s.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Journal entries" value={entryCount.n} href="/journal" hint="all time" />
        <Stat label="Commits" value={commitCount.n} href="/commits" hint="last 7 days" />
        <Stat label="Trend items" value={trendCount.n} href="/trends" hint="unread" />
        <Stat label="Drafts" value={draftCount.n} href="/posts" hint="awaiting review" />
      </div>

      {pending[0] && !pending[0].rawInput && (
        <div className="rounded-xl border bg-white dark:bg-zinc-900 p-5">
          <p className="text-xs text-muted-foreground mb-2">Waiting on you in Telegram</p>
          <p className="text-sm">{pending[0].promptAsked}</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent entries</h2>
          <Link href="/journal" className="text-xs underline underline-offset-4 text-muted-foreground">All</Link>
        </div>
        {latest.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Send <code>/ask</code> to your bot to pull today&apos;s question.
          </p>
        ) : latest.map(e => (
          <div key={e.id} className="rounded-lg border bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs text-muted-foreground mb-1">{e.entryDate} · {e.entryType}</p>
            <p className="text-sm whitespace-pre-wrap line-clamp-4">{e.rawInput}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
