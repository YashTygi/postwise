'use server'

import { db } from '@/lib/db'
import { styleReferences, userProfiles } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentUser } from '@/lib/auth'
import { extractPendingDna } from '@/lib/jobs/style'

export async function saveSettings(formData: FormData) {
  const { profile } = await currentUser()
  await db.update(userProfiles).set({
    githubUsername: ((formData.get('githubUsername') as string) || '').trim() || null,
    timezone: (formData.get('timezone') as string) || 'Asia/Kolkata',
    profession: (formData.get('profession') as string) || profile.profession,
    targetAudience: (formData.get('targetAudience') as string) || profile.targetAudience,
    contentGoal: (formData.get('contentGoal') as string) || profile.contentGoal,
    updatedAt: new Date(),
  }).where(eq(userProfiles.id, profile.id))
  revalidatePath('/settings')
}

/**
 * Add a style set. `kind` is the important field:
 *   positioning → people you want to become like (shapes topic selection)
 *   craft       → writing you like (shapes execution)
 */
export async function addStyleSet(formData: FormData) {
  const { profile } = await currentUser()
  const pastedPosts = (formData.get('pastedPosts') as string)
    .split(/\n\s*---\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
  if (pastedPosts.length === 0) return

  await db.insert(styleReferences).values({
    userId: profile.id,
    sourceLabel: (formData.get('sourceLabel') as string) || 'Untitled set',
    kind: (formData.get('kind') as string) === 'positioning' ? 'positioning' : 'craft',
    pastedPosts,
    postCount: pastedPosts.length,
    dnaStatus: 'pending',
  })

  await extractPendingDna(profile.id)
  revalidatePath('/settings')
}

export async function deleteStyleSet(formData: FormData) {
  const { profile } = await currentUser()
  await db.delete(styleReferences).where(and(
    eq(styleReferences.id, formData.get('id') as string),
    eq(styleReferences.userId, profile.id),
  ))
  revalidatePath('/settings')
}

export async function unlinkTelegram() {
  const { profile } = await currentUser()
  await db.update(userProfiles).set({ telegramChatId: null, pendingContext: null })
    .where(eq(userProfiles.id, profile.id))
  revalidatePath('/settings')
}
