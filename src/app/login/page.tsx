import { signIn } from '@/app/auth/actions'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-medium">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your Postwise account</p>
        </div>

        <Card>
          <CardContent className="pt-2 space-y-4">
            {/* LinkedIn OAuth */}
            <LinkedInButton mode="login" />

            {/* <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or continue with email</span>
              </div>
            </div> */}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {decodeURIComponent(error)}
              </p>
            )}

            {/* <form action={signIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full">Sign in</Button>
            </form> */}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          No account yet?{' '}
          <Link href="/signup" className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}