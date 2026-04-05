import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/auth/actions'
import { db } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await db.query.userProfiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  })

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium">
              Welcome, {profile?.fullName || user.email}
            </h1>
            <p className="text-sm text-muted-foreground">
              {profile?.onboardingComplete
                ? 'Your content engine is active.'
                : 'Complete onboarding to get started.'}
            </p>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>

        {!profile?.onboardingComplete && (
          <a href="/onboarding"
            className="block p-4 border rounded-lg text-sm hover:bg-muted transition-colors">
            Complete your profile setup →
          </a>
        )}
      </div>
    </div>
  )
}