import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { PageHeader } from '@/components/app/page-header'
import { PositionsTable } from '@/components/dashboard/positions-table'

export const Route = createFileRoute('/(main)/positions')({
  head: () => ({ meta: [{ title: 'Positions · crypz' }] }),
  component: Positions,
})

function Positions() {
  const { positions, fetchedAt } = useLoaderData({ from: '/(main)' })
  return (
    <>
      <PageHeader title="Positions" />
      <main className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
        <p className="text-sm text-muted-foreground">
          Every closed position the exchange returns. Filter, sort, and open any instrument on OKX.
        </p>
        <PositionsTable positions={positions} />
        <p className="border-t border-border pt-4 num text-xs text-muted-foreground">
          Synced {new Date(fetchedAt).toLocaleString('en-GB')}
        </p>
      </main>
    </>
  )
}
