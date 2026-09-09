import { Spinner } from '@/components/submit-button'

export default function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
      <Spinner className="size-4" />
      Loading…
    </div>
  )
}
