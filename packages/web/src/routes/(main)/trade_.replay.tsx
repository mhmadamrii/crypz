import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Minus,
  Pause,
  Play,
  Shuffle,
  StepForward,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { BAR_MS, BARS, type Bar, type Candle, type ExchangeId } from '@crypz/exchanges'
import { DrawingToolbar } from '@/components/drawings/toolbar'
import { IntervalBar, useIntervalHotkeys } from '@/components/trade/interval-bar'
import { ReplayChart } from '@/components/trade/replay-chart'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { replayCandlesQuery, usePortfolio, useTradedSymbols } from '@/lib/queries'
import { initialReplay, levelError, replayReducer, sessionStats, type Side } from '@/lib/replay'
import { fmtNum, fmtPct, fmtPrice, fmtSigned, tone } from '@/lib/format'
import { searchText } from '@/lib/search'
import { cn } from '@/lib/utils'

type Search = { symbol?: string; bar?: Bar; from?: string; equity?: string }

const DEFAULT_SYMBOL = 'BTC-USDT-SWAP'
const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const SPEEDS = [1, 2, 5, 10] // bars per second
const DAY = 864e5

/** ms → the `YYYY-MM-DDTHH:mm` a datetime-local input speaks, in the viewer's zone. */
const toLocalInput = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const startOfDay = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime()

const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export const Route = createFileRoute('/(main)/trade_/replay')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    symbol: typeof s.symbol === 'string' ? s.symbol.toUpperCase() : undefined,
    bar: typeof s.bar === 'string' && (BARS as readonly string[]).includes(s.bar) ? (s.bar as Bar) : undefined,
    from: typeof s.from === 'string' && LOCAL_MINUTE.test(s.from) ? s.from : undefined,
    equity: /^\d*\.?\d*$/.test(searchText(s.equity) ?? 'x') ? searchText(s.equity) : undefined,
  }),
  head: () => ({ meta: [{ title: 'Replay · crypz' }] }),
  component: Replay,
})

function Replay() {
  const { positions } = usePortfolio()
  const symbols = useTradedSymbols()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const set = (patch: Search) => navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  // lives above the keyed session so a new interval or start date keeps the panel as you left it
  const [panel, setPanel] = useState(true)
  useIntervalHotkeys((b) => set({ bar: b }))

  const symbol = search.symbol ?? symbols[0] ?? DEFAULT_SYMBOL
  const bar = search.bar ?? '1H'
  const fromInput = search.from ?? toLocalInput(startOfDay(Date.now() - 30 * DAY))
  const from = new Date(fromInput).getTime()
  const exchange = positions.find((p) => p.symbol === symbol)?.exchange ?? 'okx'
  const options = symbols.includes(symbol) ? symbols : [symbol, ...symbols]

  const shuffle = () => {
    // anywhere from two years back to two weeks ago, on the hour
    const span = 730 * DAY - 14 * DAY
    const ms = Date.now() - 14 * DAY - Math.random() * span
    set({ from: toLocalInput(Math.floor(ms / 36e5) * 36e5) })
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:gap-3 sm:px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-5 sm:block" />
        <span className="hidden label sm:inline">Replay</span>
        <Select value={symbol} onValueChange={(v) => set({ symbol: v })}>
          <SelectTrigger size="sm" className="w-28 num sm:w-48" aria-label="Instrument">
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
        <IntervalBar value={bar} onChange={(v) => set({ bar: v })} className="hidden md:flex" />
        <label className="flex items-center gap-2">
          <span className="hidden label lg:inline">Start</span>
          <Input
            type="datetime-local"
            value={fromInput}
            max={toLocalInput(Date.now())}
            onChange={(e) => LOCAL_MINUTE.test(e.target.value) && set({ from: e.target.value })}
            className="h-8 w-36 px-2 num text-xs sm:w-[12.75rem] sm:px-3"
            aria-label="Replay start"
          />
        </label>
        <Button variant="outline" size="sm" onClick={shuffle} title="Random start date">
          <Shuffle />
          <span className="hidden xl:inline">Random</span>
        </Button>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="hidden sm:contents">
            <ThemeToggle />
          </span>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/trade" search={{ symbol, bar }}>
              <X />
              <span className="hidden sm:inline">Exit replay</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* a new instrument, timeframe or start date is a fresh session */}
      <ReplaySession
        key={`${exchange}:${symbol}:${bar}:${from}`}
        exchange={exchange}
        symbol={symbol}
        bar={bar}
        from={from}
        onBar={(b) => set({ bar: b })}
        equity={search.equity ?? ''}
        onEquity={(v) => set({ equity: v || undefined })}
        panel={panel}
        onPanel={setPanel}
      />
    </div>
  )
}

function ReplaySession({
  exchange,
  symbol,
  bar,
  from,
  onBar,
  equity,
  onEquity,
  panel,
  onPanel,
}: {
  exchange: ExchangeId
  symbol: string
  bar: Bar
  from: number
  onBar: (bar: Bar) => void
  /** Optional starting equity (raw field text); every trade compounds the whole balance at 1×. */
  equity: string
  onEquity: (v: string) => void
  /** Ticket + log column shown, or folded to a rail. */
  panel: boolean
  onPanel: (open: boolean) => void
}) {
  const q = useInfiniteQuery(replayCandlesQuery(exchange, symbol, bar, from))
  const candles = useMemo(() => {
    const byTime = new Map<number, Candle>()
    for (const page of q.data?.pages ?? []) for (const k of page) byTime.set(k.time, k)
    return [...byTime.values()].sort((a, b) => a.time - b.time)
  }, [q.data])
  const startIdx = useMemo(() => {
    let i = -1
    while (i + 1 < candles.length && candles[i + 1].time <= from) i++
    return i
  }, [candles, from])

  const [state, dispatch] = useReducer(replayReducer, initialReplay)
  const cursor = startIdx + state.step
  const revealed = useMemo(() => (startIdx < 0 ? [] : candles.slice(0, cursor + 1)), [candles, cursor, startIdx])
  const current = startIdx < 0 ? undefined : candles[cursor]
  const ended = !candles[cursor + 1] && !q.hasNextPage && q.isSuccess

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)

  // a closed trade clears the ticket (adjusting state while rendering, not in an effect)
  const [settled, setSettled] = useState(0)
  if (settled !== state.trades.length) {
    setSettled(state.trades.length)
    setStop('')
    setTarget('')
  }

  const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null)

  const advance = () => {
    const next = candles[cursor + 1]
    const more = q.hasNextPage && !q.isFetchingNextPage
    if (!next) {
      if (more) void q.fetchNextPage()
      else if (!q.hasNextPage) setPlaying(false)
      return
    }
    dispatch({ type: 'step', candle: next })
    if (candles.length - cursor < 60 && more) void q.fetchNextPage()
  }

  const open = (side: Side) => {
    if (!current || state.position) return
    const s = num(stop)
    const t = num(target)
    const err = levelError(side, current.close, s, t)
    setError(err)
    if (!err) dispatch({ type: 'open', side, candle: current, stop: s, target: t })
  }

  const close = () => current && dispatch({ type: 'close', candle: current })

  const editLevel = (which: 'stop' | 'target', v: string) => {
    if (which === 'stop') setStop(v)
    else setTarget(v)
    const p = state.position
    if (!p || !current) return
    const s = which === 'stop' ? num(v) : p.stop
    const t = which === 'target' ? num(v) : p.target
    const err = levelError(p.side, current.close, s, t)
    setError(err)
    if (!err) dispatch({ type: 'levels', stop: s, target: t })
  }

  // The timer and key handlers outlive renders; they call whatever the latest render defined.
  const live = useRef({ advance, open, close, toggle: () => {} })
  live.current = { advance, open, close, toggle: () => setPlaying((p) => !p && !ended) }

  // Autoplay: one bar per tick.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => live.current.advance(), 1000 / speed)
    return () => clearInterval(id)
  }, [playing, speed])

  // Keyboard: Space play/pause, → next bar, B long, S short, X close. Typing in a field never triggers them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [role="combobox"], [role="listbox"]')) return
      const k = e.key.toLowerCase()
      if (k === ' ') live.current.toggle()
      else if (k === 'arrowright') live.current.advance()
      else if (k === 'b') live.current.open('long')
      else if (k === 's') live.current.open('short')
      else if (k === 'x') live.current.close()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const stats = sessionStats(state.trades)
  const p = state.position
  const openPct = p && current ? ((p.side === 'long' ? 1 : -1) * (current.close - p.entry) * 100) / p.entry : 0
  const openR =
    p && current && p.stop !== null
      ? ((p.side === 'long' ? 1 : -1) * (current.close - p.entry)) / Math.abs(p.entry - p.stop)
      : null

  // Compounding: each trade moves the full balance by its % result.
  const start = num(equity)
  const balances = state.trades.reduce<number[]>(
    (acc, t) => [...acc, acc[acc.length - 1] * (1 + t.pct / 100)],
    [start ?? 0],
  )
  const closedBalance = balances[balances.length - 1]
  const balance = closedBalance * (1 + openPct / 100)
  const growth = start ? (balance / start - 1) * 100 : 0
  const Trend = growth > 0 ? TrendingUp : growth < 0 ? TrendingDown : Minus

  const blocker = q.isPending
    ? 'Loading candles…'
    : q.isError
      ? `Could not load candles: ${q.error.message}`
      : startIdx < 0
        ? 'No candles before this start date. Pick a later one.'
        : null

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-1">
      <section className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-1">
          <DrawingToolbar symbol={symbol} className="shrink-0 border-r border-border" />
          <div className="relative min-h-0 flex-1">
            <ReplayChart
              intraday={BAR_MS[bar] < BAR_MS['1D']}
              barMs={BAR_MS[bar]}
              symbol={symbol}
              candles={revealed}
              position={p}
              trades={state.trades}
              className="absolute inset-0"
            />
            {blocker && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-background/80 p-6 text-center text-sm text-muted-foreground">
                {blocker}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3 py-2 sm:px-4">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => live.current.toggle()}
              disabled={!current || ended}
              aria-label={playing ? 'Pause' : 'Play'}
              className="w-20"
            >
              {playing ? <Pause /> : <Play />}
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button variant="outline" size="sm" onClick={advance} disabled={!current || ended} aria-label="Next bar">
              <StepForward />
            </Button>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(speed)}
            onValueChange={(v) => v && setSpeed(Number(v))}
            aria-label="Bars per second"
          >
            {SPEEDS.map((s) => (
              <ToggleGroupItem
                key={s}
                value={String(s)}
                className="px-2 num text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
              >
                {s}×
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <IntervalBar value={bar} onChange={onBar} className="md:hidden" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="num text-sm">{current ? fmtWhen(current.time) : '–'}</span>
            <span className="num text-[11px] text-muted-foreground">
              {ended ? 'End of history' : `Bar +${state.step} · ${bar}`}
              {q.isFetchingNextPage && ' · loading ahead'}
            </span>
          </div>
          <p className="ml-auto hidden num text-[11px] text-muted-foreground xl:block">
            <Kbd>Space</Kbd> play <Kbd>→</Kbd> next <Kbd>B</Kbd> long <Kbd>S</Kbd> short <Kbd>X</Kbd> close
          </p>
        </div>
      </section>

      {!panel ? (
        <aside className="flex shrink-0 border-t border-border lg:border-t-0 lg:border-l">
          {/* the whole strip is the button: full width on phones, full height on desktop */}
          <Button
            variant="ghost"
            onClick={() => onPanel(true)}
            aria-label="Show trade panel"
            className="h-11 w-full lg:h-full lg:w-11 lg:items-end lg:pb-3"
          >
            {/* the panel sits right of the chart on desktop, under it on phones */}
            <ChevronLeft className="hidden lg:block" />
            <ChevronUp className="lg:hidden" />
            <span className="lg:sr-only">Show panel</span>
          </Button>
        </aside>
      ) : (
        <aside className="flex max-h-[42svh] min-h-0 flex-col border-t border-border lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
          <dl className="grid shrink-0 grid-cols-4 border-b border-border [&>div]:flex [&>div]:flex-col [&>div]:gap-1 [&>div]:px-3 [&>div]:py-3 [&>div+div]:border-l [&>div+div]:border-hairline">
            <div>
              <dt className="label">Trades</dt>
              <dd className="num text-sm">{stats.count}</dd>
            </div>
            <div>
              <dt className="label">Win</dt>
              <dd className="num text-sm">{stats.winRate === null ? '–' : fmtPct(stats.winRate, 0)}</dd>
            </div>
            <div>
              <dt className="label">Net</dt>
              <dd className={cn('num text-sm', tone(stats.net))}>{stats.count ? `${fmtSigned(stats.net)}%` : '–'}</dd>
            </div>
            <div>
              <dt className="label">Avg R</dt>
              <dd className={cn('num text-sm', tone(stats.avgR ?? 0))}>
                {stats.avgR === null ? '–' : fmtSigned(stats.avgR)}
              </dd>
            </div>
          </dl>

          <div className="flex shrink-0 flex-col gap-3 border-b border-border p-3">
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="flex justify-between label">
                  Equity <span className="normal-case">USDT · optional</span>
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 1000"
                  value={equity}
                  onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onEquity(e.target.value)}
                  className="h-11 num text-base"
                />
              </label>
              {start && (
                <p className="flex items-center gap-2 num text-sm" aria-live="polite">
                  <Trend className={cn('size-4 shrink-0', tone(growth))} aria-hidden />
                  <span className="font-medium">{fmtNum(balance)}</span>
                  <span className={tone(growth)}>{fmtSigned(growth)}%</span>
                  {p && <span className="ml-auto label">incl. open</span>}
                </p>
              )}
            </div>
            {p ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="label text-foreground">{p.side}</span>
                    <span className="num text-xs text-muted-foreground">@ {fmtPrice(p.entry)}</span>
                  </span>
                  <span className={cn('num text-lg font-medium', tone(openPct))}>
                    {fmtSigned(openPct)}%{openR !== null && <span className="ml-2 text-xs">{fmtSigned(openR)}R</span>}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={close}>
                  Close <Kbd>X</Kbd>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => open('long')} disabled={!current || ended}>
                  Long <Kbd>B</Kbd>
                </Button>
                <Button variant="outline" onClick={() => open('short')} disabled={!current || ended}>
                  Short <Kbd>S</Kbd>
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="label">Stop</span>
                <Input
                  inputMode="decimal"
                  placeholder="optional"
                  value={stop}
                  onChange={(e) => editLevel('stop', e.target.value)}
                  className="h-8 num text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">Target</span>
                <Input
                  inputMode="decimal"
                  placeholder="optional"
                  value={target}
                  onChange={(e) => editLevel('target', e.target.value)}
                  className="h-8 num text-sm"
                />
              </label>
            </div>
            {error ? (
              <p className="text-xs text-down">{error}</p>
            ) : (
              <p className="text-xs text-pretty text-muted-foreground">
                Orders fill at the last close{current ? ` (${fmtPrice(current.close)})` : ''}. A bar that touches both
                stop and target counts as the stop.
              </p>
            )}
          </div>

          {state.trades.length ? (
            <ol className="min-h-0 flex-1 overflow-y-auto">
              {[...state.trades].reverse().map((t) => (
                <li
                  key={t.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-hairline px-3 py-2 text-[13px]"
                >
                  <span className="flex items-center gap-2">
                    <span className="num text-xs text-muted-foreground">#{t.id}</span>
                    <span className="label text-foreground">{t.side}</span>
                    <span className="label">{t.reason}</span>
                  </span>
                  <span className={cn('text-right num font-medium', tone(t.pct))}>{fmtSigned(t.pct)}%</span>
                  <span className="num text-xs text-muted-foreground">
                    {fmtPrice(t.entry)} → {fmtPrice(t.exit)}
                  </span>
                  <span className="text-right num text-xs text-muted-foreground">
                    {start !== null && (
                      <span className={tone(t.pct)}>{fmtSigned((balances[t.id - 1] * t.pct) / 100)} · </span>
                    )}
                    {t.r === null ? 'no stop' : `${fmtSigned(t.r)}R`}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="flex-1 p-3 text-xs text-pretty text-muted-foreground">
              Read the chart, take a side, then step forward. Only bars up to the cursor exist here; what comes next
              stays hidden until you reveal it.
            </p>
          )}
          <div className="flex shrink-0 border-t border-border">
            <Button variant="ghost" onClick={() => onPanel(false)} className="h-11 w-full">
              <ChevronRight className="hidden lg:block" />
              <ChevronDown className="lg:hidden" />
              Hide panel
            </Button>
          </div>
        </aside>
      )}
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="mx-0.5 inline-grid h-4 min-w-4 place-items-center border border-border px-1 font-mono text-[11px] leading-none text-muted-foreground">
      {children}
    </kbd>
  )
}
