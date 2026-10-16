import { Link, Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowRight, KeyRound, Rewind } from 'lucide-react'
import type { ExchangeId } from '@crypz/exchanges'
import { Button } from '@/components/ui/button'
import { usePortfolio } from '@/lib/queries'

// Account pages: everything here reads one connected exchange, named in the URL (/okx/overview, later
// /binance/overview). Market pages live outside this group and never need a key.
const EXCHANGES: readonly ExchangeId[] = ['okx', 'binance']

export const Route = createFileRoute('/(main)/(account)/$exchange')({
  params: {
    parse: (p: { exchange: string }) => ({ exchange: p.exchange as ExchangeId }),
    stringify: (p: { exchange: ExchangeId }) => ({ exchange: p.exchange }),
  },
  beforeLoad: ({ params }) => {
    if (!EXCHANGES.includes(params.exchange)) throw notFound()
  },
  component: AccountLayout,
})

function AccountLayout() {
  const { exchange } = Route.useParams()
  const { exchanges } = usePortfolio()
  const status = exchanges.find((e) => e.id === exchange)
  return status?.configured ? <Outlet /> : <ConnectFirst name={status?.name ?? exchange.toUpperCase()} />
}

function ConnectFirst({ name }: { name: string }) {
  return (
    <main className="grid flex-1 place-items-center p-6">
      <div className="flex max-w-md flex-col items-start gap-4 border border-border p-6">
        <KeyRound className="size-5" strokeWidth={1.5} />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight">Connect {name}</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Account pages read your closed positions straight from the exchange. Add a read-only API key and your desk
            fills in. Market pages work without one.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/settings/exchanges">
              Connect {name} <ArrowRight />
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
