'use client'

import { useState } from 'react'
import { submitOnboarding } from './actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function OnboardingPage() {
  const [postCount, setPostCount] = useState(3)

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-2xl space-y-6">

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-medium tracking-tight">Set up your content profile</h1>
          <p className="text-muted-foreground text-sm">
            Tell us who you are and paste posts that sound how you want to sound.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form action={submitOnboarding} className="space-y-8">

              {/* Part 1: Identity */}
              <div className="space-y-4">
                <h2 className="font-medium border-b pb-2">Your profile</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profession">Your profession</Label>
                    <Input
                      id="profession"
                      name="profession"
                      placeholder="e.g. Flutter Developer at a startup"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetAudience">Who you write for</Label>
                    <Input
                      id="targetAudience"
                      name="targetAudience"
                      placeholder="e.g. Junior devs, startup founders"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contentGoal">Your main content goal</Label>
                  <Input
                    id="contentGoal"
                    name="contentGoal"
                    placeholder="e.g. Build personal brand, share technical learnings, get freelance clients"
                    required
                  />
                </div>
              </div>

              {/* Part 2: Style posts */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h2 className="font-medium">Style inspiration posts</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Paste posts that match the tone and style you want. These are your writing DNA.
                    The more you add, the better the AI understands your preferred style.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sourceLabel">
                    Who wrote these posts? <span className="text-muted-foreground font-normal">(give this set a name)</span>
                  </Label>
                  <Input
                    id="sourceLabel"
                    name="sourceLabel"
                    placeholder='e.g. "Naval Ravikant", "My mentor", "My own past posts"'
                    required
                  />
                </div>

                <div className="space-y-3">
                  {Array.from({ length: postCount }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <Label htmlFor={`post_${i}`} className="text-muted-foreground text-xs">
                        Post {i + 1}
                      </Label>
                      <Textarea
                        id={`post_${i}`}
                        name={`post_${i}`}
                        rows={3}
                        placeholder="Paste post text here..."
                        required={i < 2}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPostCount(c => c + 1)}
                  >
                    + Add another post
                  </Button>
                  {postCount > 2 && (
                    <button
                      type="button"
                      onClick={() => setPostCount(c => c - 1)}
                      className="text-xs text-muted-foreground underline underline-offset-4"
                    >
                      Remove last
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {postCount} posts · minimum 2
                  </span>
                </div>
              </div>

              <SubmitButton
                className={buttonVariants({ size: 'lg', className: 'w-full' })}
                pendingText="Analysing your style… this takes about 15 seconds"
              >
                Analyse style and continue →
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}