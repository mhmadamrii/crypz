import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { HORIZON_CONFIG } from '@/lib/intelligence/horizons'
import type { MarketIntelligence } from '@/lib/intelligence/types'
import { clockTime } from '@/components/workspace/kit'
import { cn } from '@/lib/utils'
import { FRESHNESS_WORD, ago } from './kit'

const QUALITY = { good: 'Good', degraded: 'Degraded', insufficient: 'Insufficient' } as const

/** What was analysed and how far the data can be trusted: instrument, horizon, when, and every source's freshness. */
export function StatusBar({ a }: { a: MarketIntelligence }) {
  const [open, setOpen] = useState(a.dataQuality.status !== 'good')
  const q = a.dataQuality
  const problems = q.staleSources.length + q.missingSources.length
  const cfg = HORIZON_CONFIG[a.horizon]

  return (
    <div className="flex flex-col gap-2 pb-4">
      <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <Fact label="Instrument" value={a.instrument} />
        <Fact label="Venue" value={`${a.venue} · ${a.marketType}`} />
        <Fact label="Horizon" value={`${a.horizon} (read on ${cfg.bar} bars)`} />
        <Fact label="Last analyzed" value={clockTime(a.asOf, true)} />
        <div className="flex flex-col gap-0.5">
          <dt className="label">Data</dt>
          <dd>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 num text-sm hover:text-foreground focus-visible:outline-2"
            >
              <i
                aria-hidden
                className={cn(
                  'size-2',
                  q.status === 'good' && 'bg-up',
                  q.status === 'degraded' && 'bg-accent-risk',
                  q.status === 'insufficient' && 'bg-down',
                )}
              />
              {QUALITY[q.status]}
              {problems > 0 && (
                <span className="text-muted-foreground">
                  · {problems} source{problems > 1 ? 's' : ''}{' '}
                  {q.status === 'insufficient' ? 'missing or stale' : 'not read'}
                </span>
              )}
              <ChevronDown
                aria-hidden
                className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
              />
            </button>
          </dd>
        </div>
      </dl>
      {open && (
        <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3" aria-label="Data sources">
          {q.sources.map((s) => (
            <li
              key={s.id}
              className="flex items-baseline justify-between gap-3 border-b border-hairline py-1.5 num text-xs"
            >
              <span>{s.label}</span>
              <span className={s.freshness === 'fresh' ? 'text-muted-foreground' : 'text-foreground'}>
                {FRESHNESS_WORD[s.freshness]}
                {s.at !== null && <span className="text-muted-foreground"> · {ago(a.asOf, s.at)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label">{label}</dt>
      <dd className="num text-sm">{value}</dd>
    </div>
  )
}
