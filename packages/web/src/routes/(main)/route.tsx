import { useState } from 'react'
import { Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { AppSidebar } from '@/components/app/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { authClient } from '@/lib/auth-client'
import { portfolioQuery, usePortfolio } from '@/lib/queries'

// Shared shell for every signed-in page. It renders in the browser only (ssr: false): the session cookie belongs
// to the API's domain, so the browser is the one that can prove who is asking. The loader fills the query cache
// once; pages read it with usePortfolio().
export const Route = createFileRoute('/(main)')({
  ssr: false,
  // signed-in pages are private: keep them out of search results
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession()
    if (!data) throw redirect({ to: '/login', search: { redirect: location.href } })
    return { user: data.user }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(portfolioQuery()),
  pendingComponent: () => (
    <main className="grid min-h-dvh place-items-center label" aria-busy>
      Loading your desk…
    </main>
  ),
  component: AppLayout,
  errorComponent: ({ error }) => (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md border border-border p-6">
        <h1 className="font-medium">Could not load your portfolio</h1>
        <p className="mt-2 num text-sm text-down">{error instanceof Error ? error.message : String(error)}</p>
        <p className="mt-4 text-sm text-muted-foreground">Check that the API is running, then reload.</p>
      </div>
    </main>
  ),
})

function AppLayout() {
  const { exchanges } = usePortfolio()
  const { user } = Route.useRouteContext()
  console.log('exchanges', exchanges)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Replay is a focus mode: no sidebar at all, its header carries the way out.
  const [open, setOpen] = useState(true)
  if (pathname.startsWith('/trade/replay')) return <Outlet />
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <AppSidebar exchanges={exchanges} user={user} />
      <SidebarInset className="min-w-0">
        {/* Market pages need no key; Account pages gate themselves in (account)/$exchange */}
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
