import type { Level as PoolLevel } from '@/lib/indicators/liquidity'
import type { Structure } from '@/lib/indicators/structure'
import type { profileOf } from '@/lib/profile'
import type { Feeds, Signals } from './engines'
import type { KeyLevel } from './types'

// A short list of levels that matter, each with where it came from and when. Not every order-book level: the nearest
// swings either side, the value area, the biggest resting orders within 1%, and the nearest untaken equal highs and
// lows. Resting orders are labelled live liquidity and can be cancelled; none of these is a guaranteed turning point.

export function keyLevels(o: {
  price: number
  structure: Structure
  bar: string
  profile: ReturnType<typeof profileOf> | null
  pools: PoolLevel[]
  walls: Pick<Signals, 'askWall' | 'bidWall'>
  feeds: Feeds
}): KeyLevel[] {
  const { price, structure: st, bar } = o
  const out: KeyLevel[] = []
  const at = o.feeds.candles.at

  if (st.lastHigh)
    out.push({
      id: 'swing-high',
      type: 'resistance',
      price: st.lastHigh.price,
      source: `Last unbroken swing high (${bar})`,
      observedAt: st.lastHigh.confirmedAt,
    })
  if (st.lastLow)
    out.push({
      id: 'swing-low',
      type: 'support',
      price: st.lastLow.price,
      source: `Last unbroken swing low (${bar})`,
      observedAt: st.lastLow.confirmedAt,
    })

  // the nearest swing each side that is not already listed
  const below = st.swings.filter((s) => s.kind === 'low' && s.price < price && s.price !== st.lastLow?.price).at(-1)
  const above = st.swings.filter((s) => s.kind === 'high' && s.price > price && s.price !== st.lastHigh?.price).at(-1)
  if (below)
    out.push({
      id: 'near-support',
      type: 'support',
      price: below.price,
      source: `Recent swing low (${bar})`,
      observedAt: below.confirmedAt,
    })
  if (above)
    out.push({
      id: 'near-resistance',
      type: 'resistance',
      price: above.price,
      source: `Recent swing high (${bar})`,
      observedAt: above.confirmedAt,
    })

  if (o.profile && o.profile.total > 0) {
    const p = o.profile
    out.push({
      id: 'poc',
      type: 'poc',
      price: p.lo + (p.poc + 0.5) * p.size,
      source: `Volume profile point of control (last 300 × ${bar})`,
      observedAt: at,
    })
    out.push({
      id: 'vah',
      type: 'vah',
      price: p.lo + (p.top + 1) * p.size,
      source: 'Value area high (70% of volume)',
      observedAt: at,
    })
    out.push({
      id: 'val',
      type: 'val',
      price: p.lo + p.bottom * p.size,
      source: 'Value area low (70% of volume)',
      observedAt: at,
    })
  }

  if (o.walls.askWall)
    out.push({
      id: 'book-ask',
      type: 'liquidity',
      price: o.walls.askWall.px,
      source: 'Biggest resting ask within 1%: live liquidity, can be cancelled',
      observedAt: o.feeds.book.at,
      live: true,
    })
  if (o.walls.bidWall)
    out.push({
      id: 'book-bid',
      type: 'liquidity',
      price: o.walls.bidWall.px,
      source: 'Biggest resting bid within 1%: live liquidity, can be cancelled',
      observedAt: o.feeds.book.at,
      live: true,
    })

  const pools = o.pools.filter((l) => l.takenAt === null && l.swings.length >= 2)
  const poolHigh = pools.filter((l) => l.side === 'high' && l.price > price).sort((a, b) => a.price - b.price)[0]
  const poolLow = pools.filter((l) => l.side === 'low' && l.price < price).sort((a, b) => b.price - a.price)[0]
  if (poolHigh)
    out.push({
      id: 'pool-high',
      type: 'liquidity',
      price: poolHigh.price,
      source: `Equal highs, ${poolHigh.swings.length} touches (${bar})`,
      observedAt: at,
    })
  if (poolLow)
    out.push({
      id: 'pool-low',
      type: 'liquidity',
      price: poolLow.price,
      source: `Equal lows, ${poolLow.swings.length} touches (${bar})`,
      observedAt: at,
    })

  return out
}
