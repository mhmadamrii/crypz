import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, LoaderCircle, Play } from 'lucide-react'
import { BAR_MS, type Bar } from '@crypz/exchanges'
import { PageHeader } from '@/components/app/page-header'
import { Results } from '@/components/bots/results'
import { InstrumentSelect } from '@/components/trade/instrument-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { runBacktest } from '@/lib/bots/engine'
import { MAX_DAYS, defaultForm, parseForm, warmupBars, type BotForm } from '@/lib/bots/form'
import type { BotConfig } from '@/lib/bots/types'
import { DEFAULT_SYMBOL, MARKET_EXCHANGE, MARKET_EXCHANGE_NAME } from '@/lib/market'
import { backtestCandlesQuery, instrumentSpecQuery, useInstruments } from '@/lib/queries'
import { cn } from '@/lib/utils'

// Backtest and paper simulation only. Nothing on this page, or in the engine behind it, calls an order endpoint:
// it reads public candles and the instrument's contract rules, then replays the rules over them in the browser.

export const Route = createFileRoute('/(main)/(market)/bots')({
  head: () => ({ meta: [{ title: 'Bots · crypz' }] }),
  component: Bots,
})

const ENTRY_BARS: Bar[] = ['1m', '3m', '5m', '15m']
const TREND_BARS: Bar[] = ['5m', '15m', '30m', '1H']

function Bots() {
  const symbols = useInstruments()
  const swaps = useMemo(() => symbols.filter((s) => s.endsWith('-SWAP')), [symbols])
  const [form, setForm] = useState<BotForm | null>(null)
  const f = form ?? defaultForm(swaps[0] ?? DEFAULT_SYMBOL)
  const set = (patch: Partial<BotForm>) => setForm({ ...f, ...patch })
  const [errors, setErrors] = useState<string[]>([])
  // the config of the last "Run": candles load for it, and the engine runs once they are in
  const [run, setRun] = useState<BotConfig | null>(null)

  const warm = run ? warmupBars(run) : null
  const entryFrom = run && warm ? run.startMs - warm.entry * BAR_MS[run.entryBar] : 0
  const trendFrom = run && warm ? run.startMs - warm.trend * BAR_MS[run.trendBar] : 0
  const to = run?.endMs ?? 0
  const spec = useQuery({ ...instrumentSpecQuery(MARKET_EXCHANGE, run?.symbol ?? ''), enabled: !!run })
  const entry = useQuery({
    ...backtestCandlesQuery(MARKET_EXCHANGE, run?.symbol ?? '', run?.entryBar ?? '5m', entryFrom, to),
    enabled: !!run,
  })
  const trend = useQuery({
    ...backtestCandlesQuery(MARKET_EXCHANGE, run?.symbol ?? '', run?.trendBar ?? '15m', trendFrom, to),
    enabled: !!run,
  })

  const outcome = useMemo(
    () => (run && spec.data && entry.data && trend.data ? runBacktest(run, spec.data, entry.data, trend.data) : null),
    [run, spec.data, entry.data, trend.data],
  )

  const loading =
    !!run && (spec.isPending || entry.isPending || trend.isPending) && !spec.isError && !entry.isError && !trend.isError
  const loadError = spec.error ?? entry.error ?? trend.error

  const submit = () => {
    const parsed = parseForm(f)
    setErrors(parsed.ok ? [] : parsed.errors)
    if (parsed.ok) setRun(parsed.config)
  }

  return (
    <>
      <PageHeader title="Bots" source={MARKET_EXCHANGE_NAME}>
        <span className="hidden border border-border px-1.5 py-0.5 label md:inline">
          Backtest / paper simulation — no live orders
        </span>
      </PageHeader>
      <main className="flex max-w-6xl flex-col gap-10 px-4 py-6 sm:px-8">
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Build, configure, and backtest trading strategies. This runs saved rules over past candles in your browser; it
          never places an order. A backtest is not a promise about live trading.
        </p>

        <section aria-label="Strategy" className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">EMA Trend Pullback + RSI + Volume</h2>
            <p className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">
              Trade with the {f.trendBar} trend (EMA {f.emaFast} &gt; {f.emaMid} &gt; {f.emaSlow}, close on the right
              side of the slow EMA). On the {f.entryBar}, enter after a pullback to the fast or mid EMA when RSI{' '}
              {f.rsiPeriod} crosses {f.rsiTrigger} with the trend, on a candle in the trend’s direction and volume above
              its {f.volumePeriod}-candle average. The stop sits beyond the last {f.swingLookback} candles’ extreme, the
              target at {f.rr}R. One position at a time.
            </p>
          </div>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <span className="label">Instrument · perpetual swap (USDT)</span>
              <InstrumentSelect value={f.symbol} onChange={(symbol) => set({ symbol })} className="w-full" />
            </div>
            <Field label="Start (UTC)">
              <Input type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} className="h-9 num" />
            </Field>
            <Field label="End (UTC, included)">
              <Input type="date" value={f.end} onChange={(e) => set({ end: e.target.value })} className="h-9 num" />
            </Field>
            <Field label="Initial equity (USDT)">
              <Num value={f.equity} onChange={(equity) => set({ equity })} />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="label">Entry timeframe</span>
              <Bars value={f.entryBar} options={ENTRY_BARS} onChange={(entryBar) => set({ entryBar })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="label">Trend timeframe</span>
              <Bars value={f.trendBar} options={TREND_BARS} onChange={(trendBar) => set({ trendBar })} />
            </div>
            <Field label="Risk per trade (% of equity)">
              <Num value={f.riskPct} onChange={(riskPct) => set({ riskPct })} />
            </Field>
            <Field label="Risk:reward (1 : R)">
              <Num value={f.rr} onChange={(rr) => set({ rr })} />
            </Field>

            <Field label="Taker fee per side (%)">
              <Num value={f.feePct} onChange={(feePct) => set({ feePct })} />
            </Field>
            <Field label="Slippage (bp per fill)">
              <Num value={f.slippageBps} onChange={(slippageBps) => set({ slippageBps })} />
            </Field>
            <Field label="Max leverage (skip above)">
              <Num value={f.maxLeverage} onChange={(maxLeverage) => set({ maxLeverage })} />
            </Field>
          </div>

          <p className="max-w-prose text-xs text-pretty text-muted-foreground">
            The fee is a default for OKX’s standard USDT-swap taker rate, not read from your account: set your own tier.
            {Number(f.slippageBps) === 0 && ' Zero slippage makes results look better than live trading would.'} Up to{' '}
            {MAX_DAYS} days per run.
          </p>

          <Advanced f={f} set={set} />

          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-down" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <div>
            <Button onClick={submit} disabled={loading}>
              {loading ? <LoaderCircle className="motion-safe:animate-spin" /> : <Play />}
              Run backtest
            </Button>
          </div>
        </section>

        {run && loading && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 motion-safe:animate-spin" />
            Loading {run.entryBar} and {run.trendBar} candles from {MARKET_EXCHANGE_NAME}
            {spec.isPending ? ' and the contract rules' : ''}. A month of {run.entryBar} takes a while.
          </p>
        )}
        {run && loadError && (
          <p role="alert" className="max-w-prose text-sm text-down">
            {loadError.message}
          </p>
        )}
        {outcome && !outcome.ok && (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-down">
            {outcome.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {outcome?.ok && <Results result={outcome.result} />}
      </main>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

function Num({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Input
      inputMode="decimal"
      value={value}
      onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)}
      className={cn('h-9 num', className)}
    />
  )
}

function Bars({ value, options, onChange }: { value: Bar; options: Bar[]; onChange: (b: Bar) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as Bar)}
      className="w-full"
    >
      {options.map((b) => (
        <ToggleGroupItem
          key={b}
          value={b}
          className="flex-1 num text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
        >
          {b}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const PARAMS: { key: keyof BotForm; label: string }[] = [
  { key: 'emaFast', label: 'Fast EMA' },
  { key: 'emaMid', label: 'Mid EMA' },
  { key: 'emaSlow', label: 'Slow EMA (trend)' },
  { key: 'rsiPeriod', label: 'RSI period' },
  { key: 'rsiTrigger', label: 'RSI trigger' },
  { key: 'atrPeriod', label: 'ATR period' },
  { key: 'volumePeriod', label: 'Volume average (candles)' },
  { key: 'swingLookback', label: 'Swing lookback (candles)' },
  { key: 'slAtrBuffer', label: 'Stop buffer (ATR)' },
  { key: 'pullbackAtr', label: 'Pullback reach past mid EMA (ATR)' },
  { key: 'minStopAtr', label: 'Minimum stop (ATR)' },
]

function Advanced({ f, set }: { f: BotForm; set: (p: Partial<BotForm>) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1.5 label"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} aria-hidden />
        Strategy parameters
      </button>
      {open && (
        <>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {PARAMS.map((p) => (
              <Field key={p.key} label={p.label}>
                <Num value={f[p.key]} onChange={(v) => set({ [p.key]: v })} />
              </Field>
            ))}
          </div>
          <p className="max-w-prose text-xs text-pretty text-muted-foreground">
            Every number that changes a signal or a result is here. Tuning them on the same range you then report is
            curve fitting: test on dates you did not tune on.
          </p>
        </>
      )}
    </div>
  )
}
