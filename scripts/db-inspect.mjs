// Print the live schema. `node scripts/db-inspect.mjs`
import fs from 'node:fs'
import pg from 'pg'
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=')
  if (i > 0 && !line.startsWith('#')) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows: tables } = await c.query(
  `select table_name from information_schema.tables where table_schema='public' order by 1`)
for (const { table_name } of tables) {
  const { rows: cols } = await c.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [table_name])
  const { rows: [{ n }] } = await c.query(`select count(*)::int n from "${table_name}"`)
  console.log(`\n${table_name}  (${n} rows)\n  ${cols.map(x => x.column_name).join(', ')}`)
}
await c.end()
