'use client'

import { useState } from 'react'
import { addStyleReference } from '../actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function AddStylePage() {
  const [postCount, setPostCount] = useState(2)

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <a href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-4">
            ← Back to dashboard
          </a>
          <h1 className="text-2xl font-medium mt-4">Add style inspiration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste posts from another writer you admire. Each set gets its own style profile.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form action={addStyleReference} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="sourceLabel">Who wrote these?</Label>
                <Input
                  id="sourceLabel"
                  name="sourceLabel"
                  placeholder='e.g. "Andrew Huberman", "My CEO", "Writing I found inspiring"'
                  required
                />
              </div>

              <div className="space-y-3">
                {Array.from({ length: postCount }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Post {i + 1}</Label>
                    <Textarea
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
                  + Add post
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
              </div>

              <SubmitButton
                className={buttonVariants({ className: 'w-full' })}
                pendingText="Extracting the rubric…"
              >
                Save style reference →
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}