import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { oddsQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'

// Prediction-market odds above the headlines: where the crowd, with money on it, puts BTC, ETH and friends by a
// date. Each event is a short ladder of price rungs with the market's "yes" probability as an ink bar, in the same
// ruled-row language as the tape. Probabilities are not profit or loss, so no up/down hue. A coin you trade marks
// its event with the filled square, as in the headlines.

const usd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
const ends = (ms: number) => {
  const hours = (ms - Date.now()) / 36e5
  if (hours < 24) return `ends in ${Math.max(1, Math.round(hours))}h`
  return `ends ${new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}
const pct = (p: number) => `${p < 0.01 ? '<1' : p > 0.99 ? '>99' : Math.round(p * 100)}%`

export function Odds({ mine, className }: { mine: Set<string>; className?: string }) {
  const q = useQuery(oddsQuery())
  // the busiest four; phones get two, so the headlines stay in reach
  const events = (q.data?.events ?? []).slice(0, 4)

  return (
    <section aria-labelledby="odds-title" className={cn('flex flex-col', className)}>
      <h2 id="odds-title" className="flex items-baseline justify-between border-b border-border pb-2 label">
        <span>Market odds</span>
        <span title={q.data && !q.data.ok ? 'Polymarket did not answer on the last check' : undefined}>
          {q.data && !q.data.ok ? 'Polymarket · stale' : 'Polymarket'}
        </span>
      </h2>
      {q.isPending ? (
        <div aria-busy aria-label="Loading odds" className="grid gap-x-8 gap-y-3 py-3 sm:grid-cols-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : q.isError || !events.length ? (
        <p className="py-3 text-sm text-muted-foreground">
          {q.isError ? 'Could not load the odds.' : 'No open crypto price markets right now.'}
        </p>
      ) : (
        <ol className="grid gap-x-8 sm:grid-cols-2 2xl:grid-cols-4">
          {events.map((e, i) => (
            <li key={e.id} className={cn('border-b border-hairline py-3', i > 1 && 'hidden sm:block')}>
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 text-sm leading-snug font-medium text-pretty underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {e.coins.some((c) => mine.has(c)) && (
                  <i aria-label="A coin you trade" className="mt-1.5 size-1.5 shrink-0 bg-foreground" />
                )}
                <span>
                  {e.title}
                  <ArrowUpRight
                    aria-hidden
                    className="ml-1 inline size-3 -translate-y-px text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                  <span className="sr-only"> (opens Polymarket)</span>
                </span>
              </a>
              <p className="mt-0.5 num text-[11px] text-muted-foreground">
                {ends(e.endsAt)} · {usd(e.volume24h)} 24h
              </p>
              <dl className="mt-2 flex flex-col gap-1">
                {e.markets.map((m) => (
                  <div
                    key={m.question}
                    title={`${m.question} ${pct(m.yes)} yes`}
                    className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2"
                  >
                    <dt className="truncate num text-xs text-muted-foreground">{m.label}</dt>
                    <dd className="h-1.5 bg-accent" aria-hidden>
                      <div className="h-full bg-foreground" style={{ width: `${m.yes * 100}%` }} />
                    </dd>
                    <dd className="text-right num text-xs">{pct(m.yes)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
      <p className="pt-3 text-xs text-pretty text-muted-foreground">
        Chance of “yes” on each price, from traders betting on it. Not a forecast of ours.
      </p>
    </section>
  )
}
