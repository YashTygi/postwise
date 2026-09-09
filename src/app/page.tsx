import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Nothing lives at "/" — it is a signpost. Logged in goes to the dashboard,
// everyone else to the login page.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
