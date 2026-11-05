import type { MarketIntelligence } from '@/lib/intelligence/types'
import { cn } from '@/lib/utils'
import { Section } from './kit'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const TREND: Record<MarketIntelligence['marketState']['trend'], string> = {
  higher_highs_higher_lows: 'Higher highs, higher lows',
  lower_highs_lower_lows: 'Lower highs, lower lows',
  range: 'Range',
  transition: 'Transition',
  unclear: 'Insufficient data',
}
/** Direction a value argues for; colour is scarce and only ever an echo of the word. */
type Tone = 'up' | 'down' | 'risk' | 'neutral'
const TONE_CLASS: Record<Tone, string> = { up: 'text-up', down: 'text-down', risk: 'text-accent-risk', neutral: '' }

/** What the market is doing now. Observation only: the forecast lives in its own section. */
export function MarketStateStrip({ a }: { a: MarketIntelligence }) {
  const s = a.marketState
  const unclear = (v: string) => (v === 'unclear' ? 'Insufficient data' : cap(v))
  const cells: { label: string; value: string; hint?: string; tone?: Tone }[] = [
    { label: 'Structure', value: unclear(s.structure), hint: `Read on ${a.bar} bars from confirmed swing points` },
    {
      label: 'Trend',
      value: TREND[s.trend],
      tone:
        s.trend === 'higher_highs_higher_lows' ? 'up' : s.trend === 'lower_highs_lower_lows' ? 'down' : undefined,
    },
    {
      label: 'Momentum',
      value:
        s.momentum.state === 'unclear'
          ? 'Insufficient data'
          : `${cap(s.momentum.state)}${s.momentum.direction ? `, ${s.momentum.direction}` : ''}`,
      hint: 'Net move of the last bars against the bars before, in ATRs',
      tone: s.momentum.direction === 'up' ? 'up' : s.momentum.direction === 'down' ? 'down' : undefined,
    },
    {
      label: 'Volatility',
      value: s.volatility.state === 'unclear' ? 'Insufficient data' : cap(s.volatility.state),
      hint: s.volatility.ratio === null ? undefined : `ATR is ${s.volatility.ratio.toFixed(2)}× its recent median`,
      tone: s.volatility.state === 'high' ? 'risk' : undefined,
    },
    {
      label: 'Liquidity',
      value: s.liquidity === 'unclear' ? 'Unclear' : cap(s.liquidity.replace('-', ' ')),
      hint: 'Resting orders within 0.5% of the price; they can be cancelled',
      tone: s.liquidity === 'bid-heavy' ? 'up' : s.liquidity === 'ask-heavy' ? 'down' : undefined,
    },
    {
      label: 'Derivatives',
      value: s.derivatives === 'unavailable' ? 'Unavailable' : cap(s.derivatives.replace('-', ' ')),
      hint: 'Account long/short ratio, with funding or basis as confirmation',
      tone: s.derivatives === 'long-crowded' || s.derivatives === 'short-crowded' ? 'risk' : undefined,
    },
  ]
  return (
    <Section title="Now" note="What the market is doing at this moment. This is observation, not a forecast.">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-0.5" title={c.hint}>
            <dt className="label">{c.label}</dt>
            <dd
              className={cn(
                'text-sm',
                (c.value === 'Insufficient data' || c.value === 'Unclear' || c.value === 'Unavailable') &&
                  'text-muted-foreground',
                c.tone && TONE_CLASS[c.tone],
              )}
            >
              {c.value}
            </dd>
            {c.hint && <p className="text-[11px] text-pretty text-muted-foreground">{c.hint}</p>}
          </div>
        ))}
      </dl>
    </Section>
  )
}
