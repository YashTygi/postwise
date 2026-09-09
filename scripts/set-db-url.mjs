// Build, verify and store DATABASE_URL without hand-editing.
//
//   npm run db:url -- <project-ref>
//
// Reads the password from a muted stdin prompt — never argv (visible in `ps`),
// never echoed (visible in scrollback and screenshots). Percent-encodes it,
// tries each candidate host, keeps the first that actually authenticates.
import fs from 'node:fs'
import readline from 'node:readline'
import pg from 'pg'

const REF = process.env.SUPABASE_REF || process.argv[2]
if (!REF) { console.error('usage: npm run db:url -- <project-ref>   (find it in your Supabase URL)'); process.exit(1) }

// Muted prompt: readline echoes by default, which puts the password on screen
// and into terminal scrollback, screenshots and screen shares.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
const password = await new Promise(res => {
  const onData = () => rl.output.write('\x1b[2K\r Database password: ')
  rl.question(' Database password: ', a => {
    rl.input.removeListener('data', onData)
    rl.close()
    process.stdout.write('\n')
    res(a.trim())
  })
  rl.input.on('data', onData)
})
if (!password) { console.error('nothing entered'); process.exit(1) }
if (/^\[.*\]$/.test(password)) { console.error('that is the placeholder from the dashboard, not a password'); process.exit(1) }

const enc = encodeURIComponent(password)
// Pooler first: it publishes IPv4, which Vercel requires. The direct host is
// IPv6-only and works locally while failing in production.
const candidates = [
  ...['ap-southeast-1', 'ap-south-1', 'us-east-1', 'us-west-1', 'eu-central-1']
    .flatMap(r => ['aws-0', 'aws-1'].map(p => `postgresql://postgres.${REF}:${enc}@${p}-${r}.pooler.supabase.com:6543/postgres`)),
  `postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`,
]

for (const url of candidates) {
  const host = new URL(url).hostname
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000 })
  try {
    await c.connect()
    await c.query('select 1')
    await c.end()
    const text = fs.readFileSync('.env.local', 'utf8')
    const line = text.split('\n').find(l => l.startsWith('DATABASE_URL='))
    fs.writeFileSync('.env.local', line ? text.replace(line, `DATABASE_URL=${url}`) : `${text.trimEnd()}\nDATABASE_URL=${url}\n`)
    console.log(`\nconnected via ${host}`)
    if (host.startsWith('db.')) console.warn('WARNING: this is the direct host — IPv6 only, it will fail on Vercel. Find your pooler region in the dashboard.')
    console.log('.env.local updated')
    process.exit(0)
  } catch (err) {
    if (err.code === '28P01') { console.error('\npassword rejected — reset it in Settings → Database'); process.exit(1) }
    // wrong region, keep trying
  }
}
console.error('no host accepted the connection — check the project is running')
process.exit(1)
