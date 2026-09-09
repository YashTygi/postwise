// Local Telegram testing without deploying and without a tunnel.
//
//   terminal 1:  npm run dev
//   terminal 2:  npm run bot:dev
//
// Long-polls getUpdates and forwards each update to the local webhook route,
// so the exact same handler runs locally as in production.
// ponytail: dev only. Production uses the real webhook — no process to babysit.
import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=')
  if (i > 0 && !line.startsWith('#')) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRET } = process.env
const LOCAL = process.env.LOCAL_URL ?? 'http://localhost:3000'
if (!TOKEN || !SECRET) { console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local'); process.exit(1) }

const api = (m, body) => fetch(`https://api.telegram.org/bot${TOKEN}/${m}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(r => r.json())

// A registered webhook and getUpdates are mutually exclusive.
await api('deleteWebhook', { drop_pending_updates: true })
const me = await api('getMe', {})
if (!me.ok) { console.error('bad token:', me.description); process.exit(1) }
console.log(`@${me.result.username} → ${LOCAL}/api/telegram   (ctrl-c to stop)`)

let offset = 0
for (;;) {
  try {
    const { result = [] } = await api('getUpdates', { offset, timeout: 25 })
    for (const update of result) {
      offset = update.update_id + 1
      const label = update.message?.text ?? (update.message?.voice ? '<voice>' : update.callback_query?.data) ?? '?'
      const res = await fetch(`${LOCAL}/api/telegram`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
        body: JSON.stringify(update),
      })
      console.log(`${res.status}  ${label}`)
    }
  } catch (err) {
    console.error('poll error:', err.message)
    await new Promise(r => setTimeout(r, 3000))
  }
}
