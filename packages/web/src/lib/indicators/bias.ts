import type { Candle } from '@crypz/exchanges'
import { findGaps } from './fvg'
import { marketStructure, type Swing } from './structure'

// Bias with invalidation: which way the chart leans, why, and the price that would prove it wrong. Not a
// probability: strength is only how many of the factors agree, each shown so the user can judge it.
//
// Top-down. The bias comes from market structure on a higher timeframe (or on the chart's own when there is no
// higher one): the trend after its last break of structure. Its invalidation is that timeframe's protective swing,
// the newest unbroken swing low under a bullish bias or swing high over a bearish one. The higher timeframe is read
// from its closed bars only, so its bias cannot flicker inside a bar; but a chart candle closing through the
// invalidation level kills the bias at once, and it stays dead (Neutral) until the higher timeframe's structure
// itself turns. Everything is computed from the candles passed in, so in replay nothing comes from the future.

export type Side = 'bull' | 'bear'

export type Factor = { id: string; label: string; side: Side | null }

export type Level = { price: number; from: number }

export type Bias = {
  side: Side | null
  /** The timeframe the bias was read from: the higher one, or the chart's own. */
  source: 'higher' | 'chart'
  factors: Factor[]
  /** How many factors point the way of the bias. */
  agree: number
  /** The live invalidation level, while the bias stands. */
  invalidation: Level | null
  /** A bias the chart already broke: the level, and the candle that closed through it. */
  invalidated: (Level & { side: Side; at: number }) | null
}

/** Exponential moving average of closes; NaN until `period` bars exist. */
export function ema(candles: Candle[], period: number) {
  const out = new Array<number>(candles.length).fill(Number.NaN)
  const k = 2 / (period + 1)
  let value = 0
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i].close
    if (i < period) {
      value += c / period
      if (i === period - 1) out[i] = value
    } else {
      value = c * k + value * (1 - k)
      out[i] = value
    }
  }
  return out
}

const sideOf = (trend: 'up' | 'down' | null): Side | null =>
  trend === 'up' ? 'bull' : trend === 'down' ? 'bear' : null

export function computeBias(opts: {
  /** The chart's candles, oldest first; the last may still be forming. */
  chart: Candle[]
  chartLabel: string
  /** Closed candles of the higher timeframe, or null when the chart has none above it. */
  higher: Candle[] | null
  higherLabel: string | null
  length: number
}): Bias {
  const { chart, higher, length } = opts
  const chartSt = marketStructure(chart, length)
  const higherSt = higher ? marketStructure(higher, length) : null
  const st = higherSt ?? chartSt
  const last = chart[chart.length - 1]

  const factors: Factor[] = []
  if (higherSt) factors.push({ id: 'higher', label: `${opts.higherLabel} structure`, side: sideOf(higherSt.trend) })
  factors.push({ id: 'chart', label: `${opts.chartLabel} structure`, side: sideOf(chartSt.trend) })
  const e = ema(chart, 50).at(-1)
  factors.push({
    id: 'ema',
    label: 'Price vs EMA 50',
    side: last && e !== undefined && !Number.isNaN(e) ? (last.close >= e ? 'bull' : 'bear') : null,
  })
  // the nearest gap still open: one below price is support (bullish), one above is resistance (bearish)
  let nearest: { side: Side; distance: number } | null = null
  if (last)
    for (const g of findGaps(chart, 0.25)) {
      if (g.filledAt !== null) continue
      const below = g.openTop <= last.close
      const distance = below ? last.close - g.openTop : g.openBottom - last.close
      if (distance < 0 || (nearest && distance >= nearest.distance)) continue
      if (below && g.side === 'bull') nearest = { side: 'bull', distance }
      else if (!below && g.side === 'bear') nearest = { side: 'bear', distance }
    }
  factors.push({ id: 'fvg', label: 'Nearest open gap', side: nearest?.side ?? null })

  let side = sideOf(st.trend)
  const protective: Swing | null = side === 'bull' ? st.lastLow : side === 'bear' ? st.lastHigh : null
  let invalidation: Level | null = protective ? { price: protective.price, from: protective.time } : null
  let invalidated: Bias['invalidated'] = null

  // a chart close through the higher timeframe's level kills the bias before that timeframe's bar has closed
  if (side && invalidation && higherSt && protective) {
    const hit = chart.find(
      (k) =>
        k.time >= protective.confirmedAt && (side === 'bull' ? k.close < protective.price : k.close > protective.price),
    )
    if (hit) {
      invalidated = { ...invalidation, side, at: hit.time }
      side = null
      invalidation = null
    }
  }
  // otherwise the last bias to die is the one the bias timeframe's last change of character ended
  if (!invalidated) {
    const choch = [...st.breaks].reverse().find((b) => b.type === 'CHoCH')
    if (choch)
      invalidated = {
        price: choch.from.price,
        from: choch.from.time,
        side: choch.dir === 'up' ? 'bear' : 'bull',
        at: choch.time,
      }
  }

  return {
    side,
    source: higherSt ? 'higher' : 'chart',
    factors,
    agree: side ? factors.filter((f) => f.side === side).length : 0,
    invalidation,
    invalidated,
  }
}
