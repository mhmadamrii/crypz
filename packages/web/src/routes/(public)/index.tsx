import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { computeStats, deriveInsights } from '@crypz/exchanges'
import { CellStrip } from '@/components/dashboard/cell-strip'
import { EdgeBars } from '@/components/dashboard/edge-bars'
import { Mosaic, MosaicLegend } from '@/components/dashboard/mosaic'
import { Button } from '@/components/ui/button'
import { samplePositions } from '@/lib/sample'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(public)/')({ component: Landing })

const ROADMAP = [
  { name: 'OKX', what: 'Closed swap positions, account equity', state: 'Live' },
  { name: 'Binance', what: 'Futures position history', state: 'Next' },
  { name: 'Price chart', what: 'Entries and exits on the candles', state: 'Planned' },
  { name: 'AI insights', what: 'Ask questions about your own trades', state: 'Planned' },
]

function Landing() {
  const positions = useMemo(() => samplePositions(), [])
  const stats = useMemo(() => computeStats(positions), [positions])
  const insights = useMemo(() => deriveInsights(stats).slice(0, 3), [stats])
  const [focus, setFocus] = useState<string | null>(null)

  return (
    <div>
      <main>
        <section className="grid items-center gap-12 px-4 pt-10 pb-20 sm:px-8 lg:min-h-[calc(100dvh-4rem-1px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-0">
          <div className="flex flex-col gap-7">
            <h1 className="text-5xl leading-[0.95] font-semibold tracking-[-0.04em] text-balance sm:text-7xl">
              Every trade you closed. One square each.
            </h1>
            <p className="max-w-[44ch] text-lg text-pretty text-muted-foreground">
              crypz pulls your position history straight from the exchange and shows where your edge is, and where the
              money leaks. No spreadsheets, no manual journal.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/login">
                  Log in <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          </div>

          <figure className="flex flex-col gap-4 border border-border p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <MosaicLegend />
              <span className="label">Sample data</span>
            </div>
            <Mosaic positions={positions} focus={focus} onFocus={setFocus} />
          </figure>
        </section>

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
          <table className="w-full text-sm">
            <tbody>
              {ROADMAP.map((r) => (
                <tr key={r.name} className="border-b border-border [&>td]:py-4">
                  <td className="w-36 font-medium">{r.name}</td>
                  <td className="text-muted-foreground">{r.what}</td>
                  <td className="text-right">
                    <span className={cn('label', r.state === 'Live' && 'text-foreground')}>
                      {r.state === 'Live' && <i className="mr-2 inline-block size-1.5 bg-foreground align-middle" />}
                      {r.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="border-t border-border">
          <div className="flex flex-col items-start justify-between gap-8 px-4 py-20 sm:px-8 md:flex-row md:items-end">
            <h2 className="text-5xl leading-[0.95] font-semibold tracking-[-0.04em] sm:text-7xl">
              Read your own mosaic.
            </h2>
            <Button asChild size="lg">
              <Link to="/login">
                Log in <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
