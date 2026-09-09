'use server'

import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { generateFromBrief } from '@/lib/jobs/weekly'

export async function compose(formData: FormData) {
  const { profile } = await currentUser()
  const brief = (formData.get('brief') as string)?.trim()
  if (!brief) redirect('/compose?error=empty')

  const platform = (formData.get('platform') as string) ?? 'linkedin'
  const pick = (name: string) => formData.getAll(name).map(String).filter(Boolean)

  await generateFromBrief(
    profile,
    brief,
    { commits: pick('commits'), entries: pick('entries'), trends: pick('trends') },
    platform as 'linkedin' | 'twitter' | 'blog',
  )
  redirect('/posts')
}
