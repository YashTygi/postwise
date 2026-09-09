import { db } from '@/lib/db'
import { commits, dailyEntries, trendItems } from '@/lib/db/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { currentUser } from '@/lib/auth'
import { SubmitButton } from '@/components/submit-button'
import { compose } from './actions'

export const dynamic = 'force-dynamic'

const box = 'rounded-xl border bg-white dark:bg-zinc-900 p-4 space-y-2'
const list = 'max-h-64 overflow-y-auto space-y-1 pr-1'

function Row({ name, value, title, meta }: { name: string; value: string; title: string; meta?: string }) {
  return (
    <label className="flex gap-2 items-start text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded px-1 py-1">
      <input type="checkbox" name={name} value={value} className="mt-1 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{title}</span>
        {meta && <span className="block text-xs text-muted-foreground truncate">{meta}</span>}
      </span>
    </label>
  )
}

export default async function ComposePage() {
  const { profile } = await currentUser()
  const uid = profile.id

  const [commitRows, entryRows, trendRows] = await Promise.all([
    db.select().from(commits).where(eq(commits.userId, uid))
      .orderBy(desc(commits.committedAt)).limit(40),
    db.select().from(dailyEntries)
      .where(and(eq(dailyEntries.userId, uid), isNotNull(dailyEntries.rawInput)))
      .orderBy(desc(dailyEntries.createdAt)).limit(40),
    db.select().from(trendItems).where(eq(trendItems.userId, uid))
      .orderBy(desc(trendItems.score)).limit(40),
  ])

  return (
    <form action={compose} className="space-y-5">
      <div>
        <h1 className="text-lg font-medium">Compose</h1>
        <p className="text-sm text-muted-foreground">
          Say what you want, tick the raw material it should be built from. Leave
          everything unticked and it uses the whole week.
        </p>
      </div>

      <div className={box}>
        <textarea
          name="brief"
          rows={3}
          required
          placeholder="e.g. a post about the caching bug in the dashboard and why stale-while-revalidate made it worse"
          className="w-full rounded-lg border bg-transparent p-3 text-sm"
        />
        <div className="flex items-center gap-3">
          <select name="platform" defaultValue="linkedin" className="rounded-lg border bg-transparent px-3 py-2 text-sm">
            <option value="linkedin">LinkedIn post</option>
            <option value="twitter">Twitter thread</option>
            <option value="blog">Blog outline</option>
          </select>
          <SubmitButton
            className="text-sm rounded-lg border px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            pendingText="Writing your post…"
          >
            Generate
          </SubmitButton>
          <span className="text-xs text-muted-foreground">Takes ~20s, lands in Drafts and Telegram.</span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className={box}>
          <p className="text-sm font-medium">Commits</p>
          <div className={list}>
            {commitRows.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            {commitRows.map(c => (
              <Row key={c.id} name="commits" value={c.id}
                title={c.message.split('\n')[0]}
                meta={`${c.confidential ? 'work project' : c.repo} · +${c.additions}/−${c.deletions}`} />
            ))}
          </div>
        </div>

        <div className={box}>
          <p className="text-sm font-medium">Journal</p>
          <div className={list}>
            {entryRows.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            {entryRows.map(e => (
              <Row key={e.id} name="entries" value={e.id}
                title={(e.rawInput ?? '').slice(0, 70)} meta={`${e.entryDate} · ${e.entryType}`} />
            ))}
          </div>
        </div>

        <div className={box}>
          <p className="text-sm font-medium">Articles</p>
          <div className={list}>
            {trendRows.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            {trendRows.map(t => (
              <Row key={t.id} name="trends" value={t.id} title={t.title} meta={`${t.source} · score ${t.score}`} />
            ))}
          </div>
        </div>
      </div>
    </form>
  )
}
