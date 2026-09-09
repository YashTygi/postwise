import { Spinner } from '@/components/submit-button'

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-4" />
      Loading…
    </div>
  )
}
