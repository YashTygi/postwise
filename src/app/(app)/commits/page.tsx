import { db } from '@/lib/db'
import { commits } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function CommitsPage() {
  const { profile } = await currentUser()
  const rows = await db.select().from(commits)
    .where(eq(commits.userId, profile.id))
    .orderBy(desc(commits.committedAt))
    .limit(150)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Commits</h1>
        <p className="text-sm text-muted-foreground">
          Pulled daily from GitHub. Messages, paths and line counts only — no diffs.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No commits ingested. Set your GitHub username on Settings, then wait for the daily run.
        </p>
      )}

      <div className="space-y-2">
        {rows.map(c => (
          <div key={c.id} className="rounded-lg border bg-white dark:bg-zinc-900 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 flex-wrap">
              <span className="font-mono">{c.repo}</span>
              {c.language && <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{c.language}</span>}
              <span className="text-emerald-600">+{c.additions}</span>
              <span className="text-red-500">−{c.deletions}</span>
              <span className="ml-auto">{c.committedAt.toLocaleDateString()}</span>
            </div>
            <a href={c.url ?? '#'} target="_blank" rel="noreferrer" className="text-sm hover:underline">
              {c.message.split('\n')[0]}
            </a>
            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
              {((c.files as string[]) ?? []).slice(0, 5).join('  ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
