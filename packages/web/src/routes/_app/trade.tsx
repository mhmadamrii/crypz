import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useLoaderData } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { BARS, type Bar, type Position, type Ticker } from '@crypz/exchanges'
import { PageHeader } from '@/components/app/page-header'
import { CandleChart } from '@/components/trade/candle-chart'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getTicker } from '@/server/market'
import { cn } from '@/lib/utils'
import { fmtDate, fmtDuration, fmtNum, fmtPct, fmtPrice, fmtSigned, tone } from '@/lib/format'

type Search = { symbol?: string; bar?: Bar; trade?: string }

const DEFAULT_SYMBOL = 'BTC-USDT-SWAP'

export const Route = createFileRoute('/_app/trade')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    symbol: typeof s.symbol === 'string' ? s.symbol.toUpperCase() : undefined,
    bar: typeof s.bar === 'string' && (BARS as readonly string[]).includes(s.bar) ? (s.bar as Bar) : undefined,
    trade: typeof s.trade === 'string' ? s.trade : undefined,
  }),
  head: () => ({ meta: [{ title: 'Trade · crypz' }] }),
  component: Trade,
})

function useTicker(symbol: string) {
  const [ticker, setTicker] = useState<Ticker | null>(null)
  useEffect(() => {
    let alive = true
    setTicker(null)
    const pull = () =>
      getTicker({ data: { exchange: 'okx', symbol } })
        .then((t) => alive && setTicker(t))
        .catch(() => {})
    void pull()
    const id = setInterval(pull, 10_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [symbol])
  return ticker
}

function Trade() {
  const data = useLoaderData({ from: '/_app' })
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const set = (patch: Search) => navigate({ search: (s) => ({ ...s, ...patch }), replace: true })

  const symbols = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of data.positions) n.set(p.symbol, (n.get(p.symbol) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  }, [data.positions])

  const symbol = search.symbol ?? data.positions[0]?.symbol ?? DEFAULT_SYMBOL
  const bar = search.bar ?? '1H'
  const options = symbols.includes(symbol) ? symbols : [symbol, ...symbols]
  const mine = useMemo(() => data.positions.filter((p) => p.symbol === symbol), [data.positions, symbol])
  const selected = mine.find((p) => p.id === search.trade) ?? null
  const focus = useMemo(() => (selected ? { from: selected.openedAt, to: selected.closedAt } : null), [selected])
  const ticker = useTicker(symbol)
  const exchange = mine[0]?.exchange ?? 'okx'
  const tradeUrl = mine[0]?.tradeUrl ?? `https://www.okx.com/trade-swap/${symbol.toLowerCase()}`

  return (
    <>
      <PageHeader title="Trade">
        <Select value={symbol} onValueChange={(v) => set({ symbol: v, trade: undefined })}>
          <SelectTrigger size="sm" className="w-40 num sm:w-52" aria-label="Instrument">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {options.map((s) => (
              <SelectItem key={s} value={s} className="num">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={bar}
          onValueChange={(v) => v && set({ bar: v as Bar })}
          aria-label="Timeframe"
          className="hidden sm:flex"
        >
          {BARS.map((b) => (
            <ToggleGroupItem
              key={b}
              value={b}
              className="px-2.5 num text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {b}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PageHeader>

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-8">
        <TickerStrip symbol={symbol} ticker={ticker} tradeUrl={tradeUrl} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="flex flex-col border border-border">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={bar}
              onValueChange={(v) => v && set({ bar: v as Bar })}
              aria-label="Timeframe"
              className="m-3 sm:hidden"
            >
              {BARS.map((b) => (
                <ToggleGroupItem
                  key={b}
                  value={b}
                  className="flex-1 num text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
                >
                  {b}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <CandleChart
              exchange={exchange}
              symbol={symbol}
              bar={bar}
              positions={mine}
              focus={focus}
              className="h-[min(68dvh,640px)] min-h-[420px]"
            />
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 bg-foreground" /> Close above open
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 shadow-[inset_0_0_0_1px_var(--foreground)]" /> Close below open
              </span>
              <span className="num">L / S = your entry · square = your exit, toned by result</span>
            </div>
          </div>

          <YourTrades
            symbol={symbol}
            positions={mine}
            selected={selected?.id ?? null}
            onSelect={(id) => set({ trade: id === search.trade ? undefined : id })}
          />
        </div>
      </main>
    </>
  )
}

function TickerStrip({ symbol, ticker, tradeUrl }: { symbol: string; ticker: Ticker | null; tradeUrl: string }) {
  const change = ticker ? (ticker.last - ticker.open24h) / ticker.open24h : 0
  const cells = [
    { label: '24h change', value: ticker ? `${fmtSigned(change * 100)}%` : '–' },
    { label: '24h high', value: ticker ? fmtPrice(ticker.high24h) : '–' },
    { label: '24h low', value: ticker ? fmtPrice(ticker.low24h) : '–' },
    { label: '24h volume', value: ticker ? fmtNum(ticker.volume24h, 0) : '–' },
  ]
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-5">
      <div className="flex flex-col gap-1">
        <span className="label">{symbol}</span>
        <span className="num text-4xl font-medium tracking-tight">{ticker ? fmtPrice(ticker.last) : '–'}</span>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-1">
            <dt className="label">{c.label}</dt>
            <dd className="num text-sm">{c.value}</dd>
          </div>
        ))}
      </dl>
      <Button variant="outline" size="sm" asChild className="ml-auto">
        <a href={tradeUrl} target="_blank" rel="noreferrer">
          Trade on OKX <ArrowUpRight />
        </a>
      </Button>
    </div>
  )
}

function YourTrades({
  symbol,
  positions,
  selected,
  onSelect,
}: {
  symbol: string
  positions: Position[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const net = positions.reduce((s, p) => s + p.realizedPnl, 0)
  const wins = positions.filter((p) => p.realizedPnl > 0).length
  return (
    <aside className="flex max-h-[min(80dvh,760px)] flex-col border border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Your trades on {symbol.split('-')[0]}</h2>
        <dl className="mt-2 flex gap-5 text-xs text-muted-foreground [&>div]:flex [&>div]:gap-1.5">
          <div>
            <dt>Trades</dt>
            <dd className="num text-foreground">{positions.length}</dd>
          </div>
          <div>
            <dt>Win</dt>
            <dd className="num text-foreground">{positions.length ? fmtPct(wins / positions.length, 0) : '–'}</dd>
          </div>
          <div>
            <dt>Net</dt>
            <dd className={cn('num', tone(net))}>{fmtSigned(net)}</dd>
          </div>
        </dl>
      </div>
      {positions.length ? (
        <ol className="flex-1 overflow-y-auto">
          {positions.map((p) => {
            const on = p.id === selected
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-hairline px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-accent/60',
                    on && 'bg-accent',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <i className={cn('size-1.5 shrink-0', on ? 'bg-foreground' : 'bg-transparent')} />
                    <span className="label text-foreground">{p.side}</span>
                    <span className="num text-muted-foreground">{p.leverage}x</span>
                  </span>
                  <span className={cn('text-right num font-medium', tone(p.realizedPnl))}>
                    {fmtSigned(p.realizedPnl, 4)}
                  </span>
                  <span className="num text-xs text-muted-foreground">
                    {fmtDate(p.closedAt)} · {fmtDuration(p.closedAt - p.openedAt)}
                  </span>
                  <span className="text-right num text-xs text-muted-foreground">
                    {fmtPrice(p.entryPrice)} → {fmtPrice(p.exitPrice)}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No closed positions on this instrument yet.</p>
      )}
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Select a trade to jump the chart to it.
      </p>
    </aside>
  )
}
