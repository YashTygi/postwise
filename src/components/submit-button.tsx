'use client'

import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin shrink-0', className)}
      width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Submit button that knows when its own form is in flight.
 *
 * useFormStatus reads the pending state of the enclosing form, so a server
 * action that takes twenty seconds shows a spinner instead of looking dead.
 * Nothing is more confusing than a click that produces no visible change.
 */
export function SubmitButton({
  children,
  className,
  pendingText,
}: {
  children: React.ReactNode
  className?: string
  pendingText?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-opacity',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
    >
      {pending && <Spinner />}
      {pending && pendingText ? pendingText : children}
    </button>
  )
}
