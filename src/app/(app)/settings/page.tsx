import { db } from '@/lib/db'
import { githubAccounts, styleReferences } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { currentUser } from '@/lib/auth'
import { SubmitButton } from '@/components/submit-button'
import { addGithubAccount, addStyleSet, deleteStyleSet, removeGithubAccount, saveSettings, unlinkTelegram } from './actions'
import { missingTokenFor, tokenFor } from '@/lib/jobs/accounts'

export const dynamic = 'force-dynamic'

const field = 'w-full rounded-lg border bg-transparent px-3 py-2 text-sm'
const btn = 'text-xs rounded-lg border px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800'

export default async function SettingsPage() {
  const { profile } = await currentUser()
  const [refs, accounts] = await Promise.all([
    db.select().from(styleReferences)
      .where(eq(styleReferences.userId, profile.id))
      .orderBy(desc(styleReferences.createdAt)),
    db.select().from(githubAccounts)
      .where(eq(githubAccounts.userId, profile.id))
      .orderBy(desc(githubAccounts.createdAt)),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-medium">Settings</h1>

      {/* Telegram */}
      <section className="rounded-xl border bg-white dark:bg-zinc-900 p-5 space-y-3">
        <h2 className="text-sm font-medium">Telegram</h2>
        {profile.telegramChatId ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Linked to chat {profile.telegramChatId}.</p>
            <form action={unlinkTelegram}><SubmitButton className={btn} pendingText="Unlinking…">Unlink</SubmitButton></form>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Message your bot with:{' '}
            <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">
              /link {profile.telegramLinkCode}
            </code>
          </p>
        )}
      </section>

      {/* Profile + ingestion */}
      <section className="rounded-xl border bg-white dark:bg-zinc-900 p-5 space-y-3">
        <h2 className="text-sm font-medium">Profile &amp; ingestion</h2>
        <form action={saveSettings} className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">GitHub username</span>
            <input name="githubUsername" defaultValue={profile.githubUsername ?? ''} className={field} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Timezone</span>
            <input name="timezone" defaultValue={profile.timezone ?? 'Asia/Kolkata'} className={field} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Profession</span>
            <input name="profession" defaultValue={profile.profession ?? ''} className={field} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Target audience</span>
            <input name="targetAudience" defaultValue={profile.targetAudience ?? ''} className={field} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Content goal</span>
            <input name="contentGoal" defaultValue={profile.contentGoal ?? ''} className={field} />
          </label>
          <div className="sm:col-span-2"><SubmitButton className={btn} pendingText="Saving…">Save</SubmitButton></div>
        </form>
      </section>

      {/* GitHub accounts */}
      <section className="rounded-xl border bg-white dark:bg-zinc-900 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium">GitHub accounts</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Personal and work, each with its own token. Tokens are never stored here —
            each account reads <code>GITHUB_TOKEN_&lt;LABEL&gt;</code> from the environment.
            Mark work accounts <strong>confidential</strong> and their repo names, paths and
            README contents stay out of every prompt and every generated post.
          </p>
        </div>

        <div className="space-y-2">
          {accounts.map(a => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm flex-wrap">
              <span className="font-medium">{a.label}</span>
              <span className="text-muted-foreground">{a.username}</span>
              {a.confidential && (
                <span className="rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 text-xs">
                  confidential
                </span>
              )}
              {tokenFor(a.label)
                ? <span className="text-xs text-emerald-600">token found</span>
                : <span className="text-xs text-red-500">set {missingTokenFor(a)}</span>}
              <form action={removeGithubAccount} className="ml-auto">
                <input type="hidden" name="id" value={a.id} />
                <SubmitButton className={btn} pendingText="Removing…">Remove</SubmitButton>
              </form>
            </div>
          ))}
        </div>

        <form action={addGithubAccount} className="grid sm:grid-cols-3 gap-3 items-end">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Label</span>
            <input name="label" placeholder="work" className={field} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">GitHub username</span>
            <input name="username" placeholder="yash-at-company" className={field} required />
          </label>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" name="confidential" defaultChecked />
            <span>Confidential</span>
          </label>
          <div className="sm:col-span-3"><SubmitButton className={btn} pendingText="Adding…">Add account</SubmitButton></div>
        </form>
      </section>

      {/* Style sets */}
      <section className="rounded-xl border bg-white dark:bg-zinc-900 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium">Style sets</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Two different jobs. <strong>Positioning</strong> = people you want to become like; it decides
            what you write about. <strong>Craft</strong> = writing you admire; it decides how it reads.
            Paste posts separated by a line containing only <code>---</code>.
          </p>
        </div>

        <form action={addStyleSet} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input name="sourceLabel" placeholder="Label, e.g. Josh Comeau" className={field} />
            <select name="kind" className={field} defaultValue="craft">
              <option value="craft">Craft — how they write</option>
              <option value="positioning">Positioning — what they cover</option>
            </select>
          </div>
          <textarea name="pastedPosts" rows={8} className={field}
            placeholder={'Paste post 1\n\n---\n\nPaste post 2\n\n---\n\nPaste post 3'} />
          <SubmitButton className={btn} pendingText="Extracting rubric… (~15s)">Add set &amp; extract rubric</SubmitButton>
        </form>

        <div className="space-y-2">
          {refs.map(r => (
            <details key={r.id} className="rounded-lg border p-3">
              <summary className="text-sm cursor-pointer flex items-center gap-2 flex-wrap">
                <span className="font-medium">{r.sourceLabel}</span>
                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs">{r.kind}</span>
                <span className="text-xs text-muted-foreground">{r.postCount} posts · {r.dnaStatus}</span>
              </summary>
              <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                {JSON.stringify(r.styleDna, null, 2)}
              </pre>
              <form action={deleteStyleSet} className="mt-2">
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton className={btn} pendingText="Deleting…">Delete</SubmitButton>
              </form>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
