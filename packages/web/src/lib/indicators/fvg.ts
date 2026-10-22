import type { Candle } from '@crypz/exchanges'

// Fair value gaps: three candles where the first and the third do not overlap, leaving a price range the market
// skipped. Bullish when candle 1's high sits below candle 3's low, bearish when candle 1's low sits above candle 3's
// high. A gap exists from the moment its third candle does (in replay: once it is revealed) and is worked off as
// price trades back into it; what is left open shrinks toward the far edge, and a gap traded straight through is
// filled. Only the candles passed in are read, so nothing here can see a bar the chart has not shown.

export type Gap = {
  side: 'bull' | 'bear'
  /** The middle candle's open time; the box starts there. */
  start: number
  /** The original zone. */
  top: number
  bottom: number
  /** What is still open after price came back into it. Equal to the zone until it is touched. */
  openTop: number
  openBottom: number
  /** The candle that closed the gap completely, or null while some of it is open. */
  filledAt: number | null
}

/** Average true range (Wilder, `period` bars) at each candle; NaN until there are enough bars. */
export function atr(candles: Candle[], period = 14) {
  const out = new Array<number>(candles.length).fill(Number.NaN)
  let avg = 0
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const prev = candles[i - 1].close
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
    if (i <= period) {
      avg += tr / period
      if (i === period) out[i] = avg
    } else {
      avg = (avg * (period - 1) + tr) / period
      out[i] = avg
    }
  }
  return out
}

/**
 * Every gap in `candles`, oldest first, with how much of it is still open at the last candle.
 * `minAtr` drops gaps narrower than that many ATRs (0 keeps all of them).
 */
export function findGaps(candles: Candle[], minAtr = 0): Gap[] {
  const range = minAtr > 0 ? atr(candles) : null
  const gaps: Gap[] = []
  const open: Gap[] = []
  for (let i = 2; i < candles.length; i++) {
    const c = candles[i]
    // first let this candle work off the gaps already open, so a gap is never filled by the candle that made it
    for (let j = open.length - 1; j >= 0; j--) {
      const g = open[j]
      if (g.side === 'bull') {
        // a bullish gap sits under price and is filled from the top down
        if (c.low <= g.openBottom) g.filledAt = c.time
        else if (c.low < g.openTop) g.openTop = c.low
      } else if (c.high >= g.openTop) g.filledAt = c.time
      else if (c.high > g.openBottom) g.openBottom = c.high
      if (g.filledAt !== null) open.splice(j, 1)
    }
    const a = candles[i - 2]
    const size = range ? range[i] * minAtr : 0
    const bull = a.high < c.low && c.low - a.high >= size
    if (bull || (a.low > c.high && a.low - c.high >= size)) {
      const top = bull ? c.low : a.low
      const bottom = bull ? a.high : c.high
      const g: Gap = {
        side: bull ? 'bull' : 'bear',
        start: candles[i - 1].time,
        top,
        bottom,
        openTop: top,
        openBottom: bottom,
        filledAt: null,
      }
      gaps.push(g)
      open.push(g)
    }
  }
  return gaps
}
