import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Upsert user profile — runs on every login to keep data fresh
      await db.insert(userProfiles).values({
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
        avatarUrl: data.user.user_metadata?.avatar_url,
        onboardingComplete: false,
      }).onConflictDoUpdate({
        target: userProfiles.id,
        set: {
          email: data.user.email,
          fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
          avatarUrl: data.user.user_metadata?.avatar_url,
          updatedAt: new Date(),
        },
      })

      // Check if onboarding is done — redirect accordingly
      const profile = await db.query.userProfiles.findFirst({
        where: (p, { eq }) => eq(p.id, data.user.id),
      })

      const redirectTo = profile?.onboardingComplete ? next : '/onboarding'
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}