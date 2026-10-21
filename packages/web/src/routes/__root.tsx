/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { themeScript } from '@/components/theme-toggle'
import appCss from '@/styles.css?url'
import { seo } from '@/lib/seo'

const DEFAULT_DESCRIPTION =
  'Turn your OKX position history into an honest edge report, and practise on real candles with bar-by-bar replay. Read-only API keys, no manual journal.'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' },
      { name: 'theme-color', content: '#f7f7f5', media: '(prefers-color-scheme: light)' },
      { name: 'color-scheme', content: 'dark light' },
      ...seo({
        title: 'crypz · Trading journal and bar-by-bar replay',
        description: DEFAULT_DESCRIPTION,
        path: '/',
      }).meta,
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  component: () => (
    <RootDocument>
      <Outlet />
    </RootDocument>
  ),
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
