'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { userProfiles, styleReferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function submitOnboarding(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profession    = formData.get('profession') as string
  const targetAudience = formData.get('targetAudience') as string
  const contentGoal   = formData.get('contentGoal') as string
  const sourceLabel   = formData.get('sourceLabel') as string

  // Collect all pasted posts — the form sends post_0, post_1, post_2 ... post_N
  const pastedPosts: string[] = []
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('post_') && typeof value === 'string' && value.trim().length > 0) {
      pastedPosts.push(value.trim())
    }
  }

  if (pastedPosts.length === 0) {
    redirect('/onboarding?error=no_posts')
  }

  // ── 1. Update user profile ──────────────────────────────────────────────
  await db
    .update(userProfiles)
    .set({
      profession,
      targetAudience,
      contentGoal,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.id, user.id))

  // ── 2. Save the pasted posts as a style reference ───────────────────────
  await db.insert(styleReferences).values({
    userId:      user.id,
    sourceLabel: sourceLabel || 'My style inspiration',
    pastedPosts,
    postCount:   pastedPosts.length,
    dnaStatus:   'pending', // Gemini extraction runs async after this
  })

  // ── 3. Trigger async DNA extraction (fire and forget) ───────────────────
  // In production this would push to a queue.
  // For MVP, call the API route without awaiting so we don't block redirect.
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/extract-dna`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id }),
  }).catch(() => {}) // intentional fire-and-forget

  redirect('/dashboard')
}

// ── Add more style references post-onboarding ───────────────────────────────
export async function addStyleReference(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sourceLabel = formData.get('sourceLabel') as string

  const pastedPosts: string[] = []
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('post_') && typeof value === 'string' && value.trim().length > 0) {
      pastedPosts.push(value.trim())
    }
  }

  if (pastedPosts.length === 0 || !sourceLabel) return

  await db.insert(styleReferences).values({
    userId:      user.id,
    sourceLabel,
    pastedPosts,
    postCount:   pastedPosts.length,
    dnaStatus:   'pending',
  })

  fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/extract-dna`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id }),
  }).catch(() => {})

  redirect('/dashboard?tab=style')
}