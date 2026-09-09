import { db } from '@/lib/db'
import { commits } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'

const GH = 'https://api.github.com'

// Authenticated requests get 5000/hr instead of 60, and — because you are
// authenticating AS yourself — private repo events show up too.
const headers = () => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'postwise',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
})

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
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
  return top?.[0] ?? null
}

type Repo = { full_name: string; pushed_at: string; private: boolean }
type ListedCommit = { sha: string; commit: { message: string; author: { date: string } } }

async function gh<T>(path: string): Promise<T | null> {
  const res = await fetch(`${GH}${path}`, { headers: headers(), cache: 'no-store' })
  return res.ok ? (res.json() as Promise<T>) : null
}

/**
 * Pull recent commits into the `commits` table.
 *
 * Uses /user/repos rather than the public events feed: the events feed drops
 * private-repo activity and frequently ships PushEvents with an empty commits
 * payload, so for anyone whose work is private it reports nothing. Needs
 * GITHUB_TOKEN with `repo` scope.
 */
export async function ingestCommits(userId: string, username: string, days = 3): Promise<number> {
  const since = new Date(Date.now() - days * 864e5)
  const iso = since.toISOString()

  const repos = await gh<Repo[]>('/user/repos?sort=pushed&per_page=30&affiliation=owner,collaborator,organization_member')
  if (!repos) throw new Error('github /user/repos failed — is GITHUB_TOKEN set with `repo` scope?')

  // Only repos actually touched in the window; the list is push-sorted, so stop early.
  const active = repos.filter(r => new Date(r.pushed_at) >= since).slice(0, 10)
  if (active.length === 0) return 0

  const listed = (await Promise.all(
    active.map(async r => {
      const rows = await gh<ListedCommit[]>(
        `/repos/${r.full_name}/commits?author=${username}&since=${iso}&per_page=30`)
      return (rows ?? []).map(c => ({ sha: c.sha, repo: r.full_name, at: c.commit.author.date }))
    }),
  )).flat()
  if (listed.length === 0) return 0

  const known = await db
    .select({ sha: commits.sha })
    .from(commits)
    .where(and(eq(commits.userId, userId), inArray(commits.sha, listed.map(c => c.sha))))
  const knownShas = new Set(known.map(k => k.sha))

  // ponytail: cap detail fetches per run. 30 commits is already a heavy few
  // days; raise it if you routinely blow past that.
  const fresh = listed.filter(c => !knownShas.has(c.sha)).slice(0, 30)
  if (fresh.length === 0) return 0

  const rows = await Promise.all(
    fresh.map(async c => {
      const d = await gh<{
        commit: { message: string; author: { date: string } }
        files?: { filename: string }[]
        stats?: { additions: number; deletions: number }
        html_url: string
      }>(`/repos/${c.repo}/commits/${c.sha}`)
      if (!d) return null
      const files = (d.files ?? []).map(f => f.filename)
      return {
        userId,
        sha: c.sha,
        repo: c.repo,
        message: (d.commit?.message ?? '').slice(0, 2000),
        files,
        additions: d.stats?.additions ?? 0,
        deletions: d.stats?.deletions ?? 0,
        language: dominantLanguage(files),
        url: d.html_url,
        committedAt: new Date(d.commit?.author?.date ?? c.at),
      }
    }),
  )

  const inserts = rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[]
  if (inserts.length === 0) return 0

  await db.insert(commits).values(inserts).onConflictDoNothing()
  return inserts.length
}

/** Commits since a cutoff, newest first — the raw material for every prompt. */
export function recentCommits(userId: string, since: Date) {
  return db
    .select()
    .from(commits)
    .where(and(eq(commits.userId, userId), gte(commits.committedAt, since)))
    .orderBy(desc(commits.committedAt))
}

/** Compact one-line-per-commit rendering for LLM prompts. */
export function summarizeCommits(rows: { repo: string; message: string; files: unknown; additions: number | null; deletions: number | null }[]) {
  return rows
    .map(c => {
      const files = ((c.files as string[]) ?? []).slice(0, 6).join(', ')
      return `- [${c.repo}] ${c.message.split('\n')[0]} (+${c.additions}/-${c.deletions}) ${files}`
    })
    .join('\n')
}
