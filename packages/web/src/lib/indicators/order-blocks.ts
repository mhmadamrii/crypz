import type { Candle } from '@crypz/exchanges'
import { atr } from './fvg'
import { marketStructure } from './structure'

// Order blocks, the supply and demand zones price launched from. A zone is the last candle before an impulse: the
// impulse is a run of candles all closing the same way, and the candle before the run is by definition the last one
// that did not (an opposite-colour or indecision candle). The run counts as an impulse once, within a few bars, it
// has moved `strength` ATRs from where it started and, when `imbalance` is set, left a fair value gap behind (price
// skipped part of the range on the way out). The zone is that base candle's full range, wicks included: demand below
// a bullish impulse, supply above a bearish one.
//
// A zone is known from the candle that completes its impulse, and what happens to it after is read candle by candle,
// so in replay it appears and wears exactly as it would have live. Its first tap (price trading back into it) is the
// one that counts; after that it is tapped, and a second tap or a close through its far edge spends it. With
// `withTrend` set, only zones formed in the direction structure was trending at that moment are kept.

export type Zone = {
  side: 'demand' | 'supply'
  /** The base candle's open time; the box starts there. */
  start: number
  top: number
  bottom: number
  /** The candle that completed the impulse: the zone exists from here. */
  formedAt: number
  /** Separate visits price has made into the zone since it formed. */
  taps: number
  /** The candle that spent it (second tap or a close through), or null while it is still live. */
  spentAt: number | null
}

export type ZoneOptions = {
  /** How far the impulse must travel, in ATRs. */
  strength: number
  /** Require a fair value gap inside the impulse. */
  imbalance: boolean
  /** Keep only zones formed with the structure trend. */
  withTrend: boolean
  /** Swing length for the trend filter. */
  swing: number
}

/** An impulse has this many bars to cover its distance; slower moves are drift, not displacement. */
const MAX_LEG = 4

export function findZones(candles: Candle[], o: ZoneOptions): Zone[] {
  const range = atr(candles)
  // trend after each candle, from structure breaks (each break's candle sets the trend from there on)
  const trendAt: ('up' | 'down' | null)[] = []
  if (o.withTrend) {
    const breaks = marketStructure(candles, o.swing).breaks
    let t: 'up' | 'down' | null = null
    let b = 0
    for (let i = 0; i < candles.length; i++) {
      while (b < breaks.length && breaks[b].index === i) t = breaks[b++].dir
      trendAt.push(t)
    }
  }

  const zones: Zone[] = []
  const live: (Zone & { inside: boolean })[] = []
  let legStart = -1
  let legDir = 0
  let legDone = false

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]

    // 1. this candle wears the zones already formed (never the one it is about to form)
    for (let j = live.length - 1; j >= 0; j--) {
      const z = live[j]
      const touches = c.low <= z.top && c.high >= z.bottom
      const through = z.side === 'demand' ? c.close < z.bottom : c.close > z.top
      if (touches && !z.inside) z.taps++
      z.inside = touches
      if (through || z.taps >= 2) {
        z.spentAt = c.time
        live.splice(j, 1)
      }
    }

    // 2. extend or restart the run of same-direction candles
    const dir = Math.sign(c.close - c.open)
    if (dir === 0 || dir !== legDir) {
      legDir = dir
      legStart = i
      legDone = false
    }
    if (dir === 0 || legDone || i - legStart >= MAX_LEG || legStart < 1) continue

    // 3. has the run become an impulse?
    const base = candles[legStart - 1]
    const moved = dir > 0 ? c.close - base.high : base.low - c.close
    if (Number.isNaN(range[i]) || moved < o.strength * range[i]) continue
    if (o.imbalance) {
      let gap = false
      // any three candles from the base onward whose outer wicks do not meet
      for (let m = legStart + 1; m <= i && !gap; m++) {
        const a = candles[m - 2]
        const b = candles[m]
        gap = dir > 0 ? a.high < b.low : a.low > b.high
      }
      if (!gap) continue
    }
    legDone = true
    if (o.withTrend && trendAt[i] !== (dir > 0 ? 'up' : 'down')) continue

    const z = {
      side: dir > 0 ? ('demand' as const) : ('supply' as const),
      start: base.time,
      top: base.high,
      bottom: base.low,
      formedAt: c.time,
      taps: 0,
      spentAt: null,
      // a one-candle impulse can still be overlapping its base; leaving and coming back is what makes a tap
      inside: c.low <= base.high && c.high >= base.low,
    }
    zones.push(z)
    live.push(z)
  }
  return zones
}
