import { db } from '@/lib/db'
import { commits, type GithubAccount } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { tokenFor } from './accounts'

export const GH = 'https://api.github.com'

export const ghHeaders = (token?: string) => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'postwise',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

export async function gh<T>(path: string, token?: string): Promise<T | null> {
  const res = await fetch(`${GH}${path}`, { headers: ghHeaders(token), cache: 'no-store' })
  return res.ok ? (res.json() as Promise<T>) : null
}

const EXT_LANG: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
  swift: 'Swift', dart: 'Dart', rb: 'Ruby', php: 'PHP', css: 'CSS',
  scss: 'CSS', html: 'HTML', sql: 'SQL', sh: 'Shell', yml: 'Config',
  yaml: 'Config', json: 'Config', md: 'Docs',
}

function dominantLanguage(files: string[]): string | null {
  const tally: Record<string, number> = {}
  for (const f of files) {
    const lang = EXT_LANG[f.split('.').pop()?.toLowerCase() ?? '']
    if (lang) tally[lang] = (tally[lang] ?? 0) + 1
  }
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export type GhRepo = {
  full_name: string; description: string | null; language: string | null
  topics?: string[]; private: boolean; pushed_at: string; fork: boolean
}

/** Repos this account touched inside the window, most recently pushed first. */
export async function recentRepos(account: GithubAccount, days: number): Promise<GhRepo[]> {
  const token = tokenFor(account.label)
  const since = new Date(Date.now() - days * 864e5)
  const rows = await gh<GhRepo[]>(
    '/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member', token)
  if (!rows) throw new Error(`github /user/repos failed for "${account.label}" — check its token`)
  return rows.filter(r => !r.fork && new Date(r.pushed_at) >= since)
}

/**
 * Pull recent commits for one account.
 *
 * Uses /user/repos rather than the public events feed: that feed drops
 * private-repo activity and often ships PushEvents with an empty commits
 * payload, so for anyone whose work is private it reports nothing.
 */
export async function ingestCommits(userId: string, account: GithubAccount, days = 3): Promise<number> {
  const token = tokenFor(account.label)
  const iso = new Date(Date.now() - days * 864e5).toISOString()
  const active = (await recentRepos(account, days)).slice(0, 10)
  if (active.length === 0) return 0

  type Listed = { sha: string; commit: { message: string; author: { date: string } } }
  const listed = (await Promise.all(
    active.map(async r => {
      const rows = await gh<Listed[]>(
        `/repos/${r.full_name}/commits?author=${account.username}&since=${iso}&per_page=30`, token)
      return (rows ?? []).map(c => ({ sha: c.sha, repo: r.full_name, at: c.commit.author.date }))
    }),
  )).flat()
  if (listed.length === 0) return 0

  const known = await db.select({ sha: commits.sha }).from(commits)
    .where(and(eq(commits.userId, userId), inArray(commits.sha, listed.map(c => c.sha))))
  const knownShas = new Set(known.map(k => k.sha))

  // ponytail: cap detail fetches per run. Raise it if you routinely commit more.
  const fresh = listed.filter(c => !knownShas.has(c.sha)).slice(0, 30)
  if (fresh.length === 0) return 0

  const rows = await Promise.all(fresh.map(async c => {
    const d = await gh<{
      commit: { message: string; author: { date: string } }
      files?: { filename: string }[]
      stats?: { additions: number; deletions: number }
      html_url: string
    }>(`/repos/${c.repo}/commits/${c.sha}`, token)
    if (!d) return null
    const files = (d.files ?? []).map(f => f.filename)
    return {
      userId,
      accountId: account.id,
      sha: c.sha,
      repo: c.repo,
      confidential: account.confidential,
      message: (d.commit?.message ?? '').slice(0, 2000),
      files,
      additions: d.stats?.additions ?? 0,
      deletions: d.stats?.deletions ?? 0,
      language: dominantLanguage(files),
      url: d.html_url,
      committedAt: new Date(d.commit?.author?.date ?? c.at),
    }
  }))

  const inserts = rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[]
  if (inserts.length === 0) return 0
  await db.insert(commits).values(inserts).onConflictDoNothing()
  return inserts.length
}

export function recentCommits(userId: string, since: Date) {
  return db.select().from(commits)
    .where(and(eq(commits.userId, userId), gte(commits.committedAt, since)))
    .orderBy(desc(commits.committedAt))
}

/**
 * Compact rendering for prompts. Commits from a confidential account are
 * stripped of repo name and file paths — only the shape of the work survives.
 */
export function summarizeCommits(rows: {
  repo: string; message: string; files: unknown
  additions: number | null; deletions: number | null; confidential?: boolean
}[]) {
  return rows.map(c => {
    const subject = c.message.split('\n')[0]
    if (c.confidential) return `- [work project] ${subject} (+${c.additions}/-${c.deletions})`
    const files = ((c.files as string[]) ?? []).slice(0, 6).join(', ')
    return `- [${c.repo}] ${subject} (+${c.additions}/-${c.deletions}) ${files}`
  }).join('\n')
}
