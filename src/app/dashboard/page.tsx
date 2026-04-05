import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/auth/actions'
import { db } from '@/lib/db'
import { userProfiles, linkedinProfiles, styleReferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, linkedinData, styleRefs] = await Promise.all([
    db.query.userProfiles.findFirst({
      where: (p, { eq }) => eq(p.id, user.id),
    }),
    db.query.linkedinProfiles.findFirst({
      where: (p, { eq }) => eq(p.userId, user.id),
    }),
    db.query.styleReferences.findMany({
      where: (s, { eq }) => eq(s.userId, user.id),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    }),
  ])

  if (!profile?.onboardingComplete) redirect('/onboarding')

  const experience = (linkedinData?.experience as any[]) ?? []
  const currentRole = experience.find((e: any) => e.isCurrent) ?? experience[0]

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-3xl mx-auto p-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {profile.avatarUrl && (
              <img
                src={profile.avatarUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <div>
              <h1 className="text-xl font-medium">{profile.fullName ?? user.email}</h1>
              <p className="text-sm text-muted-foreground">
                {linkedinData?.headline ?? profile.profession}
              </p>
            </div>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>

        {/* LinkedIn profile card (only if OAuth data exists) */}
        {linkedinData && (
          <div className="rounded-xl border bg-white dark:bg-zinc-900 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">LinkedIn profile</h2>
              <span className="text-xs text-muted-foreground">
                Used to personalise your posts
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {linkedinData.headline && (
                <div>
                  <p className="text-xs text-muted-foreground">Current role</p>
                  <p>{linkedinData.headline}</p>
                </div>
              )}
              {linkedinData.industry && (
                <div>
                  <p className="text-xs text-muted-foreground">Industry</p>
                  <p>{linkedinData.industry}</p>
                </div>
              )}
              {linkedinData.location && (
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p>{linkedinData.location}</p>
                </div>
              )}
              {profile.targetAudience && (
                <div>
                  <p className="text-xs text-muted-foreground">Writing for</p>
                  <p>{profile.targetAudience}</p>
                </div>
              )}
            </div>
            {currentRole && (
              <div className="pt-2 border-t text-sm">
                <p className="text-xs text-muted-foreground mb-1">Most recent experience</p>
                <p className="font-medium">{currentRole.title}</p>
                <p className="text-muted-foreground">{currentRole.company}</p>
              </div>
            )}
          </div>
        )}

        {/* Style references */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Style DNA</h2>
            <a href="/onboarding/add-style" className="text-xs underline underline-offset-4 text-muted-foreground">
              + Add more posts
            </a>
          </div>
          {styleRefs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No style references yet.</p>
          ) : (
            <div className="space-y-2">
              {styleRefs.map(ref => {
                const dna = ref.styleDna as any
                return (
                  <div key={ref.id} className="rounded-lg border bg-white dark:bg-zinc-900 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{ref.sourceLabel}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {ref.postCount} posts
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ref.dnaStatus === 'done'
                            ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                            : ref.dnaStatus === 'failed'
                            ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {ref.dnaStatus}
                        </span>
                      </div>
                    </div>
                    {dna?.styleSummary && (
                      <p className="text-xs text-muted-foreground">{dna.styleSummary}</p>
                    )}
                    {dna && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {dna.tone && (
                          <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            {dna.tone}
                          </span>
                        )}
                        {dna.hookPattern && (
                          <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            {dna.hookPattern} hooks
                          </span>
                        )}
                        {dna.avgWordCount && (
                          <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            ~{dna.avgWordCount} words
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Content goal summary */}
        {profile.contentGoal && (
          <div className="rounded-lg border bg-white dark:bg-zinc-900 p-4 text-sm">
            <p className="text-xs text-muted-foreground mb-1">Content goal</p>
            <p>{profile.contentGoal}</p>
          </div>
        )}

      </div>
    </div>
  )
}