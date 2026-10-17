import type { Candle } from '@crypz/exchanges'

// Swing points and market structure. A swing high is a candle whose high no bar within `length` on either side
// beats (ties to the right do not cancel it, so a double top still counts once); a swing low is the mirror. A swing
// is only known once `length` bars after it exist, so it is confirmed late and never redrawn: in replay it appears
// the moment its last confirming bar is revealed, exactly as it would have on a live chart.
//
// Each swing is named against the previous swing of its kind: HH / LH for highs, HL / LL for lows. Structure breaks
// when a candle closes beyond the most recent swing that has not been broken yet (wicks through it do not count; that
// is a sweep, a later indicator). A break in the direction of the trend is a BOS (break of structure), a break
// against it is a CHoCH (change of character) and turns the trend.

export type SwingLabel = 'HH' | 'LH' | 'HL' | 'LL'

export type Swing = {
  kind: 'high' | 'low'
  index: number
  time: number
  price: number
  /** Null for the first swing of its kind: there is nothing to compare it with. */
  label: SwingLabel | null
  /** The candle whose arrival confirmed it. */
  confirmedAt: number
}

export type Break = {
  dir: 'up' | 'down'
  type: 'BOS' | 'CHoCH'
  /** The swing that was broken. */
  from: Swing
  /** The candle that closed beyond it. */
  index: number
  time: number
}

export type Structure = {
  swings: Swing[]
  breaks: Break[]
  /** The trend after the last break, or null before any. */
  trend: 'up' | 'down' | null
  /** The newest swings not yet broken: the levels the next BOS or CHoCH would come from. */
  lastHigh: Swing | null
  lastLow: Swing | null
}

export function marketStructure(candles: Candle[], length = 5): Structure {
  const swings: Swing[] = []
  const breaks: Break[] = []
  let trend: Structure['trend'] = null
  let prevHigh: Swing | null = null
  let prevLow: Swing | null = null
  // the swings a close can still break; each is broken at most once
  let liveHigh: Swing | null = null
  let liveLow: Swing | null = null

  for (let j = 0; j < candles.length; j++) {
    // 1. the candle `length` bars back can now be judged a swing, with this candle as its last confirming bar
    const i = j - length
    if (i >= length) {
      const c = candles[i]
      let isHigh = true
      let isLow = true
      for (let k = i - length; k <= i + length && (isHigh || isLow); k++) {
        if (k === i) continue
        const o = candles[k]
        if (k < i ? o.high >= c.high : o.high > c.high) isHigh = false
        if (k < i ? o.low <= c.low : o.low < c.low) isLow = false
      }
      if (isHigh) {
        const label: SwingLabel | null = prevHigh ? (c.high > prevHigh.price ? 'HH' : 'LH') : null
        const s: Swing = { kind: 'high', index: i, time: c.time, price: c.high, label, confirmedAt: candles[j].time }
        swings.push(s)
        prevHigh = s
        liveHigh = s
      }
      if (isLow) {
        const label: SwingLabel | null = prevLow ? (c.low < prevLow.price ? 'LL' : 'HL') : null
        const s: Swing = { kind: 'low', index: i, time: c.time, price: c.low, label, confirmedAt: candles[j].time }
        swings.push(s)
        prevLow = s
        liveLow = s
      }
    }

    // 2. a close beyond a confirmed, unbroken swing breaks structure
    const close = candles[j].close
    if (liveHigh && close > liveHigh.price) {
      breaks.push({
        dir: 'up',
        type: trend === 'down' ? 'CHoCH' : 'BOS',
        from: liveHigh,
        index: j,
        time: candles[j].time,
      })
      trend = 'up'
      liveHigh = null
    }
    if (liveLow && close < liveLow.price) {
      breaks.push({
        dir: 'down',
        type: trend === 'up' ? 'CHoCH' : 'BOS',
        from: liveLow,
        index: j,
        time: candles[j].time,
      })
      trend = 'down'
      liveLow = null
    }
  }
  return { swings, breaks, trend, lastHigh: liveHigh, lastLow: liveLow }
}
