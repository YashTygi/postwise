import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dailyEntries, posts, userProfiles, type UserProfile } from '@/lib/db/schema'
import { and, count, eq, gte, isNotNull } from 'drizzle-orm'
import { answerCallback, downloadFile, send } from '@/lib/telegram'
import { transcribe } from '@/lib/ai'
import { localDate, offerTrendTopics, pickTrend, recordAnswer, sendCheckin } from '@/lib/jobs/checkin'
import { deliverDraft, generateDraft, generateFromBrief, proposeAngles, rewriteDraft, type Angle } from '@/lib/jobs/weekly'

export const maxDuration = 60

const byChat = (chatId: string) =>
  db.query.userProfiles.findFirst({ where: (u, { eq }) => eq(u.telegramChatId, chatId) })

async function handleCommand(user: UserProfile, chatId: string, text: string): Promise<boolean> {
  const [cmd] = text.split(' ')
  switch (cmd) {
    case '/start':
      await send(chatId, "You're linked. I'll ask you one question each evening, built from that day's commits.\n\nReply with text or a voice note. /ask for a question now, /post for this week's drafts, /status for where things stand.")
      return true
    case '/ask':
      await sendCheckin(user, { force: true })
      return true
    case '/post':
      await proposeAngles(user)
      return true
    case '/compose': {
      const brief = text.slice('/compose'.length).trim()
      if (!brief) {
        await send(chatId, 'Tell me what to write, e.g.\n/compose a post about the caching bug and why stale-while-revalidate made it worse')
        return true
      }
      await send(chatId, 'Writing it…')
      await generateFromBrief(user, brief)
      return true
    }
    case '/compose_help':
      await send(chatId, 'Pick exact commits, entries and articles on the /compose page in the dashboard, or describe it here with /compose <what you want>.')
      return true
    case '/status': {
      const week = new Date(Date.now() - 7 * 864e5)
      const [[entries], [drafts]] = await Promise.all([
        db.select({ n: count() }).from(dailyEntries).where(and(
          eq(dailyEntries.userId, user.id), isNotNull(dailyEntries.rawInput), gte(dailyEntries.createdAt, week))),
        db.select({ n: count() }).from(posts).where(and(
          eq(posts.userId, user.id), eq(posts.status, 'pending_review'))),
      ])
      await send(chatId, `Last 7 days: ${entries.n} journal entries.\nDrafts waiting for review: ${drafts.n}.\nGitHub: ${user.githubUsername ?? 'not set — add it on /settings'}`)
      return true
    }
    default:
      return false
  }
}

async function handleCallback(user: UserProfile, chatId: string, data: string, queryId: string) {
  const [action, arg] = data.split(':')


  if (action === 'skip' || action === 'snooze') {
    await db.update(userProfiles).set({ pendingContext: null }).where(eq(userProfiles.id, user.id))
    if (action === 'skip') {
      await db.update(dailyEntries).set({ rawInput: '(nothing worth noting)' }).where(eq(dailyEntries.id, arg))
    }
    await answerCallback(queryId, action === 'skip' ? 'Noted.' : 'Ask again later.')
    return
  }

  if (action === 'own') {
    await answerCallback(queryId)
    await send(chatId, 'Go ahead — what did you work on, read, or fix? Text or voice note.')
    return
  }

  if (action === 'trend') {
    await answerCallback(queryId, 'Pulling topics…')
    await offerTrendTopics(user)
    return
  }

  if (action === 'pick') {
    await answerCallback(queryId)
    await pickTrend(user, arg)
    return
  }

  if (action === 'angle') {
    await answerCallback(queryId, 'Writing it…')
    const pending = user.pendingContext as { kind: string; angles: Angle[] } | null
    const angle = pending?.angles?.[Number(arg)]
    if (!angle) return void send(chatId, 'That angle expired. Send /post to get a fresh set.')
    await db.update(userProfiles).set({ pendingContext: null }).where(eq(userProfiles.id, user.id))
    await generateDraft(user, angle)
    return
  }

  if (action === 'approve') {
    await db.update(posts).set({ status: 'approved' }).where(eq(posts.id, arg))
    await answerCallback(queryId, 'Approved.')
    await send(chatId, 'Approved. Copy it from the message above, or open the dashboard to edit before posting.')
    return
  }

  if (action === 'rewrite' || action === 'reject') {
    // A rejection without a reason teaches the system nothing. Both paths ask
    // what was wrong; reject additionally marks the draft so it is not reused.
    if (action === 'reject') {
      await db.update(posts).set({ status: 'rejected' }).where(eq(posts.id, arg))
    }
    await db.update(userProfiles)
      .set({ pendingContext: { kind: 'edit', postId: arg } })
      .where(eq(userProfiles.id, user.id))
    await answerCallback(queryId)
    await send(chatId, action === 'reject'
      ? "Rejected. What was wrong with it? I'll rework it from your answer — or send /skip to drop it."
      : "What should change? e.g. 'too long', 'more technical', 'cut the last paragraph'.")
    return
  }

  await answerCallback(queryId)
}

export async function POST(req: Request) {
  // Telegram signs every call with the secret registered at setWebhook time.
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const update = await req.json()

  try {
    const chatId = String(update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? '')
    if (!chatId) return NextResponse.json({ ok: true })

    let user = await byChat(chatId)

    // Binding: the code is shown on /settings, sent here once as `/link ABC123`.
    const text: string | undefined = update.message?.text
    if (!user && text?.startsWith('/link ')) {
      const code = text.slice(6).trim().toUpperCase()
      const [bound] = await db.update(userProfiles)
        .set({ telegramChatId: chatId })
        .where(eq(userProfiles.telegramLinkCode, code))
        .returning()
      if (!bound) {
        await send(chatId, 'That code did not match. Grab a fresh one from your dashboard settings page.')
        return NextResponse.json({ ok: true })
      }
      user = bound
      await send(chatId, `Linked to ${bound.email ?? 'your account'}. I'll check in each evening.`)
      return NextResponse.json({ ok: true })
    }

    if (!user) {
      await send(chatId, 'Not linked yet. Open your Postwise settings page, copy the link code, and send: /link YOURCODE')
      return NextResponse.json({ ok: true })
    }

    if (update.callback_query) {
      await handleCallback(user, chatId, update.callback_query.data ?? '', update.callback_query.id)
      return NextResponse.json({ ok: true })
    }

    // Voice notes: transcribe and treat exactly like typed text.
    let body = text
    let source = 'telegram'
    const voice = update.message?.voice ?? update.message?.audio
    if (voice) {
      body = await transcribe(await downloadFile(voice.file_id), voice.mime_type ?? 'audio/ogg')
      source = 'voice'
    }
    if (!body?.trim()) return NextResponse.json({ ok: true })

    if (body.startsWith('/') && (await handleCommand(user, chatId, body))) {
      return NextResponse.json({ ok: true })
    }

    const pending = user.pendingContext as { kind: string; postId?: string } | null
    if (pending?.kind === 'edit' && pending.postId) {
      await db.update(userProfiles).set({ pendingContext: null }).where(eq(userProfiles.id, user.id))
      if (body.trim() === '/skip') {
        await send(chatId, 'Dropped.')
        return NextResponse.json({ ok: true })
      }
      const updated = await rewriteDraft(user, pending.postId, body)
      if (!updated) await send(chatId, 'Could not find that draft.')
      else if ((updated.rewriteCount ?? 0) > 3) await send(chatId, 'Three rewrites is the cap — edit it directly in the dashboard.')
      else await deliverDraft(user, updated)
      return NextResponse.json({ ok: true })
    }

    await recordAnswer(user, body, source)
    await send(chatId, source === 'voice'
      ? `Got it (${body.trim().split(/\s+/).length} words transcribed). Saved to ${localDate(user.timezone ?? undefined)}.`
      : 'Saved.')
  } catch (err) {
    // Always 200: a non-200 makes Telegram retry the same update forever.
    console.error('telegram webhook error:', err)
  }

  return NextResponse.json({ ok: true })
}
