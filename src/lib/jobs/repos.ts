import { db } from '@/lib/db'
import { repos, type GithubAccount } from '@/lib/db/schema'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { askJson } from '@/lib/ai'
import { gh, recentRepos } from './github'
import { tokenFor } from './accounts'

export type RepoSummary = {
  purpose: string      // one sentence: what this project is
  stack: string[]
  notable: string[]    // interesting technical decisions or problems
  postAngles: string[] // things worth writing about
}

/** README text, truncated. Returns '' when there isn't one. */
async function readme(fullName: string, token?: string): Promise<string> {
  const d = await gh<{ content?: string; encoding?: string }>(`/repos/${fullName}/readme`, token)
  if (!d?.content) return ''
  const text = Buffer.from(d.content, d.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
  return text.slice(0, 6000)
}

/**
 * Understand a repo well enough to write about it.
 *
 * Confidential accounts send metadata only — name, language, topics. Their
 * README never leaves your infrastructure, because it is your employer's, not
 * yours, and this pipeline's output is public posts.
 */
async function summarize(r: {
  full_name: string; description: string | null; language: string | null; topics?: string[]
}, body: string, confidential: boolean): Promise<RepoSummary> {
  return askJson<RepoSummary>(`Summarise this repository so someone can write about the work.

Name: ${confidential ? '(withheld — confidential project)' : r.full_name}
Description: ${r.description ?? '(none)'}
Primary language: ${r.language ?? 'unknown'}
Topics: ${(r.topics ?? []).join(', ') || '(none)'}
${body ? `\nREADME:\n${body}` : '\n(README withheld — confidential project, judge from metadata alone)'}

Return JSON:
{
  "purpose": "one sentence on what this project is and who it is for",
  "stack": ["concrete technologies actually used"],
  "notable": ["technical decisions or problems worth discussing, max 4"],
  "postAngles": ["specific things worth writing a post about, max 4"]
}
${confidential ? '\nThis is confidential work. Never name the company, client, product or repo. Describe the technical shape of the work only.' : ''}`)
}

// drizzle wants the EXCLUDED reference spelled out for upserts
const sqlExcluded = (col: string) => sql.raw(`excluded.${col}`)

/**
 * Sync repos touched in the last `days` and summarise the ones that changed.
 * A repo whose pushed_at is unchanged since the last summary is skipped.
 */
export async function ingestRepos(userId: string, account: GithubAccount, days = 90): Promise<number> {
  const token = tokenFor(account.label)
  const found = await recentRepos(account, days)
  if (found.length === 0) return 0

  const existing = await db.select({ fullName: repos.fullName, summaryOfSha: repos.summaryOfSha })
    .from(repos).where(eq(repos.userId, userId))
  const seen = new Map(existing.map(e => [e.fullName, e.summaryOfSha]))

  // Metadata upsert is cheap; do all of them.
  await db.insert(repos).values(found.map(r => ({
    userId,
    accountId: account.id,
    fullName: r.full_name,
    description: r.description,
    language: r.language,
    topics: r.topics ?? [],
    isPrivate: r.private,
    confidential: account.confidential,
    pushedAt: new Date(r.pushed_at),
    lastSyncedAt: new Date(),
  }))).onConflictDoUpdate({
    target: [repos.userId, repos.fullName],
    set: {
      description: sqlExcluded('description'),
      language: sqlExcluded('language'),
      pushedAt: sqlExcluded('pushed_at'),
      lastSyncedAt: new Date(),
    },
  })

  // ponytail: summarising is the expensive half — 4 per run keeps the cron
  // inside its 60s budget, and unchanged repos are skipped entirely, so a
  // backlog drains over a few days and then costs nothing.
  const stale = found.filter(r => seen.get(r.full_name) !== r.pushed_at).slice(0, 4)
  let summarised = 0
  for (const r of stale) {
    try {
      const body = account.confidential ? '' : await readme(r.full_name, token)
      const summary = await summarize(r, body, account.confidential)
      await db.update(repos)
        .set({ summary, summaryOfSha: r.pushed_at })
        .where(and(eq(repos.userId, userId), eq(repos.fullName, r.full_name)))
      summarised++
    } catch (err) {
      console.error(`repo summary failed for ${r.full_name}:`, err)
    }
  }
  return summarised
}

export function recentReposFor(userId: string, days = 90) {
  return db.select().from(repos)
    .where(and(eq(repos.userId, userId), gte(repos.pushedAt, new Date(Date.now() - days * 864e5))))
    .orderBy(desc(repos.pushedAt))
}

/** Repo context block for prompts, confidentiality respected. */
export async function repoContext(userId: string, days = 90, limit = 8) {
  const rows = (await recentReposFor(userId, days)).slice(0, limit)
  if (rows.length === 0) return ''
  return 'PROJECTS YOU HAVE BEEN WORKING ON:\n' + rows.map(r => {
    const s = r.summary as RepoSummary | null
    const name = r.confidential ? '(confidential work project)' : r.fullName
    if (!s) return `- ${name}: ${r.description ?? r.language ?? 'no description'}`
    return `- ${name} — ${s.purpose}\n  stack: ${(s.stack ?? []).join(', ')}\n  notable: ${(s.notable ?? []).join('; ')}\n  angles: ${(s.postAngles ?? []).join('; ')}`
  }).join('\n')
}
