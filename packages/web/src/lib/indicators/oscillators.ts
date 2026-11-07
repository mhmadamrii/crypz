import type { Candle } from '@crypz/exchanges'

// MACD and the stochastic oscillator, from candles alone. Every value at bar i uses bars up to i and nothing after,
// so a replay that reveals one candle at a time shows exactly what a live chart would have shown, and a value never
// changes once printed (until the forming candle closes). NaN marks the bars before there is enough history.

const nan = (n: number) => new Array<number>(n).fill(Number.NaN)

/**
 * Exponential moving average of `values`, seeded with the simple average of the first `period` defined values (the
 * usual convention, so it matches other charting packages). NaN until then; NaNs at the start of `values` (an
 * indicator's own warm-up) are skipped, so an EMA of an EMA starts where its input does.
 */
export function emaOf(values: number[], period: number) {
  const out = nan(values.length)
  const k = 2 / (period + 1)
  let start = values.findIndex((v) => !Number.isNaN(v))
  if (start < 0 || start + period > values.length) return out
  let e = 0
  for (let i = start; i < start + period; i++) e += values[i] / period
  out[start + period - 1] = e
  for (let i = start + period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k)
    out[i] = e
  }
  return out
}

/** Simple moving average over `period` values; NaN until it has them all. */
export function smaOf(values: number[], period: number) {
  const out = nan(values.length)
  let run = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    if (Number.isNaN(values[i])) {
      run = 0
      count = 0
      continue
    }
    run += values[i]
    count++
    if (count > period) run -= values[i - period]
    if (count >= period) out[i] = run / period
  }
  return out
}

export type Macd = { macd: number[]; signal: number[]; hist: number[] }

/** MACD line (fast EMA − slow EMA of closes), its signal line (EMA of it) and the histogram between them. */
export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9): Macd {
  const close = candles.map((k) => k.close)
  const f = emaOf(close, fast)
  const s = emaOf(close, slow)
  const line = close.map((_, i) => f[i] - s[i])
  const sig = emaOf(line, signal)
  return { macd: line, signal: sig, hist: line.map((v, i) => v - sig[i]) }
}

export type Stochastic = { k: number[]; d: number[] }

/**
 * Stochastic oscillator: where the close sits in the last `length` bars' range, 0 (at the low) to 100 (at the high).
 * %K is that raw value smoothed over `smooth` bars (1 = the fast stochastic), %D is %K averaged over `d` bars. A bar
 * whose window has no range reads 50.
 */
export function stochastic(candles: Candle[], length = 14, smooth = 3, d = 3): Stochastic {
  const raw = nan(candles.length)
  for (let i = length - 1; i < candles.length; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - length + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high)
      lo = Math.min(lo, candles[j].low)
    }
    raw[i] = hi > lo ? ((candles[i].close - lo) / (hi - lo)) * 100 : 50
  }
  const k = smooth > 1 ? smaOf(raw, smooth) : raw
  return { k, d: d > 1 ? smaOf(k, d) : k }
}
