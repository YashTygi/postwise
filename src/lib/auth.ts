import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/** Auth + profile in one call. Redirects if either is missing. */
export async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let profile = await db.query.userProfiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  })
  if (!profile) redirect('/onboarding')

  // Link code is generated lazily — one less thing for signup to get wrong.
  if (!profile.telegramLinkCode) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const [updated] = await db.update(userProfiles)
      .set({ telegramLinkCode: code })
      .where(eq(userProfiles.id, user.id))
      .returning()
    profile = updated
  }

  return { authUser: user, profile }
}
