import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppSidebar } from '@/components/app/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { getPortfolio } from '@/server/portfolio'

// Shared shell for every signed-in page. Portfolio loads once here; pages read it via useLoaderData({ from: '/(main)' }).
export const Route = createFileRoute('/(main)')({
  loader: () => getPortfolio(),
  staleTime: 60_000,
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
  const { exchanges } = Route.useLoaderData()
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
