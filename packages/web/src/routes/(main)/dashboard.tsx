import { useMemo } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { Link, createFileRoute, useLoaderData } from '@tanstack/react-router'
import { computeStats, deriveInsights } from '@crypz/exchanges'
import { PageHeader } from '@/components/app/page-header'
import { BreakdownTable } from '@/components/dashboard/breakdown-table'
import { CellStrip } from '@/components/dashboard/cell-strip'
import { CandleChart } from '@/components/trade/candle-chart'
import { EdgeBars } from '@/components/dashboard/edge-bars'
import { EquityCurve } from '@/components/dashboard/equity-curve'
import { Insights } from '@/components/dashboard/insights'
import { Mosaic, MosaicLegend } from '@/components/dashboard/mosaic'
import { PositionsTable } from '@/components/dashboard/positions-table'
import { StatStrip } from '@/components/dashboard/stat-strip'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { fmtDate, fmtDuration, fmtSigned, tone } from '@/lib/format'

const RANGES = { '7d': 7, '30d': 30, '90d': 90, all: null } as const
type Range = keyof typeof RANGES

type Search = { range?: Range; asset?: string }

export const Route = createFileRoute('/(main)/dashboard')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    range: typeof s.range === 'string' && s.range in RANGES ? (s.range as Range) : undefined,
    asset: typeof s.asset === 'string' ? s.asset : undefined,
  }),
  head: () => ({ meta: [{ title: 'Overview · crypz' }] }),
  component: Dashboard,
})

function Section({
  id,
  title,
  aside,
  children,
  className,
}: {
  id?: string
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn('scroll-mt-20', className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-medium tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Dashboard() {
  const data = useLoaderData({ from: '/(main)' })
  const { range = 'all', asset = null } = Route.useSearch()
  const navigate = Route.useNavigate()
  const setSearch = (patch: Search) =>
    navigate({ search: (s) => ({ ...s, ...patch }), replace: true, resetScroll: false })

  const inRange = useMemo(() => {
    const days = RANGES[range]
    const from = days ? data.fetchedAt - days * 864e5 : 0
    return data.positions.filter((p) => p.closedAt >= from)
  }, [data, range])

  const stats = useMemo(() => computeStats(inRange), [inRange])
  const chronological = useMemo(() => [...inRange].reverse(), [inRange])
  const focused = useMemo(() => (asset ? inRange.filter((p) => p.base === asset) : inRange), [inRange, asset])
  // Corridor focus: everything below the overview reads the selected asset only.
  const fStats = useMemo(() => (asset ? computeStats(focused) : stats), [asset, focused, stats])
  const insights = useMemo(() => deriveInsights(fStats, { singleAsset: !!asset }), [fStats, asset])
  const scope = asset ? `${asset} only` : null
  const chartPos = focused[0] ?? null
  const setFocus = (a: string | null) => setSearch({ asset: a ?? undefined })
  const anyConfigured = data.exchanges.some((e) => e.configured)

  return (
    <>
      <PageHeader
        title="Overview"
        lead={
          asset && (
            <Button variant="outline" size="xs" onClick={() => setFocus(null)} className="num">
              {asset} <X aria-label="Clear focus" />
            </Button>
          )
        }
      >
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={range}
          onValueChange={(v) => v && setSearch({ range: v === 'all' ? undefined : (v as Range) })}
          aria-label="Time range"
        >
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <ToggleGroupItem
              key={r}
              value={r}
              className="px-2.5 num text-xs uppercase data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {r}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PageHeader>

      <main className="flex w-full flex-col gap-14 px-4 py-8 sm:px-8">
        {!anyConfigured && (
          <div className="border border-border p-6 text-sm">
            <p className="font-medium">No exchange connected</p>
            <p className="mt-1 text-muted-foreground">
              Add <span className="num text-foreground">OKX_API_KEY</span>,{' '}
              <span className="num text-foreground">OKX_API_SECRET</span> and{' '}
              <span className="num text-foreground">OKX_API_PASSPHRASE</span> to the root .env and restart.
            </p>
          </div>
        )}
        {data.errors.map((e, i) => (
          <p key={i} className="border border-down/40 px-4 py-3 num text-sm text-down">
            {e.exchange}: {e.message}
          </p>
        ))}

        <section id="overview" className="flex scroll-mt-20 flex-col gap-8">
          <StatStrip accounts={data.accounts} stats={stats} />

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Section title={`${stats.count} closed positions`} aside={<MosaicLegend />}>
              <Mosaic positions={chronological} focus={asset} onFocus={setFocus} />
            </Section>
            <Section
              title="Edge by asset"
              aside={
                <span className="text-xs text-muted-foreground">Top 12 by impact, best to worst · select to trace</span>
              }
            >
              <EdgeBars buckets={stats.byInstrument} focus={asset} onFocus={setFocus} limit={12} />
            </Section>
          </div>
        </section>

        <section id="chart" className="grid scroll-mt-20 gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col border border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <span className="num text-sm">{chartPos?.symbol ?? 'No instrument'}</span>
              {chartPos && (
                <Button variant="ghost" size="xs" asChild>
                  <Link to="/trade" search={{ symbol: chartPos.symbol }}>
                    Open in Trade <ArrowRight />
                  </Link>
                </Button>
              )}
            </div>
            {chartPos ? (
              <CandleChart
                exchange={chartPos.exchange}
                symbol={chartPos.symbol}
                bar="4H"
                positions={focused.filter((p) => p.symbol === chartPos.symbol)}
                className="h-80"
              />
            ) : (
              <p className="grid h-80 place-items-center text-sm text-muted-foreground">No trades in this range.</p>
            )}
          </div>
          <Insights insights={insights} scope={scope} />
        </section>

        <Section
          id="timing"
          title={asset ? `Timing & sizing · ${asset}` : 'Timing & sizing'}
          aside={<span className="text-xs text-muted-foreground">By open time, your local timezone</span>}
        >
          <div className="flex flex-col gap-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
              <div>
                <h3 className="mb-3 text-sm font-medium">Hour of day</h3>
                <CellStrip buckets={fStats.byHour} tick={(_, i) => (i % 3 === 0 ? String(i).padStart(2, '0') : '')} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium">Weekday</h3>
                <CellStrip buckets={fStats.byWeekday} />
              </div>
            </div>
            <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <h3 className="mb-3 text-sm font-medium">Long vs short</h3>
                <EdgeBars buckets={fStats.bySide} focus={null} name="Side" />
              </div>
              <BreakdownTable title="Hold time" buckets={fStats.byHold} />
              <BreakdownTable title="Leverage" buckets={fStats.byLeverage} />
            </div>
          </div>
        </Section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section title={asset ? `Cumulative realized PnL · ${asset}` : 'Cumulative realized PnL'}>
            <EquityCurve curve={fStats.curve} maxDrawdown={fStats.maxDrawdown} />
          </Section>
          <Section title={asset ? `Streaks & extremes · ${asset}` : 'Streaks & extremes'}>
            <dl className="grid grid-cols-2 border-t border-hairline text-sm [&>div]:flex [&>div]:flex-col [&>div]:gap-1 [&>div]:border-b [&>div]:border-hairline [&>div]:py-3 [&>div:nth-child(odd)]:pr-4">
              <div>
                <dt className="label">Avg win</dt>
                <dd className="num text-up">{fmtSigned(fStats.avgWin, 3)}</dd>
              </div>
              <div>
                <dt className="label">Avg loss</dt>
                <dd className="num text-down">{fmtSigned(fStats.avgLoss, 3)}</dd>
              </div>
              <div>
                <dt className="label">Payoff ratio</dt>
                <dd className="num">{fStats.payoff.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="label">Current streak</dt>
                <dd className="num">
                  {fStats.currentStreak.kind
                    ? `${fStats.currentStreak.length} ${fStats.currentStreak.kind === 'win' ? 'W' : 'L'}`
                    : '–'}
                </dd>
              </div>
              <div>
                <dt className="label">Longest win run</dt>
                <dd className="num">{fStats.maxWinStreak}</dd>
              </div>
              <div>
                <dt className="label">Longest loss run</dt>
                <dd className="num">{fStats.maxLossStreak}</dd>
              </div>
              <div>
                <dt className="label">Avg hold · win / loss</dt>
                <dd className="num">
                  {fmtDuration(fStats.avgHoldWinMs)} / {fmtDuration(fStats.avgHoldLossMs)}
                </dd>
              </div>
              <div>
                <dt className="label">Max drawdown</dt>
                <dd className="num text-down">−{fStats.maxDrawdown.toFixed(2)}</dd>
              </div>
              {[fStats.best, fStats.worst].map((p, i) =>
                p ? (
                  <div key={i}>
                    <dt className="label">{i ? 'Worst trade' : 'Best trade'}</dt>
                    <dd className="flex flex-col">
                      <span className={cn('num', tone(p.realizedPnl))}>{fmtSigned(p.realizedPnl, 3)}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.symbol} · {fmtDate(p.closedAt)}
                      </span>
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </Section>
        </div>

        <Section
          id="history"
          title="Position history"
          aside={
            <span className="text-xs text-muted-foreground">
              {asset ? `Traced asset: ${asset}` : 'Instrument links open OKX'}
            </span>
          }
        >
          <PositionsTable key={`${range}-${asset}`} positions={focused} />
        </Section>

        <footer className="flex flex-wrap justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
          <span className="num">Synced {fmtDate(data.fetchedAt)} · history as far back as the exchange returns it</span>
          <span>Binance connection coming next</span>
        </footer>
      </main>
    </>
  )
}
