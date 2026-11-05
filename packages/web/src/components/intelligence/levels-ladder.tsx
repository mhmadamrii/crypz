import { fmtPrice, fmtSigned } from '@/lib/format'
import type { KeyLevel, MarketIntelligence } from '@/lib/intelligence/types'
import { cn } from '@/lib/utils'
import { Section, ago } from './kit'

const TYPE: Record<KeyLevel['type'], string> = {
  support: 'Support',
  resistance: 'Resistance',
  poc: 'Point of control',
  vah: 'Value area high',
  val: 'Value area low',
  invalidation: 'Invalidation',
  liquidity: 'Liquidity',
}

/** A short ladder of levels around the price, highest first, with the price itself where it sits. */
export function LevelsLadder({ a }: { a: MarketIntelligence }) {
  const price = a.price
  if (price === null) return null
  const levels = [...a.keyLevels].sort((x, y) => y.price - x.price)
  // the price row goes in front of the first level that is below it
  const at = levels.findIndex((l) => l.price < price)
  const rows: (KeyLevel | 'price')[] = [...levels]
  rows.splice(at === -1 ? levels.length : at, 0, 'price')

  return (
    <Section
      title="Key levels"
      note="A few levels that matter, each with where it came from and when. A resting order is live liquidity: it can be cancelled before anything trades, so it is not support or resistance."
    >
      <ol className="flex flex-col">
        {rows.map((r) =>
          r === 'price' ? (
            <li
              key="price"
              className="flex items-baseline justify-between gap-3 border-y border-foreground py-1.5 num text-sm"
            >
              <span className="font-medium">Price</span>
              <span className="font-medium">{fmtPrice(price)}</span>
            </li>
          ) : (
            <li key={r.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-b border-hairline py-2">
              <span className="flex items-baseline gap-2 text-sm">
                <span
                  className={cn('label', r.type === 'support' && 'text-up', r.type === 'resistance' && 'text-down')}
                >
                  {TYPE[r.type]}
                </span>
                {r.live && <span className="num text-[11px] text-foreground">Live · can be cancelled</span>}
              </span>
              <span className="text-right num text-sm">
                {fmtPrice(r.price)}{' '}
                <span className={cn('text-xs text-muted-foreground')}>
                  {fmtSigned(((r.price - price) / price) * 100, 2)}%
                </span>
              </span>
              <span className="text-xs text-pretty text-muted-foreground">{r.source}</span>
              <span className="text-right num text-[11px] text-muted-foreground">{ago(a.asOf, r.observedAt)}</span>
            </li>
          ),
        )}
      </ol>
    </Section>
  )
}
