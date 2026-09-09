import { db } from '@/lib/db'
import { commits, dailyEntries, posts, trendItems, userProfiles, type UserProfile } from '@/lib/db/schema'
import { and, count, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import { QUALITY, ask, askJson } from '@/lib/ai'
import { send } from '@/lib/telegram'
import { recentCommits, summarizeCommits } from './github'
import { repoContext } from './repos'
import { styleBrief } from './style'
import { localDate } from './checkin'

export type Angle = { title: string; anchor: string; why: string }

/** Everything that happened this week, as one prompt block. */
async function weekContext(userId: string) {
  const since = new Date(Date.now() - 7 * 864e5)
  const [commitRows, entries] = await Promise.all([
    recentCommits(userId, since),
    db.select().from(dailyEntries).where(and(
      eq(dailyEntries.userId, userId),
      gte(dailyEntries.createdAt, since),
      isNotNull(dailyEntries.rawInput),
    )).orderBy(desc(dailyEntries.createdAt)),
  ])

  const journal = entries
    .map(e => `[${e.entryType}] Q: ${e.promptAsked ?? '(unprompted)'}\nA: ${e.rawInput}`)
    .join('\n\n')

  // A commit says "fixed jank on fast scroll". A repo says what the thing even
  // is. Posts need both, so the project layer goes in alongside.
  const projects = await repoContext(userId)

  return {
    commitRows,
    entries,
    text: [
      projects,
      `COMMITS THIS WEEK:\n${summarizeCommits(commitRows) || '(none)'}`,
      `JOURNAL + OPINIONS THIS WEEK:\n${journal || '(none)'}`,
    ].filter(Boolean).join('\n\n'),
  }
}

// Confidential work must never be nameable in output. This rides along with
// every generation prompt.
const CONFIDENTIALITY = `Anything marked confidential or "work project" must never be named:
no company, client, product, repo, file path or colleague. Write the technical
lesson in general terms instead. If an angle cannot survive that, drop it.`

/** Your last few edits, as few-shot examples of how the model gets it wrong. */
async function editPairs(userId: string) {
  const rows = await db
    .select({ content: posts.content, edited: posts.editedContent })
    .from(posts)
    .where(and(eq(posts.userId, userId), isNotNull(posts.editedContent)))
    .orderBy(desc(posts.createdAt))
    .limit(5)
  if (rows.length === 0) return ''
  return `\nHOW THIS USER EDITS DRAFTS (match the edited version, not the draft):\n${rows
    .map(r => `DRAFT: ${r.content}\nTHEIR EDIT: ${r.edited}`)
    .join('\n---\n')}`
}

/** Sunday: propose three angles, each anchored to something they actually did. */
export async function proposeAngles(user: UserProfile): Promise<'sent' | 'skipped'> {
  if (!user.telegramChatId) return 'skipped'
  const ctx = await weekContext(user.id)
  if (ctx.commitRows.length === 0 && ctx.entries.length === 0) {
    await send(user.telegramChatId, 'Quiet week — no commits or journal entries, so nothing to write from. Reply here any time with something you worked on.')
    return 'skipped'
  }

  const brief = await styleBrief(user.id)
  const angles = await askJson<Angle[]>(`You propose post angles for a developer building an audience.

${ctx.text}

${brief.text}

Profession: ${user.profession ?? 'developer'}
Audience: ${user.targetAudience ?? 'other developers'}
Goal: ${user.contentGoal ?? 'build reputation'}

${CONFIDENTIALITY}

Propose exactly 3 post angles. Every angle MUST be anchored to a specific thing in the data
above — a real bug, a real file, a real number, a real opinion they gave. Reject anything
that could have been written by someone who did not see this data.

Return JSON: [{"title": "<max 8 words>", "anchor": "<the specific commit/entry it comes from>", "why": "<max 15 words on why it lands>"}]`)

  await db.update(userProfiles)
    .set({ pendingContext: { kind: 'angles', angles } })
    .where(eq(userProfiles.id, user.id))

  const body = angles
    .map((a, i) => `${i + 1}. ${a.title}\n   from: ${a.anchor}\n   why: ${a.why}`)
    .join('\n\n')

  await send(
    user.telegramChatId,
    `This week's angles — pick one:\n\n${body}`,
    [angles.map((_, i) => ({ text: `${i + 1}`, callback_data: `angle:${i}` }))],
  )
  return 'sent'
}

/** Write the draft for a chosen angle, in the user's own rubric. */
export async function generateDraft(user: UserProfile, angle: Angle, origin = 'weekly') {
  const ctx = await weekContext(user.id)
  const brief = await styleBrief(user.id)
  const fewShot = await editPairs(user.id)

  const content = await ask(`Write a LinkedIn post.

ANGLE: ${angle.title}
ANCHORED TO: ${angle.anchor}

SOURCE MATERIAL (the only facts you may use):
${ctx.text}

${brief.text || 'No style rubric yet — write plainly and specifically, first person, no hype.'}
${fewShot}

Author: ${user.profession ?? 'developer'}, writing for ${user.targetAudience ?? 'other developers'}.

HARD RULES:
- ${CONFIDENTIALITY}
- The post MUST contain at least one concrete detail from the source material: a real bug,
  a real number, a real file or repo name. This is the difference between "5 tips for better
  React performance" and something someone actually wants to read.
- Invent nothing. If a fact is not in the source material above, it does not go in the post.
- No hashtags. No "Here's the thing". No "game-changer". No engagement bait.
- Output the post text only — no title, no commentary, no markdown fences.`, QUALITY)

  const [row] = await db.insert(posts).values({
    userId: user.id,
    weekOf: localDate(user.timezone ?? undefined),
    theme: angle.title,
    platform: 'linkedin',
    content,
    origin,
    status: 'pending_review',
    sourceIds: {
      commits: ctx.commitRows.map(c => c.id),
      entries: ctx.entries.map(e => e.id),
    },
  }).returning()

  await deliverDraft(user, row)
  return row
}

/** Rewrite a draft from freeform feedback. Capped at 3 rounds. */
export async function rewriteDraft(user: UserProfile, postId: string, feedback: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId))
  if (!post) return null
  if ((post.rewriteCount ?? 0) >= 3) return post

  const brief = await styleBrief(user.id)
  const content = await ask(`Rewrite this post according to the feedback. Keep every concrete
factual detail (bugs, numbers, file names) — change only what the feedback asks for.

CURRENT POST:
${post.content}

FEEDBACK: ${feedback}

${brief.text}

Output the rewritten post only.`, QUALITY)

  const [updated] = await db.update(posts)
    // back to pending_review: a reworked draft is alive again, rejected or not
    .set({ content, status: 'pending_review', rewriteCount: (post.rewriteCount ?? 0) + 1, rewriteFeedback: feedback })
    .where(eq(posts.id, postId))
    .returning()
  return updated
}


/** Approve/reject buttons, used everywhere a draft is delivered. */
const reviewButtons = (id: string) => [[
  { text: 'Approve', callback_data: `approve:${id}` },
  { text: 'Rewrite', callback_data: `rewrite:${id}` },
  { text: 'Reject', callback_data: `reject:${id}` },
]]

export async function deliverDraft(user: UserProfile, post: { id: string; content: string; theme: string | null }) {
  if (!user.telegramChatId) return
  await send(user.telegramChatId, `${post.theme ? `[${post.theme}]\n\n` : ''}${post.content}`, reviewButtons(post.id))
}

/**
 * Build context from exactly the rows you picked on /compose. Falls back to the
 * whole week when nothing is selected, which is what `/compose <text>` does.
 */
export type Selection = { commits?: string[]; entries?: string[]; trends?: string[] }

async function briefContext(userId: string, selection?: Selection) {
  const picked = selection && Object.values(selection).some(v => v?.length)
  if (!picked) {
    const ctx = await weekContext(userId)
    return ctx.text
  }

  const [commitRows, entryRows, trendRows] = await Promise.all([
    selection!.commits?.length
      ? db.select().from(commits).where(inArray(commits.id, selection!.commits))
      : Promise.resolve([]),
    selection!.entries?.length
      ? db.select().from(dailyEntries).where(inArray(dailyEntries.id, selection!.entries))
      : Promise.resolve([]),
    selection!.trends?.length
      ? db.select().from(trendItems).where(inArray(trendItems.id, selection!.trends))
      : Promise.resolve([]),
  ])

  return [
    await repoContext(userId),
    commitRows.length ? `SELECTED COMMITS:\n${summarizeCommits(commitRows)}` : '',
    entryRows.length ? `SELECTED JOURNAL ENTRIES:\n${entryRows.map(e => `Q: ${e.promptAsked ?? '(unprompted)'}\nA: ${e.rawInput}`).join('\n\n')}` : '',
    trendRows.length ? `SELECTED ARTICLES:\n${trendRows.map(t => `- ${t.title} (${t.url})`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

/** "Write me a post about this, this and this." */
export async function generateFromBrief(
  user: UserProfile,
  brief: string,
  selection?: Selection,
  platform: 'linkedin' | 'twitter' | 'blog' = 'linkedin',
) {
  const context = await briefContext(user.id, selection)
  const style = await styleBrief(user.id)
  const fewShot = await editPairs(user.id)

  const shape = {
    linkedin: 'A LinkedIn post. No hashtags, no engagement bait.',
    twitter: 'A Twitter/X thread. Number the tweets. Each under 280 characters.',
    blog: 'A blog post outline: title, then section headings with 2-3 bullets each.',
  }[platform]

  const content = await ask(`Write the following, using only the source material below.

WHAT I WANT: ${brief}

FORMAT: ${shape}

SOURCE MATERIAL:
${context}

${style.text || 'No style rubric yet — write plainly and specifically, first person, no hype.'}
${fewShot}

Author: ${user.profession ?? 'developer'}, writing for ${user.targetAudience ?? 'other developers'}.

HARD RULES:
- ${CONFIDENTIALITY}
- Ground it in at least one concrete detail from the source material: a real bug,
  a real number, a real file or project. Invent nothing.
- If the source material cannot support what I asked for, say so in one line
  instead of padding it out.
- Output the content only — no preamble, no markdown fences.`, QUALITY)

  const [row] = await db.insert(posts).values({
    userId: user.id,
    weekOf: localDate(user.timezone ?? undefined),
    theme: brief.slice(0, 80),
    platform,
    origin: 'compose',
    brief,
    content,
    status: 'pending_review',
    sourceIds: selection ?? {},
  }).returning()

  await deliverDraft(user, row)
  return row
}

/**
 * Keep a small queue of drafts warm so there is always something to react to.
 * Runs daily; does nothing once the queue is full, so it cannot spam you.
 */
export async function topUpQueue(user: UserProfile, target = 3): Promise<'generated' | 'full' | 'skipped'> {
  const [{ n }] = await db.select({ n: count() }).from(posts)
    .where(and(eq(posts.userId, user.id), eq(posts.status, 'pending_review')))
  if (n >= target) return 'full'

  const ctx = await weekContext(user.id)
  if (ctx.commitRows.length === 0 && ctx.entries.length === 0) return 'skipped'

  const style = await styleBrief(user.id)
  const [angle] = await askJson<Angle[]>(`Propose ONE post angle from this material.

${ctx.text}

${style.text}

${CONFIDENTIALITY}

It must be anchored to something specific in the data — a real bug, file, number
or opinion. Return JSON: [{"title":"<max 8 words>","anchor":"<what it comes from>","why":"<max 15 words>"}]`)
  if (!angle) return 'skipped'

  const row = await generateDraft(user, angle, 'auto')
  return row ? 'generated' : 'skipped'
}
