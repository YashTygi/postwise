'use server'

import { db } from '@/lib/db'
import { posts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentUser } from '@/lib/auth'

/**
 * Save your edit next to the original draft. Those pairs get fed back as
 * few-shot examples on the next generation — quality climbs with no tuning.
 */
export async function saveEdit(formData: FormData) {
  const { profile } = await currentUser()
  const id = formData.get('id') as string
  const editedContent = (formData.get('editedContent') as string)?.trim()
  await db.update(posts)
    .set({ editedContent: editedContent || null })
    .where(and(eq(posts.id, id), eq(posts.userId, profile.id)))
  revalidatePath('/posts')
}

export async function setStatus(formData: FormData) {
  const { profile } = await currentUser()
  const id = formData.get('id') as string
  const status = formData.get('status') as string
  await db.update(posts)
    .set({ status, postedAt: status === 'posted' ? new Date() : null })
    .where(and(eq(posts.id, id), eq(posts.userId, profile.id)))
  revalidatePath('/posts')
}
