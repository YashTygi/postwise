import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { submitOnboarding } from './actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-medium tracking-tight">Set up your Style DNA</h1>
          <p className="text-muted-foreground">
            Tell us about your goals and paste 3 posts that sound exactly how you want to sound.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form action={submitOnboarding} className="space-y-8">
              
              {/* Part 1: Identity */}
              <div className="space-y-4">
                <h2 className="text-lg font-medium border-b pb-2">1. Your Profile</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profession">Profession / Title</Label>
                    <Input id="profession" name="profession" placeholder="e.g. Flutter Developer" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetAudience">Target Audience</Label>
                    <Input id="targetAudience" name="targetAudience" placeholder="e.g. CTOs, Junior Devs" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contentGoal">What is your main content goal?</Label>
                  <Input id="contentGoal" name="contentGoal" placeholder="e.g. Get freelance clients, share learnings" required />
                </div>
              </div>

              {/* Part 2: Style Extraction */}
              <div className="space-y-4">
                <h2 className="text-lg font-medium border-b pb-2">2. Style Examples</h2>
                <p className="text-sm text-muted-foreground">
                  Paste the text of 3 LinkedIn posts that perfectly match the tone, formatting, and style you want to achieve.
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="post1">Example Post 1</Label>
                    <Textarea id="post1" name="post1" rows={3} required placeholder="Paste post text here..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post2">Example Post 2</Label>
                    <Textarea id="post2" name="post2" rows={3} required placeholder="Paste post text here..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post3">Example Post 3</Label>
                    <Textarea id="post3" name="post3" rows={3} required placeholder="Paste post text here..." />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg">
                Analyze Style DNA & Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}