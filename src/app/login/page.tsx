import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LinkedInButton from '@/components/auth/linkedin-button'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const params = await searchParams
  const error = params?.error

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-medium tracking-tight">Postwise</h1>
          <p className="text-sm text-muted-foreground">
            Your LinkedIn content, on autopilot.
          </p>
        </div>

        {/* Auth card */}
        <div className="rounded-xl border bg-card p-6 shadow-xs ring-1 ring-foreground/10 space-y-4">
          <LinkedInButton mode="login" />

          <p className="text-center text-xs text-muted-foreground">
            New here? We&apos;ll set up your profile after sign-in.
          </p>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md text-center">
              {decodeURIComponent(error)}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our terms and privacy policy.
        </p>
      </div>
    </div>
  )
}