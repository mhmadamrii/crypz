/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'crypz' },
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
    <html lang="en">
      <head>
        <HeadContent />
        <style>{`
          body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; background: #0b0d10; color: #e6e6e6; }
          table { border-collapse: collapse; width: 100%; font-size: 13px; }
          th, td { padding: 8px 10px; border-bottom: 1px solid #222; text-align: right; white-space: nowrap; }
          th:first-child, td:first-child { text-align: left; }
          th { color: #8a8f98; font-weight: 500; }
          .pos { color: #2ebd85; } .neg { color: #f6465d; }
          .wrap { overflow-x: auto; }
        `}</style>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
