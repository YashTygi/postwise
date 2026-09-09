import { db } from '@/lib/db'
import { posts } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { currentUser } from '@/lib/auth'
import { SubmitButton } from '@/components/submit-button'
import { saveEdit, setStatus } from './actions'

export const dynamic = 'force-dynamic'

export default async function PostsPage() {
  const { profile } = await currentUser()
  const rows = await db.select().from(posts)
    .where(eq(posts.userId, profile.id))
    .orderBy(desc(posts.createdAt))
    .limit(50)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium">Drafts</h1>
        <p className="text-sm text-muted-foreground">
          Edit here rather than in Telegram — your edits train the next batch.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No drafts yet. Send <code>/post</code> to the bot to generate this week&apos;s angles.
        </p>
      )}

      <div className="space-y-4">
        {rows.map(p => (
          <div key={p.id} className="rounded-xl border bg-white dark:bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground">{p.theme ?? 'Untitled'}</span>
              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{p.platform}</span>
              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{p.status}</span>
              {(p.rewriteCount ?? 0) > 0 && <span>{p.rewriteCount} rewrites</span>}
              <span className="ml-auto">week of {p.weekOf}</span>
            </div>

            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{p.content}</p>

            <form action={saveEdit} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <textarea
                name="editedContent"
                defaultValue={p.editedContent ?? ''}
                rows={6}
                placeholder="Your edited version — this is what gets used as a style example next time."
                className="w-full rounded-lg border bg-transparent p-3 text-sm"
              />
              <SubmitButton className="text-xs rounded-lg border px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" pendingText="Saving…">
                Save edit
              </SubmitButton>
            </form>

            <div className="flex gap-2">
              {['approved', 'posted', 'rejected'].map(s => (
                <form key={s} action={setStatus}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="status" value={s} />
                  <SubmitButton className="text-xs rounded-lg border px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 capitalize">
                    {s}
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
