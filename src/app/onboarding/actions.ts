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

  // Extract form data
  const profession = formData.get('profession') as string
  const targetAudience = formData.get('targetAudience') as string
  const contentGoal = formData.get('contentGoal') as string
  
  const post1 = formData.get('post1') as string
  const post2 = formData.get('post2') as string
  const post3 = formData.get('post3') as string

  // 1. Update the User Profile
  await db.update(userProfiles)
    .set({
      profession,
      targetAudience,
      contentGoal,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.id, user.id))

  // 2. Save the pasted posts for Style DNA extraction
  // (In the next step, we will run these posts through Gemini to generate the JSON DNA)
  await db.insert(styleReferences).values({
    userId: user.id,
    linkedinUrl: 'manual-text-entry', 
    scrapedPosts: [post1, post2, post3],
    styleDna: { status: "pending_extraction", placeholder: true } 
  })

  // 3. Redirect to the Dashboard
  redirect('/dashboard')
}