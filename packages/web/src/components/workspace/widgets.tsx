import { useMemo, useSyncExternalStore, type FC } from 'react'
import { BARS, type Bar } from '@crypz/exchanges'
import { CandleChart } from '@/components/trade/candle-chart'
import { useIntervals } from '@/lib/intervals'
import { MARKET_EXCHANGE } from '@/lib/market'
import { useBook, useFunding, useMarkPrice, useTicker, useTrades } from '@/lib/okx-ws'
import { fmtDuration, fmtNum, fmtPrice, fmtSigned, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WidgetKind } from './model'

export type Settings = Record<string, string | number | boolean>
export type WidgetProps = { symbol: string; settings: Settings; set: (patch: Settings) => void }

type Entry = {
  title: string
  description: string
  /** Default and minimum size in grid cells. */
  size: { w: number; h: number; minW: number; minH: number }
  Body: FC<WidgetProps>
  /** Extra controls in the widget's header. */
  Controls?: FC<WidgetProps>
}

// Shared one-second clock for countdowns, so N widgets do not run N timers.
const clock = {
  listeners: new Set<() => void>(),
  now: Date.now(),
  timer: undefined as ReturnType<typeof setInterval> | undefined,
}
const useNow = () =>
  useSyncExternalStore(
    (fn) => {
      clock.listeners.add(fn)
      clock.timer ??= setInterval(() => {
        clock.now = Date.now()
        for (const l of clock.listeners) l()
      }, 1000)
      return () => {
        clock.listeners.delete(fn)
        if (!clock.listeners.size) {
          clearInterval(clock.timer)
          clock.timer = undefined
        }
      }
    },
    () => clock.now,
    () => 0,
  )

const Waiting = () => (
  <p className="grid h-full place-items-center label">Waiting for {MARKET_EXCHANGE.toUpperCase()}…</p>
)

// ---- chart ---------------------------------------------------------------------------------------------------

function ChartBody({ symbol, settings }: WidgetProps) {
  const bar = (BARS as readonly string[]).includes(String(settings.bar)) ? (settings.bar as Bar) : '1H'
  return <CandleChart exchange={MARKET_EXCHANGE} symbol={symbol} bar={bar} className="h-full min-h-0" />
}

function ChartControls({ settings, set }: WidgetProps) {
  const { selected } = useIntervals()
  const bar = String(settings.bar ?? '1H')
  return (
    <div className="flex" role="group" aria-label="Interval">
      {BARS.filter((b) => b === bar || selected.includes(b)).map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={b === bar}
          onClick={() => set({ bar: b })}
          className={cn(
            'h-6 px-1.5 num text-[11px] text-muted-foreground hover:text-foreground',
            b === bar && 'bg-foreground text-background hover:text-background',
          )}
        >
          {b}
        </button>
      ))}
    </div>
  )
}

// ---- order book ----------------------------------------------------------------------------------------------

const ROWS = 40

/** Price groupings from the price's magnitude: e.g. 0.1 / 1 / 10 for BTC near 80,000. */
const stepsFor = (mid: number) => {
  const base = 10 ** (Math.floor(Math.log10(mid)) - 5)
  return [base, base * 10, base * 100]
}
const decimalsOf = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9))

function group(levels: Map<string, string>, step: number, side: 'bid' | 'ask') {
  const out = new Map<number, number>()
  for (const [px, sz] of levels) {
    const k = side === 'bid' ? Math.floor(Number(px) / step + 1e-9) : Math.ceil(Number(px) / step - 1e-9)
    out.set(k, (out.get(k) ?? 0) + Number(sz))
  }
  const keys = [...out.keys()].sort((a, b) => (side === 'bid' ? b - a : a - b)).slice(0, ROWS)
  let cum = 0
  return keys.map((k) => {
    cum += out.get(k)!
    return { px: k * step, sz: out.get(k)!, cum }
  })
}

function BookBody({ symbol, settings, set }: WidgetProps) {
  const book = useBook(symbol)
  const bestBid = Math.max(...[...book.bids.keys()].map(Number), 0)
  const bestAsk = Math.min(...[...book.asks.keys()].map(Number), Infinity)
  const mid = bestBid && bestAsk < Infinity ? (bestBid + bestAsk) / 2 : 0
  const step = mid ? (stepsFor(mid)[Number(settings.step ?? 0)] ?? stepsFor(mid)[0]) : 1
  const { bids, asks } = useMemo(
    () => ({ bids: group(book.bids, step, 'bid'), asks: group(book.asks, step, 'ask') }),
    [book, step],
  )
  if (!mid) return <Waiting />
  const max = Math.max(bids.at(-1)?.cum ?? 0, asks.at(-1)?.cum ?? 0)
  const dp = decimalsOf(step)
  const spread = bestAsk - bestBid
  const bidDepth = bids.slice(0, 20).reduce((s, l) => s + l.sz, 0)
  const askDepth = asks.slice(0, 20).reduce((s, l) => s + l.sz, 0)
  const bidShare = bidDepth / (bidDepth + askDepth || 1)

  const Row = ({ l, side }: { l: { px: number; sz: number; cum: number }; side: 'bid' | 'ask' }) => (
    <div className="relative grid h-[18px] shrink-0 grid-cols-3 items-center px-2 num text-[11px]">
      <i
        aria-hidden
        className={cn('absolute inset-y-0 right-0', side === 'bid' ? 'bg-up/12' : 'bg-down/12')}
        style={{ width: `${(l.cum / max) * 100}%` }}
      />
      <span className={cn('relative', side === 'bid' ? 'text-up' : 'text-down')}>{fmtNum(l.px, dp)}</span>
      <span className="relative text-right">{fmtNum(l.sz, l.sz < 10 ? 2 : 0)}</span>
      <span className="relative text-right text-muted-foreground">{fmtNum(l.cum, 0)}</span>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-2 py-0.5">
        <span className="label">Group</span>
        <div className="flex" role="group" aria-label="Price grouping">
          {stepsFor(mid).map((s, i) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === step}
              onClick={() => set({ step: i })}
              className={cn(
                'h-5 px-1.5 num text-[11px] text-muted-foreground hover:text-foreground',
                s === step && 'bg-foreground text-background hover:text-background',
              )}
            >
              {fmtNum(s, decimalsOf(s))}
            </button>
          ))}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 px-2 py-1 label">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      {/* asks run upward from the spread; overflow is clipped at the far end, never at the spread */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-hidden">
        {asks.map((l) => (
          <Row key={l.px} l={l} side="ask" />
        ))}
      </div>
      <div className="flex shrink-0 items-baseline justify-between border-y border-hairline px-2 py-1.5">
        <span className="num text-sm font-medium">{fmtPrice(mid)}</span>
        <span className="num text-[11px] whitespace-nowrap text-muted-foreground" title="Spread · basis points">
          {fmtNum(spread, decimalsOf(step / 10))} · {fmtNum((spread / mid) * 1e4, 2)}bp
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {bids.map((l) => (
          <Row key={l.px} l={l} side="bid" />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-2 py-1.5" title="Top 20 levels">
        <span className="num text-[11px] text-up">{fmtNum(bidShare * 100, 0)}%</span>
        <div className="flex h-1 flex-1 bg-down/50">
          <i className="h-full bg-up/70" style={{ width: `${bidShare * 100}%` }} />
        </div>
        <span className="num text-[11px] text-down">{fmtNum((1 - bidShare) * 100, 0)}%</span>
      </div>
    </div>
  )
}

// ---- trades tape ---------------------------------------------------------------------------------------------

function TradesBody({ symbol }: WidgetProps) {
  const trades = useTrades(symbol)
  // the biggest tenth of what is on the tape gets weight, so size jumps out without a fixed threshold
  const big = useMemo(() => {
    const sizes = trades.map((t) => Number(t.sz)).sort((a, b) => a - b)
    return sizes[Math.floor(sizes.length * 0.9)] ?? Infinity
  }, [trades])
  if (!trades.length) return <Waiting />
  const buys = trades.reduce((s, t) => s + (t.side === 'buy' ? Number(t.sz) : 0), 0)
  const all = trades.reduce((s, t) => s + Number(t.sz), 0)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-3 px-2 py-1 label">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      <ol className="min-h-0 flex-1 overflow-hidden">
        {trades.map((t) => (
          <li
            key={t.tradeId}
            className={cn(
              'grid h-[18px] grid-cols-3 items-center px-2 num text-[11px]',
              Number(t.sz) >= big && 'font-semibold',
            )}
          >
            <span className={t.side === 'buy' ? 'text-up' : 'text-down'}>{fmtPrice(Number(t.px))}</span>
            <span className="text-right">{fmtNum(Number(t.sz), Number(t.sz) < 10 ? 2 : 0)}</span>
            <span className="text-right text-muted-foreground">
              {new Date(Number(t.ts)).toLocaleTimeString('en-GB', { hour12: false })}
            </span>
          </li>
        ))}
      </ol>
      <div
        className="flex shrink-0 justify-between border-t border-hairline px-2 py-1.5 num text-[11px]"
        title={`Last ${trades.length} trades by size`}
      >
        <span className="text-up">Buy {fmtNum((buys / all) * 100, 0)}%</span>
        <span className="text-down">Sell {fmtNum((1 - buys / all) * 100, 0)}%</span>
      </div>
    </div>
  )
}

// ---- market stats --------------------------------------------------------------------------------------------

function StatsBody({ symbol }: WidgetProps) {
  const t = useTicker(symbol)
  const f = useFunding(symbol)
  const mark = useMarkPrice(symbol)
  const now = useNow()
  if (!t) return <Waiting />
  const last = Number(t.last)
  const change = ((last - Number(t.open24h)) / Number(t.open24h)) * 100
  const rate = f ? Number(f.fundingRate) * 100 : null
  const cells: { label: string; value: string; className?: string }[] = [
    { label: '24h change', value: `${fmtSigned(change)}%`, className: tone(change) },
    { label: '24h high', value: fmtPrice(Number(t.high24h)) },
    { label: '24h low', value: fmtPrice(Number(t.low24h)) },
    { label: '24h volume', value: fmtNum(Number(t.volCcy24h), 0) },
    { label: 'Mark', value: mark ? fmtPrice(Number(mark)) : '–' },
    // shown neutral: whether a positive rate is good or bad depends on which side you hold
    { label: 'Funding', value: rate === null ? '–' : `${fmtSigned(rate, Math.abs(rate) < 0.001 ? 6 : 4)}%` },
    { label: 'Next funding', value: f ? fmtDuration(Math.max(0, Number(f.fundingTime) - now)) : '–' },
  ]
  return (
    <div className="flex h-full min-h-0 items-center gap-x-8 gap-y-2 overflow-hidden px-3">
      <div className="flex shrink-0 flex-col">
        <span className="label">{symbol}</span>
        <span className="num text-2xl font-medium tracking-tight">{fmtPrice(last)}</span>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col">
            <dt className="label">{c.label}</dt>
            <dd className={cn('num text-sm', c.className)}>{c.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export const WIDGETS: Record<WidgetKind, Entry> = {
  chart: {
    title: 'Chart',
    description: 'Candles with live updates; interval per widget.',
    size: { w: 12, h: 14, minW: 6, minH: 8 },
    Body: ChartBody,
    Controls: ChartControls,
  },
  book: {
    title: 'Order book',
    description: 'Live depth ladder with grouping, spread and bid/ask imbalance.',
    size: { w: 5, h: 16, minW: 4, minH: 10 },
    Body: BookBody,
  },
  trades: {
    title: 'Trades',
    description: 'Time & sales tape; the biggest prints stand out.',
    size: { w: 5, h: 14, minW: 4, minH: 6 },
    Body: TradesBody,
  },
  stats: {
    title: 'Market stats',
    description: 'Last, 24h range and volume, mark price, funding and its countdown.',
    size: { w: 12, h: 3, minW: 6, minH: 3 },
    Body: StatsBody,
  },
}

export const isKind = (k: string): k is WidgetKind => k in WIDGETS
