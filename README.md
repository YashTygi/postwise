# Postwise

A daily journal that writes itself into LinkedIn posts.

Every evening a Telegram bot asks you one question built from that day's actual
commits. You answer in text or voice. Once a week it turns the accumulated
commits, answers and opinions into post drafts written in a style rubric
extracted from writers you admire.

Runs on free tiers only. No server to keep alive.

---

## How it works

```
GitHub events ─┐
Trend feeds  ──┼─→ Postgres ──→ weekly generation ──→ Telegram approval ──→ drafts
Your answers ──┤                      ↑
Style rubrics ─┘                      │
                        your past edits feed back as examples
```

Four ingestion streams, one store, one weekly job that reads from it.

**The journal is the asset.** Six months of good entries and you can write posts
by hand in an afternoon. A beautiful pipeline with an empty journal is worth
nothing. Everything else here is decoration on top of that table.

### The primed question

The reason this works is that it never asks "did you learn anything today?" —
you answer that honestly for four days and then ignore it forever. It asks:

> You made 7 commits to `dashboard`, mostly in `useVirtualScroll.ts` — including
> one called "fix jank on fast scroll". What was actually going wrong there?

A question that is already half-answered gets a real answer.

### The two style axes

Set them up on `/settings`. They do different jobs:

| Kind | What you paste | What it controls |
|---|---|---|
| **Positioning** | People whose career you want | Which topics get picked |
| **Craft** | Writing you like reading | How the draft reads |

Each set is compressed by Gemini into an inspectable JSON rubric. When a draft
sounds wrong you go look at which rule is wrong — far more reliable than dumping
twenty example posts into a prompt.

**LinkedIn has no API for reading other people's posts, and scraping it gets
accounts restricted.** So you paste. Sit down once for 30 minutes with 15–20
posts you admire; curating for quality beats collecting whatever is recent.
Refresh every few months.

---

## Setup

### 1. Database

Needs a live Supabase project. Free ones pause after 7 days idle and are
deleted after ~90 days paused — if yours has been quiet, it is gone and you
need a new one (supabase.com → New project). Copy the project URL, anon key
and connection string into `.env.local`.

Then:

```bash
npm run db:migrate     # applies drizzle/0001_postwise_pipeline.sql in one transaction
npm run db:inspect     # print the resulting schema
```

Purely additive — no drops, no type changes. `npm run db:migrate -- --dry`
prints the SQL without running it. Or paste the file into the Supabase SQL
editor by hand.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in.

| Variable | Where to get it | Cost |
|---|---|---|
| `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_*` | supabase.com project settings | free |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | free tier, no billing account |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` | free |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` | — |
| `CRON_SECRET` | `openssl rand -hex 32` | — |
| `GITHUB_TOKEN` | Classic PAT, `repo` scope — needed for private commits | free |

### 3. Deploy

Push first — the cron workflow lives in the repo:

```bash
git push origin master
```

Then link and deploy:

```bash
npx vercel login
npx vercel link
npx vercel --prod
```

Copy every secret up. `NEXT_PUBLIC_SITE_URL` is excluded because the local
value points at localhost:

```bash
while IFS= read -r line; do
  case "$line" in ''|\#*|NEXT_PUBLIC_SITE_URL=*) continue;; esac
  printf '%s' "${line#*=}" | npx vercel env add "${line%%=*}" production
done < .env.local
```

Then set the site URL to the real origin, no trailing slash:

```bash
printf '%s' 'https://YOUR-APP.vercel.app' | npx vercel env add NEXT_PUBLIC_SITE_URL production
npx vercel --prod
```

Environment variables only apply to builds made after they are added, hence the
second deploy.

### 4. Point Supabase at the deployed origin

Authentication → URL Configuration. Set **Site URL** to
`https://YOUR-APP.vercel.app` and add `https://YOUR-APP.vercel.app/auth/callback`
under Redirect URLs. Without this, email confirmation and OAuth bounce back to
localhost.

### 5. Register the webhook — once

Stop `bot:dev` first; it and the webhook are mutually exclusive.

```bash
curl "https://YOUR-APP.vercel.app/api/telegram/setup?secret=YOUR_CRON_SECRET"
```

Confirm it took:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

`url` should be your Vercel origin and `last_error_message` absent.

### 6. Turn on the daily job

In the GitHub repo: Settings → Secrets and variables → Actions → New secret.
Add `POSTWISE_URL` (`https://YOUR-APP.vercel.app`) and `CRON_SECRET`.

The workflow then fires daily at 20:00 IST and weekly on Sunday. Test it
immediately without waiting: Actions → "postwise cron" → Run workflow.

### 5. Link your account

Open `/settings`, copy the link code, and send it to your bot:

```
/link ABC123
```

Then set your GitHub username on the same page, and add at least one **craft**
style set.

---

## Testing locally

You do not need to deploy to try it. `getUpdates` polling stands in for the
webhook, so no tunnel either:

```bash
npm run dev        # terminal 1
npm run bot:dev    # terminal 2 — forwards Telegram updates to localhost:3000
```

The same webhook handler runs either way. Then, in Telegram:

| Step | Send | Expect |
|---|---|---|
| 1 | `/link YOURCODE` (from `/settings`) | "Linked to …" |
| 2 | `/status` | entry count, drafts, GitHub username |
| 3 | anything, e.g. "fixed a race in the upload queue" | "Saved." — then check `/journal` |
| 4 | a voice note | "Got it (N words transcribed)." |
| 5 | `/ask` | on a day with commits, a question about them; on a quiet day, a three-way choice |
| 6 | `/post` | three angles + numbered buttons |

On a day with no commits the check-in offers a choice rather than a question
that is easy to ignore:

- **Something I did today** — reply freely, it lands on today's entry
- **Give me a trending topic** — the top three scored items with links; pick a
  number, read it, then send your take
- **Nothing today** — closes the entry

Trigger the scheduled jobs by hand — they are just GET requests:

```bash
curl "http://localhost:3000/api/cron?job=daily&secret=$CRON_SECRET"
curl "http://localhost:3000/api/cron?job=weekly&secret=$CRON_SECRET"
```

Each returns what it did per user, so `{"commits":12,"trends":64,"checkin":"sent"}`
tells you all three streams worked. `/commits` needs `GITHUB_TOKEN` if your work
is in private repos — the events feed shows nothing public otherwise.

Stop `bot:dev` before deploying: it calls `deleteWebhook`, so re-run
`/api/telegram/setup` afterwards to put the production webhook back.

---

## Keeping it running, for free

The bot uses a **webhook**, not polling, so there is no process to keep alive.
Telegram calls your Vercel function when a message arrives. Vercel Hobby
functions never sleep and never cold-bill.

That leaves scheduling. Two options are wired up — pick one, delete the other:

**GitHub Actions** (recommended) — `.github/workflows/postwise-cron.yml`.
Free, and unlike Vercel Hobby it is not capped at one run per day. Add two repo
secrets: `POSTWISE_URL` and `CRON_SECRET`.

**Vercel Cron** — `vercel.json`. Zero extra setup, but Hobby fires each cron
only once a day and only approximately on time.

Both hit the same endpoint:

```
GET /api/cron?job=daily    # commits + trends + tonight's question
GET /api/cron?job=weekly   # Sunday's post angles
```

Times in both files are UTC and set for 20:00 / 10:30 IST. Change them to your
own evening.

### Running total: ₹0

Supabase free Postgres, Gemini free tier, Vercel Hobby, GitHub Actions,
Telegram. Nothing here has a card attached.

One caveat: **Supabase pauses free projects after 7 days of inactivity.** The
daily cron touches the database every day, so this never triggers — but if you
stop the cron for a week, unpause the project from the Supabase dashboard.

---

## Using it

In Telegram:

| Command | Does |
|---|---|
| *(just reply)* | Saves your answer to today's entry |
| *(voice note)* | Transcribed by Gemini, then saved the same way |
| `/ask` | Pull today's primed question now |
| `/post` | Generate this week's three angles now |
| `/status` | Entry count, drafts waiting, GitHub wiring |

In the web app: `/journal`, `/commits`, `/trends`, `/posts`, `/settings`.

**Edit drafts on `/posts`, not in Telegram.** Your edit is stored next to the
original, and the last five (draft, edit) pairs are fed into the next generation
as examples. Quality climbs without any fine-tuning — which is the whole reason
that column exists.

---

## Sources

Deliberately not HubSpot — its blog is marketing content, useless for frontend.
Hacker News (Algolia), dev.to, Lobsters, r/webdev + r/reactjs + r/javascript,
and RSS from web.dev, Vercel, Josh Comeau, Kent C. Dodds, Smashing Magazine and
CSS-Tricks. All keyless.

Items are scored 0–100 for relevance **to your recent commits**, not for
popularity. A React Server Components article matters if you have been in `app/`
all week; it is noise if you have been writing Vue.

When `/trends` stops filling up, a feed has moved:

```bash
npm run check:sources
```

---

## Deliberately not built

- **No vector database.** With one person's data you will have ~500 rows in six
  months. Indexed Postgres with date filters beats semantic search at that
  scale and is far easier to debug. Add `pgvector` when "find things I've
  written about this" actually starts failing.
- **No auto-posting.** LinkedIn's posting API needs app review; X's free tier is
  rate-limited into uselessness. Approve in Telegram, copy, paste. You want to
  be in the loop for the first few months anyway.
- **No LinkedIn scraping.** Against their ToS, and it gets accounts restricted.
