import { ArrowUpRight, CandlestickChart } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Reserved for the price chart. Engine undecided: TradingView widget or lightweight-charts. */
export function ChartSlot({ symbol, tradeUrl }: { symbol: string | null; tradeUrl: string | null }) {
  return (
    <div className="relative flex min-h-80 flex-col border border-dashed border-border">
      <div className="flex items-center justify-between border-b border-dashed border-border px-4 py-2.5">
        <span className="num text-sm">{symbol ?? 'No instrument'}</span>
        <div className="flex gap-1">
          {['15m', '1H', '4H', '1D'].map((tf) => (
            <Button key={tf} variant="ghost" size="xs" disabled className="num">
              {tf}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <CandlestickChart className="size-6 text-muted-foreground" strokeWidth={1.25} />
          <p className="text-sm font-medium">Chart engine not wired yet</p>
          <p className="text-sm text-muted-foreground">
            This slot takes the TradingView widget or lightweight-charts. Entries and exits from your history will plot
            here.
          </p>
          {tradeUrl && (
            <Button variant="outline" size="sm" asChild className="mt-1">
              <a href={tradeUrl} target="_blank" rel="noreferrer">
                Open {symbol} on OKX <ArrowUpRight />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
