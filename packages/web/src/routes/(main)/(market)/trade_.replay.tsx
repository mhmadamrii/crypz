import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LoaderCircle,
  Minus,
  Pause,
  RotateCcw,
  Play,
  Shuffle,
  StepForward,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { BAR_MS, type Bar, type ExchangeId } from '@crypz/exchanges'
import { DrawingToolbar } from '@/components/drawings/toolbar'
import { IndicatorMenu } from '@/components/indicators/menu'
import { useFootprintHistory } from '@/components/indicators/use-footprint-history'
import { StrategyMenu } from '@/components/strategies/strategy-menu'
import { useStrategy } from '@/components/strategies/use-strategy'
import { InstrumentSelect } from '@/components/trade/instrument-select'
import { IntervalBar, useIntervalHotkeys } from '@/components/trade/interval-bar'
import { zoneLabel } from '@/components/trade/chart-kit'
import { ReplayChart } from '@/components/trade/replay-chart'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { mergeCandles } from '@/lib/candles'
import { DEFAULT_BAR, DEFAULT_SYMBOL, MARKET_EXCHANGE, symbolBarSearch } from '@/lib/market'
import { useIndicators } from '@/lib/indicators/store'
import { STRATEGIES, strategyById, type Series } from '@/lib/strategies'
import { replayCandlesQuery, replayFineQuery, useInstruments } from '@/lib/queries'
import {
  DEFAULT_LEVERAGE,
  fineBar,
  formingCandle,
  LEVERAGES,
  initialReplay,
  levelError,
  liqPrice,
  replayReducer,
  roe,
  sessionStats,
  type Side,
} from '@/lib/replay'
import {
  LOCAL_MINUTE,
  fmtDuration,
  fmtNum,
  fmtPct,
  fmtPrice,
  fmtSigned,
  fmtWhen,
  startOfDay,
  toLocalInput,
  tone,
} from '@/lib/format'
import { searchText } from '@/lib/search'
import { cn } from '@/lib/utils'

type Search = { symbol?: string; bar?: Bar; from?: string; equity?: string; lev?: string; strategy?: string }

const SPEEDS = [1, 2, 5, 10] // bars per second
const DAY = 864e5

export const Route = createFileRoute('/(main)/(market)/trade_/replay')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...symbolBarSearch(s),
    from: typeof s.from === 'string' && LOCAL_MINUTE.test(s.from) ? s.from : undefined,
    equity: /^\d*\.?\d*$/.test(searchText(s.equity) ?? 'x') ? searchText(s.equity) : undefined,
    lev: LEVERAGES.map(String).includes(searchText(s.lev) ?? '') ? searchText(s.lev) : undefined,
    strategy: STRATEGIES.find((x) => x.id === s.strategy)?.id,
  }),
  head: () => ({ meta: [{ title: 'Replay · crypz' }] }),
  component: Replay,
})

function Replay() {
  const symbols = useInstruments()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const set = (patch: Search) => navigate({ search: (s) => ({ ...s, ...patch }), replace: true })
  // lives above the keyed session so a new interval or start date keeps the panel as you left it
  const [panel, setPanel] = useState(true)
  useIntervalHotkeys((b) => set({ bar: b }))

  const symbol = search.symbol ?? symbols[0] ?? DEFAULT_SYMBOL
  const bar = search.bar ?? DEFAULT_BAR
  const fromInput = search.from ?? toLocalInput(startOfDay(Date.now() - 30 * DAY))
  const from = new Date(fromInput).getTime()
  const exchange = MARKET_EXCHANGE

  const shuffle = () => {
    // anywhere from two years back to two weeks ago, on the hour
    const span = 730 * DAY - 14 * DAY
    const ms = Date.now() - 14 * DAY - Math.random() * span
    set({ from: toLocalInput(Math.floor(ms / 36e5) * 36e5) })
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:gap-3 sm:px-4">
        <span className="hidden label sm:inline">Replay</span>
        <InstrumentSelect value={symbol} onChange={(v) => set({ symbol: v })} className="w-28 sm:w-48" />
        <IntervalBar value={bar} onChange={(v) => set({ bar: v })} className="hidden md:flex" />
        <label className="flex items-center gap-2">
          <span className="hidden label lg:inline">Start</span>
          <DateTimePicker
            id="replay-start"
            value={fromInput}
            max={toLocalInput(Date.now())}
            onChange={(v) => LOCAL_MINUTE.test(v) && set({ from: v })}
            className="h-8 w-36 px-2 text-xs sm:w-[12.75rem] sm:px-3"
            aria-label="Replay start"
            title={`Replay start, in your time zone (${zoneLabel()})`}
          />
        </label>
        <Button variant="outline" size="sm" onClick={shuffle} title="Random start date">
          <Shuffle />
          <span className="hidden xl:inline">Random</span>
        </Button>
        <IndicatorMenu barMs={BAR_MS[bar]} className="hidden md:inline-flex" />
        <StrategyMenu
          value={search.strategy}
          onChange={(id) => set({ strategy: id })}
          className="hidden md:inline-flex"
        />
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

      {/* a new instrument or start date is a fresh session; a new interval keeps the clock and your trades */}
      <ReplaySession
        key={`${exchange}:${symbol}:${from}`}
        exchange={exchange}
        symbol={symbol}
        bar={bar}
        from={from}
        onBar={(b) => set({ bar: b })}
        equity={search.equity ?? ''}
        onEquity={(v) => set({ equity: v || undefined })}
        leverage={Number(search.lev ?? DEFAULT_LEVERAGE)}
        onLeverage={(n) => set({ lev: n === DEFAULT_LEVERAGE ? undefined : String(n) })}
        strategy={search.strategy}
        onStrategy={(id) => set({ strategy: id })}
        panel={panel}
        onPanel={setPanel}
      />
    </div>
  )
}

/** One timeframe's closed candles from the session start, up to the clock; null while `frame` is null or loading. */
function useFrame(exchange: ExchangeId, symbol: string, from: number, now: number, frame: Bar | null) {
  const query = useInfiniteQuery({
    ...replayCandlesQuery(exchange, symbol, frame ?? DEFAULT_BAR, from),
    enabled: !!frame,
  })
  const data = useMemo(() => {
    if (!frame || !query.data || query.isPlaceholderData) return null
    const ms = BAR_MS[frame]
    const all = mergeCandles(query.data.pages)
    // closed bars only: a forming bar would let what reads it change inside the bar
    const closed = all.filter((k, i) => (all[i + 1]?.time ?? k.time + ms) <= now)
    const loadedTo = all.at(-1)?.time ?? 0
    // caught up once the last loaded bar reaches the clock (or there is nothing more to load)
    return { bar: frame, candles: closed, loadedTo, caught: loadedTo + ms > now || !query.hasNextPage }
  }, [frame, query.data, query.isPlaceholderData, query.hasNextPage, now])
  // Page ahead of the clock. An effect because each page that lands can still leave the clock ahead of the data
  // (a long step on a short frame), so the fetch has to re-run until it catches up.
  const behind = !!data && query.hasNextPage && data.loadedTo - now < 10 * BAR_MS[data.bar]
  const { fetchNextPage, isFetchingNextPage } = query
  useEffect(() => {
    if (behind && !isFetchingNextPage) void fetchNextPage()
  }, [behind, isFetchingNextPage, fetchNextPage])
  return data
}

function ReplaySession({
  exchange,
  symbol,
  bar,
  from,
  onBar,
  equity,
  onEquity,
  leverage,
  onLeverage,
  strategy,
  onStrategy,
  panel,
  onPanel,
}: {
  exchange: ExchangeId
  symbol: string
  bar: Bar
  from: number
  onBar: (bar: Bar) => void
  /** Optional starting equity (raw field text); every trade puts the whole balance up as margin. */
  equity: string
  onEquity: (v: string) => void
  /** Leverage for the next order; an open position keeps the leverage it was opened with. */
  leverage: number
  onLeverage: (n: number) => void
  /** The strategy whose checklist shows over the chart (its id), if any. */
  strategy: string | undefined
  onStrategy: (id: string | undefined) => void
  /** Ticket + log column shown, or folded to a rail. */
  panel: boolean
  onPanel: (open: boolean) => void
}) {
  // The clock, position and trades outlive interval switches; only the candle window follows the interval.
  const [state, dispatch] = useReducer(replayReducer, from + BAR_MS[bar], initialReplay)
  // Each interval loads its window around where the clock stood when you switched to it.
  const [view, setView] = useState({ bar, anchor: state.now })
  if (view.bar !== bar) setView({ bar, anchor: state.now })
  const q = useInfiniteQuery(replayCandlesQuery(exchange, symbol, bar, view.anchor - BAR_MS[bar]))
  // First load and interval switches show a spinner over the (blurred) chart; stepping and orders wait for it.
  const loading = q.isPending || q.isPlaceholderData
  const candles = useMemo(() => mergeCandles(q.data?.pages ?? []), [q.data])
  // A candle closes when the next one opens (or one bar length later at the edge of what is loaded).
  const closesAt = (i: number) => candles[i + 1]?.time ?? candles[i].time + BAR_MS[bar]
  // The last candle that has fully closed by the clock. A higher interval's forming candle stays hidden: its
  // high and low would leak the future.
  const cursor = useMemo(() => {
    let i = -1
    while (i + 1 < candles.length && (candles[i + 2]?.time ?? candles[i + 1].time + BAR_MS[bar]) <= state.now) i++
    return i
  }, [candles, state.now, bar])
  // the bar the clock sits inside, when it has opened but not closed (higher timeframes between steps)
  const formingBar =
    cursor >= 0 && candles[cursor + 1] && candles[cursor + 1].time < state.now ? candles[cursor + 1] : null
  const fine = formingBar ? fineBar(bar, formingBar.time, state.now) : null
  const fq = useQuery({
    ...replayFineQuery(exchange, symbol, fine ?? bar, formingBar?.time ?? 0, state.now),
    enabled: !!fine,
  })
  const partial = useMemo(
    () => (formingBar && fine && fq.data ? formingCandle(fq.data, BAR_MS[fine], formingBar.time, state.now) : null),
    [formingBar, fine, fq.data, state.now],
  )
  const revealed = useMemo(() => {
    const closed = cursor < 0 ? [] : candles.slice(0, cursor + 1)
    return partial ? [...closed, partial] : closed
  }, [candles, cursor, partial])
  // Other timeframes, loaded from the session start and paged ahead of the clock. Fetched only while something
  // reads them: the bias indicator (a timeframe above the chart's) and the chosen strategy (the timeframes it
  // names, other than the chart's own). Two readers of one timeframe share one query.
  const indicatorState = useIndicators()
  const strategyDef = strategyById(strategy)
  const biasFrame = indicatorState.bias.higher
  const higher = useFrame(
    exchange,
    symbol,
    from,
    state.now,
    indicatorState.bias.on && BAR_MS[biasFrame] > BAR_MS[bar] ? biasFrame : null,
  )
  const frames = strategyDef?.frames ?? []
  const slot = (i: number) => (frames[i] && frames[i] !== bar ? frames[i] : null)
  const f0 = useFrame(exchange, symbol, from, state.now, slot(0))
  const f1 = useFrame(exchange, symbol, from, state.now, slot(1))
  const f2 = useFrame(exchange, symbol, from, state.now, slot(2))
  const closedChart = useMemo(() => (cursor < 0 ? [] : candles.slice(0, cursor + 1)), [candles, cursor])
  const { series, pending } = useMemo(() => {
    const out: Series = {}
    const waiting: Bar[] = []
    for (const fr of frames) {
      if (fr === bar) out[fr] = closedChart
      else {
        const f = [f0, f1, f2].find((x) => x?.bar === fr)
        if (f) out[fr] = f.candles
        if (!f?.caught) waiting.push(fr)
      }
    }
    return { series: out, pending: waiting }
    // `frames` follows the strategy, which is in the deps by its id
  }, [strategy, bar, closedChart, f0, f1, f2])
  const evaluation = useStrategy(strategy, revealed, bar, series, pending)

  // Footprint from OKX trade history, per OKX day while the indicator is on; days nobody built wait for consent.
  const footprint = useFootprintHistory(exchange, symbol, bar, state.now, revealed)

  // the last price: the forming candle's when there is one, so every timeframe trades at the same price
  const current = cursor < 0 ? undefined : (partial ?? candles[cursor])
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
    if (loading) return
    const next = candles[cursor + 1]
    const more = q.hasNextPage && !q.isFetchingNextPage
    if (!next) {
      if (more) void q.fetchNextPage()
      else if (!q.hasNextPage) setPlaying(false)
      return
    }
    dispatch({ type: 'step', candle: next, closesAt: closesAt(cursor + 1) })
    if (candles.length - cursor < 60 && more) void q.fetchNextPage()
  }

  const open = (side: Side) => {
    // wait for the forming candle, so the fill is the same last price every timeframe shows
    if (loading || (fine && fq.isPending) || !current || state.position) return
    const s = num(stop)
    const t = num(target)
    const err = levelError(side, current.close, s, t)
    setError(err)
    if (!err) dispatch({ type: 'open', side, candle: current, stop: s, target: t, leverage })
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
  const openPct = p && current ? roe(p, current.close) : 0
  const openR =
    p && current && p.stop !== null
      ? ((p.side === 'long' ? 1 : -1) * (current.close - p.entry)) / Math.abs(p.entry - p.stop)
      : null

  // Compounding: the whole balance is the margin, so each trade moves it by its return on margin.
  const start = num(equity)
  const balances = state.trades.reduce<number[]>(
    (acc, t) => [...acc, acc[acc.length - 1] * (1 + t.pct / 100)],
    [start ?? 0],
  )
  const closedBalance = balances[balances.length - 1]
  const balance = closedBalance * (1 + openPct / 100)
  const growth = start ? (balance / start - 1) * 100 : 0
  const Trend = growth > 0 ? TrendingUp : growth < 0 ? TrendingDown : Minus

  const blocker = loading
    ? null
    : q.isError
      ? `Could not load candles: ${q.error.message}`
      : cursor < 0 && q.isSuccess
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
              barLabel={bar}
              higher={higher}
              strategy={evaluation}
              footprint={footprint.data}
              candles={revealed}
              position={p}
              trades={state.trades}
              onLevel={(which, price) => editLevel(which, String(price))}
              className="absolute inset-0"
            />
            {loading && (
              <div
                role="status"
                className="absolute inset-0 z-20 grid place-items-center bg-background/30 backdrop-blur-[3px]"
              >
                <LoaderCircle className="size-5 text-muted-foreground motion-safe:animate-spin" strokeWidth={1.5} />
                <span className="sr-only">Loading candles</span>
              </div>
            )}
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
          {/* the top bar has no room left on a phone; the menu joins the interval controls here */}
          <IndicatorMenu barMs={BAR_MS[bar]} className="md:hidden" />
          <StrategyMenu value={strategy} onChange={onStrategy} className="md:hidden" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="num text-sm">
              {current ? fmtWhen(current.time) : '–'}
              {/* candles, the clock and the start field all read in the browser's zone */}
              <span
                className="ml-2 text-[11px] text-muted-foreground"
                title="Times are shown in your browser's time zone"
              >
                {zoneLabel(current?.time)}
              </span>
            </span>
            <span className="num text-[11px] text-muted-foreground">
              {ended ? 'End of history' : `+${fmtDuration(state.now - state.start)} · ${bar}`}
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
                    <span className="num text-xs text-foreground">{p.leverage}×</span>
                  </span>
                  <span className="num text-xs whitespace-nowrap text-muted-foreground">
                    @ {fmtPrice(p.entry)} · liq {fmtPrice(p.liq)}
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
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="flex justify-between label">
                    Leverage
                    {current && (
                      <span className="normal-case">
                        liq {fmtPrice(liqPrice('long', current.close, leverage))} /{' '}
                        {fmtPrice(liqPrice('short', current.close, leverage))}
                      </span>
                    )}
                  </span>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={String(leverage)}
                    onValueChange={(v) => v && onLeverage(Number(v))}
                    aria-label="Leverage"
                    className="w-full"
                  >
                    {LEVERAGES.map((n) => (
                      <ToggleGroupItem
                        key={n}
                        value={String(n)}
                        className="flex-1 num text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
                      >
                        {n}×
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => open('long')} disabled={!current || ended}>
                    Long <Kbd>B</Kbd>
                  </Button>
                  <Button variant="outline" onClick={() => open('short')} disabled={!current || ended}>
                    Short <Kbd>S</Kbd>
                  </Button>
                </div>
              </>
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
                Orders fill at the last close{current ? ` (${fmtPrice(current.close)})` : ''}, with your whole equity as
                margin: a {fmtNum(100 / (p?.leverage ?? leverage), 1)}% move against you liquidates. A bar that touches
                both stop and target counts as the stop.
              </p>
            )}
          </div>

          {state.trades.length || p ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ol>
                {[...state.trades].reverse().map((t) => (
                  <li
                    key={t.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-hairline px-3 py-2 text-[13px]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="num text-xs text-muted-foreground">#{t.id}</span>
                      <span className="label text-foreground">{t.side}</span>
                      <span className="num text-xs text-muted-foreground">{t.leverage}×</span>
                      <span className={cn('label', t.reason === 'liquidated' && 'text-down')}>{t.reason}</span>
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
              <StartOver trades={state.trades.length} open={!!p} onConfirm={() => dispatch({ type: 'reset' })} />
            </div>
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

/** Clears the session's position and trades (so equity is back at the start), asking once before it does. */
function StartOver({ trades, open, onConfirm }: { trades: number; open: boolean; onConfirm: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const what = [trades && `${trades} trade${trades === 1 ? '' : 's'}`, open && 'the open position']
    .filter(Boolean)
    .join(' and ')
  return confirm ? (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs text-pretty text-muted-foreground">
        Clear {what}? Equity goes back to where it started; the chart and your inputs stay.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>
          Keep
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setConfirm(false)
            onConfirm()
          }}
        >
          Start over
        </Button>
      </div>
    </div>
  ) : (
    <Button variant="ghost" onClick={() => setConfirm(true)} className="h-11 w-full border-b border-hairline">
      <RotateCcw /> Start over
    </Button>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="mx-0.5 inline-grid h-4 min-w-4 place-items-center border border-border px-1 font-mono text-[11px] leading-none text-muted-foreground">
      {children}
    </kbd>
  )
}
