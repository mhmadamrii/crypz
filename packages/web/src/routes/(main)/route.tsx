import { useState } from 'react'
import { Link, Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { ArrowRight, KeyRound, Rewind } from 'lucide-react'
import { AppSidebar } from '@/components/app/app-sidebar'
import { Button } from '@/components/ui/button'
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
  // Replay is a focus mode: the sidebar starts collapsed there and keeps its own open state.
  const replay = pathname.startsWith('/trade/replay')
  const [open, setOpen] = useState(true)
  const [replayOpen, setReplayOpen] = useState(false)
  // Without a key, the history pages have nothing to show. Trade and Replay run on public market data, so they
  // stay open: anyone signed in can practise on the chart.
  const connected = exchanges.some((e) => e.configured)
  const unlocked = connected || pathname.startsWith('/settings') || pathname.startsWith('/trade')
  return (
    <SidebarProvider open={replay ? replayOpen : open} onOpenChange={replay ? setReplayOpen : setOpen}>
      <AppSidebar exchanges={exchanges} user={user} />
      <SidebarInset className="min-w-0">{unlocked ? <Outlet /> : <ConnectFirst />}</SidebarInset>
    </SidebarProvider>
  )
}

function ConnectFirst() {
  return (
    <main className="grid flex-1 place-items-center p-6">
      <div className="flex max-w-md flex-col items-start gap-4 border border-border p-6">
        <KeyRound className="size-5" strokeWidth={1.5} />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight">Connect an exchange</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            crypz reads your closed positions straight from the exchange. Add a read-only API key and your desk fills
            in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/settings/exchanges">
              Connect OKX <ArrowRight />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/trade/replay">
              <Rewind /> Try Replay, no key needed
            </Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
