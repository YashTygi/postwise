import { db } from '@/lib/db'
import { trendItems } from '@/lib/db/schema'
import { and, desc, eq, gte } from 'drizzle-orm'
import { askJson } from '@/lib/ai'
import { recentCommits, summarizeCommits } from './github'

type Raw = { url: string; title: string; source: string; summary?: string }

// HubSpot's blog is marketing content — useless for frontend. These are the
// feeds that actually carry the signal, and all of them are free and keyless.
const RSS_FEEDS = [
  'https://web.dev/static/blog/feed.xml',
  'https://vercel.com/atom',
  'https://www.joshwcomeau.com/rss.xml',
  'https://kentcdodds.com/blog/rss.xml',
  'https://www.smashingmagazine.com/feed/',
  'https://css-tricks.com/feed/',
]

const get = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers: { 'user-agent': 'postwise/1.0', ...headers }, cache: 'no-store' })

async function hackerNews(): Promise<Raw[]> {
  const r = await get('https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E40&hitsPerPage=40')
  const d = await r.json()
  return (d.hits ?? [])
    .filter((h: { url?: string; title?: string }) => h.url && h.title)
    .map((h: { url: string; title: string; points: number }) => ({
      url: h.url, title: h.title, source: 'hackernews', summary: `${h.points} points on HN`,
    }))
}

async function devTo(): Promise<Raw[]> {
  const out: Raw[] = []
  for (const tag of ['webdev', 'react', 'javascript']) {
    const r = await get(`https://dev.to/api/articles?tag=${tag}&top=2&per_page=10`)
    const d = await r.json()
    for (const a of d ?? []) {
      out.push({ url: a.url, title: a.title, source: 'devto', summary: a.description })
    }
  }
  return out
}

// Reddit's JSON API 403s from datacenter IPs (so, from Vercel). Its .rss feed
// does not, given a browser user-agent — same content, one fewer blocker.
const BROWSER_UA = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
}
const SUBREDDITS = ['webdev', 'reactjs', 'javascript']

async function lobsters(): Promise<Raw[]> {
  const r = await get('https://lobste.rs/t/javascript,web.json')
  const d = await r.json()
  return (d ?? []).slice(0, 20).map((s: { title: string; url: string; comments_url: string; score: number }) => ({
    url: s.url || s.comments_url,
    title: s.title,
    source: 'lobsters',
    summary: `${s.score} points on Lobsters`,
  }))
}

// ponytail: 12 lines of regex beats adding an RSS parser dependency. These are
// six known-good feeds, not arbitrary user input.
async function rss(feed: string, label?: string, headers?: Record<string, string>): Promise<Raw[]> {
  const r = await get(feed, headers)
  const xml = await r.text()
  const source = label ?? `rss:${new URL(feed).hostname.replace('www.', '')}`
  const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? []
  return items.slice(0, 8).flatMap(block => {
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
    const link =
      block.match(/<link[^>]*href="([^"]+)"/)?.[1] ??
      block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
    return title && link ? [{ url: link, title, source }] : []
  })
}

/**
 * Fetch every source, score the batch against what the user has actually been
 * committing, and store. A React Server Components article matters if you have
 * been in `app/` all week; it is noise if you have been writing Vue.
 */
export async function ingestTrends(userId: string): Promise<number> {
  const results = await Promise.allSettled([
    hackerNews(),
    devTo(),
    lobsters(),
    ...SUBREDDITS.map(s => rss(`https://www.reddit.com/r/${s}/.rss`, 'reddit', BROWSER_UA)),
    ...RSS_FEEDS.map(f => rss(f)),
  ])

  // Round-robin across sources before capping. Straight concatenation let
  // Hacker News + dev.to + Lobsters fill the 80-item budget on their own, so
  // reddit and all six curated blogs — the highest-signal feeds — never landed.
  const groups = results.filter(r => r.status === 'fulfilled').map(r => r.value)
  const byUrl = new Map<string, Raw>()
  for (let i = 0; groups.some(g => g[i]); i++) {
    for (const g of groups) {
      const item = g[i]
      if (item?.url) byUrl.set(item.url, item)
    }
  }

  const existing = await db
    .select({ url: trendItems.url })
    .from(trendItems)
    .where(eq(trendItems.userId, userId))
  for (const e of existing) byUrl.delete(e.url)

  const candidates = [...byUrl.values()].slice(0, 80)
  if (candidates.length === 0) return 0

  const since = new Date(Date.now() - 14 * 864e5)
  const work = summarizeCommits(await recentCommits(userId, since))

  // One call scores the whole batch. Cheaper and smarter than a keyword matcher.
  let scores: Record<string, { score: number; reason: string }> = {}
  try {
    const out = await askJson<{ i: number; score: number; reason: string }[]>(`
You score tech articles for relevance to ONE specific developer.

What they have actually been building (last 14 days of commits):
${work || '(no commit history yet — score on general frontend relevance)'}

Score each article 0-100 on how useful it is TO THIS PERSON specifically.
High = touches their stack, their current problems, or a next step from where they are.
Low = unrelated stack, generic career content, marketing, or news with no technical substance.

Articles:
${candidates.map((c, i) => `${i}. ${c.title}`).join('\n')}

Return JSON: [{"i": <index>, "score": <0-100>, "reason": "<max 12 words>"}] for every article.`)
    scores = Object.fromEntries(out.map(o => [String(o.i), { score: o.score, reason: o.reason }]))
  } catch {
    // Scoring is an enhancement, not a gate. Store unscored rather than lose the fetch.
  }

  await db
    .insert(trendItems)
    .values(
      candidates.map((c, i) => ({
        userId,
        url: c.url,
        title: c.title.slice(0, 500),
        source: c.source,
        summary: c.summary?.slice(0, 1000),
        score: scores[String(i)]?.score ?? 0,
        reason: scores[String(i)]?.reason,
      })),
    )
    .onConflictDoNothing()

  return candidates.length
}

/** Highest-scoring items not yet acted on. */
export function topTrends(userId: string, limit = 10) {
  return db
    .select()
    .from(trendItems)
    .where(and(eq(trendItems.userId, userId), eq(trendItems.status, 'new')))
    .orderBy(desc(trendItems.score))
    .limit(limit)
}

export function trendsSince(userId: string, since: Date) {
  return db
    .select()
    .from(trendItems)
    .where(and(eq(trendItems.userId, userId), gte(trendItems.fetchedAt, since)))
    .orderBy(desc(trendItems.score))
}
