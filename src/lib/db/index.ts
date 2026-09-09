import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Serverless sizing. Every warm function instance holds its own pool, so a
// default-sized pool (10) times a handful of instances exhausts Supabase's
// connection budget for no benefit — each invocation only runs a few queries.
//
// DATABASE_URL must be a POOLER url (aws-N-<region>.pooler.supabase.com).
// The direct host (db.<ref>.supabase.co) publishes AAAA records only, and
// Vercel functions are IPv4-only, so direct connections fail in production
// while working fine from a developer machine that has IPv6.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
})

if (process.env.NODE_ENV === 'production' && /^db\..*\.supabase\.co$/.test(new URL(process.env.DATABASE_URL ?? 'postgres://x/').hostname)) {
  console.error('DATABASE_URL uses the direct Supabase host, which is IPv6-only. Vercel cannot reach it — switch to the pooler URL.')
}

export const db = drizzle(pool, { schema })
