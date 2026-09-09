import { redirect } from 'next/navigation'

// We only support LinkedIn OAuth — a single login page handles
// both new and returning users. This route exists only so that
// any old /signup links still work.
export default function SignupPage() {
  redirect('/login')
}