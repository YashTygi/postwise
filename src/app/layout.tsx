import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Inter } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const TITLE = 'Postwise'
const DESCRIPTION =
  'A daily journal that writes itself into LinkedIn posts. Postwise reads your commits, asks you one question a night about what you actually built, and turns a week of real work into drafts in your own voice.'

export const metadata: Metadata = {
  // Makes every relative OG/canonical URL below resolve correctly.
  metadataBase: new URL(SITE),
  title: {
    default: `${TITLE} — your work, written up`,
    template: `%s · ${TITLE}`,
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  keywords: [
    'LinkedIn content', 'developer writing', 'build in public',
    'GitHub commits', 'technical blogging', 'personal brand', 'dev journal',
  ],
  authors: [{ name: 'Yash Tyagi' }],
  creator: 'Yash Tyagi',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: TITLE,
    title: `${TITLE} — your work, written up`,
    description: DESCRIPTION,
    url: '/',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} — your work, written up`,
    description: DESCRIPTION,
  },
  // It is a personal tool behind a login; there is nothing to index and the
  // pages that matter are all private anyway.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'light dark',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('h-full', 'antialiased', geistSans.variable, geistMono.variable, 'font-sans', inter.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
