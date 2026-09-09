import { db } from '@/lib/db'
import { trendItems } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function TrendsPage() {
  const { profile } = await currentUser()
  const rows = await db.select().from(trendItems)
    .where(eq(trendItems.userId, profile.id))
    .orderBy(desc(trendItems.score), desc(trendItems.fetchedAt))
    .limit(100)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Trends</h1>
        <p className="text-sm text-muted-foreground">
          Scored against what you have actually been committing, not raw popularity.
        </p>
      </div>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing fetched yet.</p>}

      <div className="space-y-2">
        {rows.map(t => (
          <div key={t.id} className="rounded-lg border bg-white dark:bg-zinc-900 p-3 flex gap-3">
            <div className="shrink-0 w-10 text-center">
              <div className="text-sm font-medium tabular-nums">{t.score}</div>
              <div className="text-[10px] text-muted-foreground">score</div>
            </div>
            <div className="min-w-0 flex-1">
              <a href={t.url} target="_blank" rel="noreferrer" className="text-sm hover:underline block truncate">
                {t.title}
              </a>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>{t.source}</span>
                {t.reason && <span className="italic">{t.reason}</span>}
                {t.status !== 'new' && <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{t.status}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
