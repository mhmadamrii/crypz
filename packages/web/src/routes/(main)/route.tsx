import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppSidebar } from '@/components/app/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { portfolioQuery, usePortfolio } from '@/lib/queries'

// Shared shell for every signed-in page. The loader fills the query cache once; pages read it with usePortfolio().
export const Route = createFileRoute('/(main)')({
  loader: ({ context }) => context.queryClient.ensureQueryData(portfolioQuery()),
  component: AppLayout,
  errorComponent: ({ error }) => (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md border border-border p-6">
        <h1 className="font-medium">Could not load your portfolio</h1>
        <p className="mt-2 num text-sm text-down">{error instanceof Error ? error.message : String(error)}</p>
        <p className="mt-4 text-sm text-muted-foreground">Check the API keys in the root .env, then reload.</p>
      </div>
    </main>
  ),
})

function AppLayout() {
  const { exchanges } = usePortfolio()
  console.log('exchanges', exchanges)
  return (
    <SidebarProvider>
      <AppSidebar exchanges={exchanges} />
      <SidebarInset className="min-w-0">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
