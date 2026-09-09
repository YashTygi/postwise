import Link from 'next/link'
import { currentUser } from '@/lib/auth'
import { signOut } from '@/app/auth/actions'

const NAV = [
  ['/dashboard', 'Overview'],
  ['/journal', 'Journal'],
  ['/commits', 'Commits'],
  ['/trends', 'Trends'],
  ['/compose', 'Compose'],
  ['/posts', 'Drafts'],
  ['/settings', 'Settings'],
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await currentUser()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b bg-white dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold">Postwise</Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground overflow-x-auto">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-foreground whitespace-nowrap">{label}</Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto">
            <button className="text-xs text-muted-foreground hover:text-foreground">Sign out</button>
          </form>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">{children}</main>
      <footer className="max-w-5xl mx-auto px-6 pb-8 text-xs text-muted-foreground">
        {profile.telegramChatId ? 'Telegram linked' : 'Telegram not linked — see Settings'}
      </footer>
    </div>
  )
}
