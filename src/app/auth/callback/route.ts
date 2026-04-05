import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { userProfiles, linkedinProfiles } from '@/lib/db/schema'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const user = data.user
  const meta = user.user_metadata ?? {}

  // ── 1. Upsert base profile ──────────────────────────────────────────────
  await db
    .insert(userProfiles)
    .values({
      id:                user.id,
      email:             user.email,
      fullName:          meta.full_name ?? meta.name ?? null,
      avatarUrl:         meta.avatar_url ?? meta.picture ?? null,
      linkedinId:        meta.provider_id ?? meta.sub ?? null,
      linkedinHeadline:  meta.headline ?? null,
      linkedinIndustry:  meta.industry ?? null,
      linkedinPublicUrl: meta.public_profile_url ?? null,
      onboardingComplete: false,
    })
    .onConflictDoUpdate({
      target: userProfiles.id,
      set: {
        email:             user.email,
        fullName:          meta.full_name ?? meta.name ?? null,
        avatarUrl:         meta.avatar_url ?? meta.picture ?? null,
        linkedinId:        meta.provider_id ?? meta.sub ?? null,
        linkedinHeadline:  meta.headline ?? null,
        linkedinIndustry:  meta.industry ?? null,
        linkedinPublicUrl: meta.public_profile_url ?? null,
        updatedAt:         new Date(),
      },
    })

  // ── 2. Upsert LinkedIn profile detail row ───────────────────────────────
  // Store everything we got from the token — even if sparse today,
  // we can enrich it later without changing the schema
  await db
    .insert(linkedinProfiles)
    .values({
      userId:       user.id,
      linkedinId:   meta.provider_id ?? meta.sub ?? null,
      headline:     meta.headline ?? null,
      industry:     meta.industry ?? null,
      publicUrl:    meta.public_profile_url ?? null,
      location:     meta.locale ?? null,
      summary:      meta.summary ?? null,
      experience:   meta.positions ?? null,   // present if r_liteprofile granted
      education:    meta.educations ?? null,
      rawOauthData: meta,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: linkedinProfiles.userId,
      set: {
        headline:     meta.headline ?? null,
        industry:     meta.industry ?? null,
        publicUrl:    meta.public_profile_url ?? null,
        location:     meta.locale ?? null,
        summary:      meta.summary ?? null,
        experience:   meta.positions ?? null,
        education:    meta.educations ?? null,
        rawOauthData: meta,
        lastSyncedAt: new Date(),
      },
    })

  // ── 3. Check onboarding status and redirect ─────────────────────────────
  const profile = await db.query.userProfiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  })

  const redirectTo = profile?.onboardingComplete ? next : '/onboarding'
  return NextResponse.redirect(`${origin}${redirectTo}`)
}