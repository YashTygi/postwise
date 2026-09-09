import { db } from '@/lib/db'
import { githubAccounts, type GithubAccount } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

/**
 * Tokens live in the environment, never in the database.
 *
 * A work PAT grants access to an employer's private code; a Supabase row is not
 * where that belongs. Vercel encrypts env vars at rest, so each account resolves
 * its token by label: label 'work' → GITHUB_TOKEN_WORK.
 */
export function tokenFor(label: string): string | undefined {
  const key = `GITHUB_TOKEN_${label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
  return process.env[key] || (label === 'personal' ? process.env.GITHUB_TOKEN : undefined)
}

export function activeAccounts(userId: string) {
  return db.select().from(githubAccounts)
    .where(and(eq(githubAccounts.userId, userId), eq(githubAccounts.active, true)))
}

/** Accounts that are configured AND have a usable token. */
export async function usableAccounts(userId: string) {
  const rows = await activeAccounts(userId)
  return rows.filter(a => !!tokenFor(a.label))
}

export function missingTokenFor(a: GithubAccount) {
  return `GITHUB_TOKEN_${a.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}
