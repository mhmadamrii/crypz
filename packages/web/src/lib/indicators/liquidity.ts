import type { Candle } from '@crypz/exchanges'
import { atr } from './fvg'
import { marketStructure, type Swing } from './structure'

// Liquidity: the resting orders above equal highs and below equal lows, and what happens when price reaches them.
//
// A level is a swing high or low that price has not traded beyond yet. Two or more of the same side within
// `tolerance` ATRs of each other make a pool (equal highs / equal lows); its strength is its touches, and its price
// is the outermost of them, since that is where the orders sit. A level is taken by a candle whose wick trades more
// than the tolerance beyond it (a wick inside the tolerance is one more equal high, not a take). If that candle then
// closes back on the near side of the level, it is a sweep: price reached for the orders and left. A close beyond
// it is a plain break, and nothing is marked.
//
// Everything is read candle by candle from swings that are already confirmed, so a pool appears once its second
// swing is revealed and a sweep on the candle that makes it: in replay it forms exactly as it would have live.
// The one thing that moves is a pool's price, outward, when another equal high or low joins it.

export type Level = {
  side: 'high' | 'low'
  /** The outermost swing price: where a take is measured from. */
  price: number
  /** The swings that make it; a pool has two or more. */
  swings: Swing[]
  /** The first swing's open time; the line starts there. */
  start: number
  /** The candle that revealed the level (a pool: the one that revealed its second swing). */
  formedAt: number
  /** The candle that took it, or null while price has not traded beyond it. */
  takenAt: number | null
}

export type Sweep = {
  /** Which side's orders were reached: 'high' = buy-side liquidity above, 'low' = sell-side below. */
  side: 'high' | 'low'
  level: Level
  /** The candle that did it. */
  time: number
  /** Its extreme, where the marker goes. */
  extreme: number
}

export type LiquidityOptions = {
  /** How close equal highs or lows must be, and how far a wick must go to take one, in ATRs. */
  tolerance: number
  /** Swing length, as in market structure. */
  swing: number
}

export type Liquidity = {
  /** Every level, oldest first. Pools are the ones with two or more swings. */
  levels: Level[]
  /** Every sweep, oldest first. */
  sweeps: Sweep[]
}

export const isPool = (l: Level) => l.swings.length >= 2

export function findLiquidity(candles: Candle[], o: LiquidityOptions): Liquidity {
  const range = atr(candles)
  const { swings } = marketStructure(candles, o.swing)
  const levels: Level[] = []
  const sweeps: Sweep[] = []
  const live: Level[] = []
  // a swing is revealed `swing` bars after its own candle
  let next = 0

  for (let j = 0; j < candles.length; j++) {
    const c = candles[j]
    const tol = Number.isNaN(range[j]) ? 0 : range[j] * o.tolerance

    // 1. this candle takes whatever it trades through; swings revealed on it come after, so none is taken by it
    for (let k = live.length - 1; k >= 0; k--) {
      const l = live[k]
      const through = l.side === 'high' ? c.high > l.price + tol : c.low < l.price - tol
      if (!through) continue
      l.takenAt = c.time
      live.splice(k, 1)
      const back = l.side === 'high' ? c.close < l.price : c.close > l.price
      if (back) sweeps.push({ side: l.side, level: l, time: c.time, extreme: l.side === 'high' ? c.high : c.low })
    }

    // 2. swings this candle revealed join a level within tolerance, or start one
    while (next < swings.length && swings[next].index + o.swing <= j) {
      const s = swings[next++]
      let best: Level | null = null
      for (const l of live)
        if (
          l.side === s.kind &&
          Math.abs(l.price - s.price) <= tol &&
          (!best || Math.abs(l.price - s.price) < Math.abs(best.price - s.price))
        )
          best = l
      if (best) {
        best.swings.push(s)
        best.price = s.kind === 'high' ? Math.max(best.price, s.price) : Math.min(best.price, s.price)
        if (best.swings.length === 2) best.formedAt = c.time
      } else {
        const l: Level = { side: s.kind, price: s.price, swings: [s], start: s.time, formedAt: c.time, takenAt: null }
        levels.push(l)
        live.push(l)
      }
    }
  }
  return { levels, sweeps }
}

// Both layers (and, later, the bias) read the same result, so it is computed once per candle set and settings.
const memo = new WeakMap<Candle[], { key: string; result: Liquidity }>()

export function liquidityOf(candles: Candle[], o: LiquidityOptions): Liquidity {
  const key = `${o.tolerance}|${o.swing}`
  const hit = memo.get(candles)
  if (hit?.key === key) return hit.result
  const result = findLiquidity(candles, o)
  memo.set(candles, { key, result })
  return result
}
