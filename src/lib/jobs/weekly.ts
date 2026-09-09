import { db } from '@/lib/db'
import { dailyEntries, posts, userProfiles, type UserProfile } from '@/lib/db/schema'
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm'
import { ask, askJson } from '@/lib/ai'
import { send } from '@/lib/telegram'
import { recentCommits, summarizeCommits } from './github'
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

  return {
    commitRows,
    entries,
    text: `COMMITS THIS WEEK:\n${summarizeCommits(commitRows) || '(none)'}\n\nJOURNAL + OPINIONS THIS WEEK:\n${journal || '(none)'}`,
  }
}

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
export async function generateDraft(user: UserProfile, angle: Angle) {
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
- The post MUST contain at least one concrete detail from the source material: a real bug,
  a real number, a real file or repo name. This is the difference between "5 tips for better
  React performance" and something someone actually wants to read.
- Invent nothing. If a fact is not in the source material above, it does not go in the post.
- No hashtags. No "Here's the thing". No "game-changer". No engagement bait.
- Output the post text only — no title, no commentary, no markdown fences.`, 'gemini-2.5-pro')

  const [row] = await db.insert(posts).values({
    userId: user.id,
    weekOf: localDate(user.timezone ?? undefined),
    theme: angle.title,
    platform: 'linkedin',
    content,
    status: 'pending_review',
    sourceIds: {
      commits: ctx.commitRows.map(c => c.id),
      entries: ctx.entries.map(e => e.id),
    },
  }).returning()

  if (user.telegramChatId) {
    await send(user.telegramChatId, content, [[
      { text: 'Approve', callback_data: `approve:${row.id}` },
      { text: 'Rewrite', callback_data: `rewrite:${row.id}` },
    ]])
  }
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

Output the rewritten post only.`, 'gemini-2.5-pro')

  const [updated] = await db.update(posts)
    .set({ content, rewriteCount: (post.rewriteCount ?? 0) + 1, rewriteFeedback: feedback })
    .where(eq(posts.id, postId))
    .returning()
  return updated
}
