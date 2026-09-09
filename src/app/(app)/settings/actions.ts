'use server'

import { db } from '@/lib/db'
import { githubAccounts, styleReferences, userProfiles } from '@/lib/db/schema'
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


export async function addGithubAccount(formData: FormData) {
  const { profile } = await currentUser()
  const label = ((formData.get('label') as string) || '').trim().toLowerCase()
  const username = ((formData.get('username') as string) || '').trim()
  if (!label || !username) return

  await db.insert(githubAccounts).values({
    userId: profile.id,
    label,
    username,
    confidential: formData.get('confidential') === 'on',
  }).onConflictDoUpdate({
    target: [githubAccounts.userId, githubAccounts.label],
    set: { username, confidential: formData.get('confidential') === 'on', active: true },
  })
  revalidatePath('/settings')
}

export async function removeGithubAccount(formData: FormData) {
  const { profile } = await currentUser()
  await db.delete(githubAccounts).where(and(
    eq(githubAccounts.id, formData.get('id') as string),
    eq(githubAccounts.userId, profile.id),
  ))
  revalidatePath('/settings')
}
