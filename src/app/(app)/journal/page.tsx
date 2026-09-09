import { db } from '@/lib/db'
import { dailyEntries } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function JournalPage() {
  const { profile } = await currentUser()
  const rows = await db.select().from(dailyEntries)
    .where(eq(dailyEntries.userId, profile.id))
    .orderBy(desc(dailyEntries.createdAt))
    .limit(120)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Journal</h1>
        <p className="text-sm text-muted-foreground">
          The asset. Everything else in here is decoration on top of it.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Send <code>/ask</code> to the bot to get today&apos;s question now.
        </p>
      )}

      <div className="space-y-3">
        {rows.map(e => (
          <div key={e.id} className="rounded-xl border bg-white dark:bg-zinc-900 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{e.entryDate}</span>
              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{e.entryType}</span>
              {e.source === 'voice' && <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">voice</span>}
              {!e.rawInput && <span className="text-amber-600">awaiting reply</span>}
            </div>
            {e.promptAsked && <p className="text-sm text-muted-foreground italic">{e.promptAsked}</p>}
            {e.rawInput && <p className="text-sm whitespace-pre-wrap">{e.rawInput}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
