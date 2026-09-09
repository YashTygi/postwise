// Apply a .sql file to DATABASE_URL. Non-interactive, unlike `drizzle-kit push`.
//   node scripts/db-apply.mjs drizzle/0001_postwise_pipeline.sql
// Pass --dry to print the statements without running them.
import fs from 'node:fs'
import pg from 'pg'

const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) { console.error('usage: node scripts/db-apply.mjs <file.sql> [--dry]'); process.exit(1) }

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i < 1 || line.startsWith('#')) continue
    const k = line.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}

const sql = fs.readFileSync(file, 'utf8')
if (dry) { console.log(sql); process.exit(0) }

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set in .env.local'); process.exit(1) }
const host = new URL(process.env.DATABASE_URL).hostname

// A dead host here is almost always one of two things, and the raw DNS trace
// says neither of them out loud.
await import('node:dns/promises').then(dns => dns.lookup(host)).catch(() => {
  console.error(`DATABASE_URL points at ${host}, which does not resolve.\n`)
  console.error('  · Supabase deletes free projects ~90 days after they pause.')
  console.error('    Check the dashboard — if the project is gone, make a new one')
  console.error('    and replace NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY')
  console.error('    and DATABASE_URL. All three, or auth and the database disagree.\n')
  console.error('  · Direct connections (db.<ref>.supabase.co) publish AAAA records only.')
  console.error('    Use the pooler string instead — it has IPv4, which Vercel needs:')
  console.error('    postgresql://postgres.<ref>:<pw>@aws-N-<region>.pooler.supabase.com:6543/postgres')
  process.exit(1)
})

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect().catch(err => {
  console.error(`could not connect to ${host}: ${err.message}`)
  process.exit(1)
})
try {
  // One transaction: either the whole migration lands or none of it does.
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log(`applied ${file}`)
} catch (err) {
  await client.query('rollback')
  console.error('rolled back:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
