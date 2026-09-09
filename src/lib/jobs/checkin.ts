import { db } from '@/lib/db'
import { dailyEntries, trendItems, userProfiles, type UserProfile } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { ask } from '@/lib/ai'
import { send } from '@/lib/telegram'
import { recentCommits, summarizeCommits } from './github'
import { ingestTrends, topTrends } from './trends'

/** Calendar date in the user's own timezone. en-CA formats as YYYY-MM-DD. */
export function localDate(tz = 'Asia/Kolkata', d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
}

/**
 * The highest-leverage piece of the whole system.
 *
 * "Did you learn anything today?" gets answered honestly for four days and then
 * ignored forever. A question generated from that day's actual commits is
 * already half-answered, so it gets a real reply.
 */
async function buildQuestion(userId: string, rows: Awaited<ReturnType<typeof recentCommits>>): Promise<string> {
  return ask(`You are writing ONE short check-in question to a developer at the end of their day.

Their commits in the last 36 hours:
${summarizeCommits(rows)}

Write a single question that references a SPECIFIC file, commit message, or number from
that list — something only someone who read their commits could ask. You are digging for
the story behind the work: what was actually going wrong, what they decided, what surprised them.

Rules: max 45 words. No greeting, no sign-off, no emoji. Ask exactly one thing.
Example shape: "You made 7 commits to dashboard, mostly in useVirtualScroll.ts — including one called 'fix jank on fast scroll'. What was actually going wrong there?"`)
}

/** Ask today's primed question. Idempotent: re-running the cron won't double-ask. */
export async function sendCheckin(
  user: UserProfile,
  opts: { force?: boolean } = {},
): Promise<'sent' | 'skipped'> {
  if (!user.telegramChatId) return 'skipped'
  const today = localDate(user.timezone ?? undefined)

  const already = opts.force ? [] : await db
    .select({ id: dailyEntries.id })
    .from(dailyEntries)
    .where(and(
      eq(dailyEntries.userId, user.id),
      eq(dailyEntries.entryDate, today),
      eq(dailyEntries.entryType, 'checkin'),
    ))
  if (already.length > 0) return 'skipped'

  const rows = await recentCommits(user.id, new Date(Date.now() - 36 * 3600e3))

  // A day with no commits is not a dead day. Rather than a flat question that
  // is easy to ignore, offer the two things actually worth capturing: what you
  // did, or a considered take on something you read.
  const question = rows.length === 0
    ? 'No commits today. What do you want to do?'
    : await buildQuestion(user.id, rows)

  const [entry] = await db
    .insert(dailyEntries)
    .values({ userId: user.id, entryDate: today, promptAsked: question, entryType: 'checkin' })
    .returning({ id: dailyEntries.id })

  await db
    .update(userProfiles)
    .set({ pendingContext: { kind: 'checkin', entryId: entry.id } })
    .where(eq(userProfiles.id, user.id))

  const buttons = rows.length === 0
    ? [
        [{ text: 'Something I did today', callback_data: `own:${entry.id}` }],
        [{ text: 'Give me a trending topic', callback_data: `trend:${entry.id}` }],
        [{ text: 'Nothing today', callback_data: `skip:${entry.id}` }],
      ]
    : [[
        { text: 'Nothing worth noting', callback_data: `skip:${entry.id}` },
        { text: 'Snooze', callback_data: `snooze:${entry.id}` },
      ]]

  await send(user.telegramChatId, question, buttons)
  return 'sent'
}

/** Offer a short menu of trending items to react to. Fetches on demand if empty. */
export async function offerTrendTopics(user: UserProfile) {
  if (!user.telegramChatId) return
  let items = await topTrends(user.id, 3)
  if (items.length === 0) {
    await send(user.telegramChatId, 'Nothing fetched yet — pulling the feeds, give me a moment.')
    await ingestTrends(user.id)
    items = await topTrends(user.id, 3)
  }
  if (items.length === 0) {
    await send(user.telegramChatId, 'Could not reach the feeds. Try again later.')
    return
  }

  const body = items
    .map((t, i) => `${i + 1}. ${t.title}\n${t.url}${t.reason ? `\n   (${t.reason})` : ''}`)
    .join('\n\n')

  await send(
    user.telegramChatId,
    `Read one of these, then tell me what you think:\n\n${body}`,
    [items.map((t, i) => ({ text: `${i + 1}`, callback_data: `pick:${t.id}` }))],
  )
}

/** Lock in the chosen topic and wait for the take. */
export async function pickTrend(user: UserProfile, trendItemId: string) {
  if (!user.telegramChatId) return
  const [item] = await db.select().from(trendItems).where(eq(trendItems.id, trendItemId))
  if (!item) return

  const pending = user.pendingContext as { entryId?: string } | null
  const prompt = `Your take on: ${item.title}\n${item.url}`

  // Reuse today's check-in row rather than leaving it unanswered forever.
  const entryId = pending?.entryId
  if (entryId) {
    await db.update(dailyEntries)
      .set({ promptAsked: prompt, entryType: 'opinion', trendItemId })
      .where(eq(dailyEntries.id, entryId))
  }

  await db.update(trendItems).set({ status: 'shown' }).where(eq(trendItems.id, trendItemId))
  await db.update(userProfiles)
    .set({ pendingContext: { kind: 'opinion', entryId, trendItemId } })
    .where(eq(userProfiles.id, user.id))

  await send(user.telegramChatId, `${prompt}\n\nRead it, then send me your take — agree, disagree, seen it bite you before. Text or voice.`)
}

/**
 * Push one high-scoring trend item and ask for a take. Your opinion on it is
 * what makes generated content sound like you instead of like a summary.
 */
export async function sendOpinionPrompt(user: UserProfile): Promise<'sent' | 'skipped'> {
  if (!user.telegramChatId) return 'skipped'
  const [item] = await topTrends(user.id, 1)
  if (!item || (item.score ?? 0) < 40) return 'skipped'

  const today = localDate(user.timezone ?? undefined)
  const prompt = `Worth a look: ${item.title}\n${item.url}\n\nWhat's your take? Agree, disagree, seen this bite you before? Two lines is fine.`

  const [entry] = await db
    .insert(dailyEntries)
    .values({
      userId: user.id, entryDate: today, promptAsked: prompt,
      entryType: 'opinion', trendItemId: item.id,
    })
    .returning({ id: dailyEntries.id })

  await db.update(trendItems).set({ status: 'shown' }).where(eq(trendItems.id, item.id))
  await db
    .update(userProfiles)
    .set({ pendingContext: { kind: 'opinion', entryId: entry.id, trendItemId: item.id } })
    .where(eq(userProfiles.id, user.id))

  await send(user.telegramChatId, prompt, [[{ text: 'No opinion', callback_data: `skip:${entry.id}` }]])
  return 'sent'
}

/**
 * Attach an inbound message to whatever the bot last asked. If nothing is
 * pending it still gets stored — an unprompted thought is worth as much as a
 * prompted one.
 */
export async function recordAnswer(user: UserProfile, text: string, source = 'telegram') {
  const pending = user.pendingContext as { kind: string; entryId: string } | null
  const today = localDate(user.timezone ?? undefined)

  if (pending?.entryId) {
    const [row] = await db
      .update(dailyEntries)
      .set({ rawInput: text, source })
      .where(and(eq(dailyEntries.id, pending.entryId), isNull(dailyEntries.rawInput)))
      .returning({ id: dailyEntries.id })
    await db.update(userProfiles).set({ pendingContext: null }).where(eq(userProfiles.id, user.id))
    if (row) {
      if (pending.kind === 'opinion') {
        await db.update(trendItems).set({ status: 'opined' })
          .where(eq(trendItems.id, (user.pendingContext as { trendItemId: string }).trendItemId))
      }
      return row.id
    }
  }

  const [row] = await db
    .insert(dailyEntries)
    .values({ userId: user.id, entryDate: today, rawInput: text, entryType: 'adhoc', source })
    .returning({ id: dailyEntries.id })
  return row.id
}
