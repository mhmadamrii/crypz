/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { themeScript } from '@/components/theme-toggle'
import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'crypz — your trades, one square at a time' },
      { name: 'description', content: 'Trading journal and edge report built straight from your exchange history.' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
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
        <Scripts />
      </body>
    </html>
  )
}
