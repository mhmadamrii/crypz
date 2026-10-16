import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Rewind } from 'lucide-react'
import { computeStats, deriveInsights } from '@crypz/exchanges'
import { CellStrip } from '@/components/dashboard/cell-strip'
import { EdgeBars } from '@/components/dashboard/edge-bars'
import { Mosaic, MosaicLegend } from '@/components/dashboard/mosaic'
import { ReplayBand } from '@/components/landing/replay-band'
import { Button } from '@/components/ui/button'
import { samplePositions } from '@/lib/sample'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(public)/')({ component: Landing })

const ROADMAP: { name: string; what: string; state: 'Live' | 'Next' | 'Planned' }[] = [
  { name: 'OKX', what: 'Closed swap positions and account equity, read-only key', state: 'Live' },
  { name: 'Trade chart', what: 'Your entries and exits on the candles', state: 'Live' },
  { name: 'Replay', what: 'Bar-by-bar practice with stops, leverage and drawing tools', state: 'Live' },
  { name: 'Position size', what: 'Size a trade from equity, risk and stop', state: 'Live' },
  { name: 'Binance', what: 'Futures position history', state: 'Next' },
  { name: 'AI insights', what: 'Ask questions about your own trades', state: 'Planned' },
]

/** Status as the mosaic speaks it: filled = live, hollow = next, faint = planned. */
function StateSquare({ state }: { state: (typeof ROADMAP)[number]['state'] }) {
  return (
    <i
      aria-hidden
      className={cn(
        'inline-block size-3 shrink-0',
        state === 'Live' && 'bg-foreground',
        state === 'Next' && 'shadow-[inset_0_0_0_1px_var(--foreground)]',
        state === 'Planned' && 'bg-muted-foreground/25',
      )}
    />
  )
}

function Ctas({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      <Button asChild size="lg">
        <Link to="/login" search={{ mode: 'signup' }}>
          Create account <ArrowRight />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link to="/trade/replay">
          <Rewind /> Try Replay
        </Link>
      </Button>
    </div>
  )
}

function Landing() {
  const positions = useMemo(() => samplePositions(), [])
  const stats = useMemo(() => computeStats(positions), [positions])
  const insights = useMemo(() => deriveInsights(stats).slice(0, 3), [stats])
  const [focus, setFocus] = useState<string | null>(null)

  return (
    <div>
      <main>
        <section className="grid items-center gap-12 px-4 pt-10 pb-16 sm:px-8 lg:min-h-[min(78dvh,860px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-16">
          <div className="flex flex-col gap-7">
            <h1 className="text-5xl leading-[0.92] font-semibold tracking-[-0.04em] text-balance sm:text-7xl 2xl:text-8xl">
              Every trade you closed. One square each.
            </h1>
            <p className="max-w-[44ch] text-lg text-pretty text-muted-foreground">
              crypz pulls your position history straight from the exchange and shows where your edge is, and where the
              money leaks. No spreadsheets, no manual journal.
            </p>
            <Ctas />
          </div>

          <figure className="flex flex-col gap-4 border border-border p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <MosaicLegend />
              <span className="label">Sample data</span>
            </div>
            <Mosaic positions={positions} focus={focus} onFocus={setFocus} />
          </figure>
        </section>

        <ReplayBand />

        <section className="border-y border-border">
          <div className="grid gap-px bg-border lg:grid-cols-3 [&>*]:bg-background">
            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <h2 className="text-xl font-medium tracking-tight">Edge by asset</h2>
              <p className="text-sm text-muted-foreground">
                Net result, win rate and count per coin. Pick one and it lights up across the whole dashboard.
              </p>
              <EdgeBars buckets={stats.byInstrument} focus={focus} onFocus={setFocus} limit={6} />
            </div>
            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <h2 className="text-xl font-medium tracking-tight">When you trade well</h2>
              <p className="text-sm text-muted-foreground">
                Hour of day and weekday, leverage, hold time, long against short.
              </p>
              <CellStrip buckets={stats.byHour} tick={(_, i) => (i % 6 === 0 ? String(i).padStart(2, '0') : '')} />
              <CellStrip buckets={stats.byWeekday} className="max-w-xs" />
            </div>
            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <h2 className="text-xl font-medium tracking-tight">Plain-language readouts</h2>
              <p className="text-sm text-muted-foreground">
                Leaks and edges written out, so you know what to change next session.
              </p>
              <ol className="flex flex-col">
                {insights.map((i, n) => (
                  <li key={n} className="flex gap-3 border-b border-hairline py-3 text-sm">
                    <i
                      className={cn(
                        'mt-1.5 size-2 shrink-0',
                        i.tone === 'edge'
                          ? 'bg-foreground'
                          : i.tone === 'leak'
                            ? 'shadow-[inset_0_0_0_1px_var(--foreground)]'
                            : 'bg-muted-foreground/40',
                      )}
                    />
                    {i.text}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p className="px-4 py-3 label sm:px-8">All figures on this page are synthetic sample data</p>
        </section>

        <section className="grid gap-10 px-4 py-24 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
            The exchange is the source of truth.
          </h2>
          <ul className="border-t border-border text-sm">
            {ROADMAP.map((r) => (
              <li
                key={r.name}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border py-4 sm:grid-cols-[auto_9rem_minmax(0,1fr)_auto]"
              >
                <StateSquare state={r.state} />
                <span className="font-medium">{r.name}</span>
                <span className="col-start-2 row-start-2 text-muted-foreground sm:col-start-3 sm:row-start-1">
                  {r.what}
                </span>
                <span
                  className={cn(
                    'col-start-3 row-start-1 label sm:col-start-4',
                    r.state === 'Live' && 'text-foreground',
                  )}
                >
                  {r.state}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border">
          <div className="flex flex-col items-start justify-between gap-8 px-4 py-20 sm:px-8 md:flex-row md:items-end">
            <h2 className="text-5xl leading-[0.95] font-semibold tracking-[-0.04em] sm:text-7xl">
              Read your own mosaic.
            </h2>
            <Ctas />
          </div>
        </section>
      </main>
    </div>
  )
}
