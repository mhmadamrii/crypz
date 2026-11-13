import type { Candle } from '@crypz/exchanges'
import { atr, closes, emaOf, rsi, smaOf, volumes } from './indicators'
import type { BotConfig, Side } from './types'

// EMA trend + pullback + RSI cross + volume. Every value at index i is built from candles 0..i, so a signal read at
// the close of candle i never sees anything later.

export type Series = {
  candles: Candle[]
  emaFast: number[]
  emaMid: number[]
  emaSlow: number[]
  rsi: number[]
  atr: number[]
  volSma: number[]
}

type Periods = Pick<BotConfig, 'emaFast' | 'emaMid' | 'emaSlow' | 'rsiPeriod' | 'atrPeriod' | 'volumePeriod'>

export function computeSeries(candles: Candle[], p: Periods): Series {
  const c = closes(candles)
  return {
    candles,
    emaFast: emaOf(c, p.emaFast),
    emaMid: emaOf(c, p.emaMid),
    emaSlow: emaOf(c, p.emaSlow),
    rsi: rsi(c, p.rsiPeriod),
    atr: atr(candles, p.atrPeriod),
    volSma: smaOf(volumes(candles), p.volumePeriod),
  }
}

/** The direction a closed trend-timeframe candle allows: stacked EMAs and the close on the right side of the slow one. */
export function trendOf(s: Series, j: number): Side | null {
  const f = s.emaFast[j]
  const m = s.emaMid[j]
  const l = s.emaSlow[j]
  if (Number.isNaN(f) || Number.isNaN(m) || Number.isNaN(l)) return null
  const close = s.candles[j].close
  if (f > m && m > l && close > l) return 'long'
  if (f < m && m < l && close < l) return 'short'
  return null
}

/**
 * Index of the newest trend candle that has closed by `closeTime` (the close of the entry candle), or -1. A trend
 * candle that is still forming at that moment is never used. `from` is a lower bound to start the search at.
 */
export function trendIndexAt(trend: Candle[], trendMs: number, closeTime: number, from = 0) {
  let j = Math.max(from, 0)
  while (j + 1 < trend.length && trend[j + 1].time + trendMs <= closeTime) j++
  return trend[j] && trend[j].time + trendMs <= closeTime ? j : -1
}

export type Cfg = Pick<BotConfig, 'rsiTrigger' | 'pullbackAtr' | 'swingLookback' | 'slAtrBuffer'>

/** Every indicator the signal reads is defined at candle i and at i-1 (the RSI cross needs both). */
export const ready = (s: Series, i: number) =>
  i >= 1 &&
  !Number.isNaN(s.emaFast[i]) &&
  !Number.isNaN(s.emaMid[i]) &&
  !Number.isNaN(s.rsi[i]) &&
  !Number.isNaN(s.rsi[i - 1]) &&
  !Number.isNaN(s.atr[i]) &&
  !Number.isNaN(s.volSma[i])

/**
 * The side to enter once entry candle `i` has closed, given the trend allowed by the last closed trend candle.
 *  - pullback: the extreme reached the fast or the mid EMA, without going more than `pullbackAtr` ATRs past the mid
 *  - RSI crossed the trigger in the trend's direction on this candle
 *  - the candle closed in the trend's direction, on volume above its average
 */
export function signalAt(s: Series, i: number, trend: Side | null, cfg: Cfg): Side | null {
  if (!trend || !ready(s, i)) return null
  const k = s.candles[i]
  const reach = cfg.pullbackAtr * s.atr[i]
  if (!(k.volume! > s.volSma[i])) return null
  if (trend === 'long') {
    const touched = k.low <= s.emaFast[i] || k.low <= s.emaMid[i]
    const notTooFar = k.low >= s.emaMid[i] - reach
    const crossed = s.rsi[i - 1] <= cfg.rsiTrigger && s.rsi[i] > cfg.rsiTrigger
    return touched && notTooFar && crossed && k.close > k.open ? 'long' : null
  }
  const touched = k.high >= s.emaFast[i] || k.high >= s.emaMid[i]
  const notTooFar = k.high <= s.emaMid[i] + reach
  const crossed = s.rsi[i - 1] >= cfg.rsiTrigger && s.rsi[i] < cfg.rsiTrigger
  return touched && notTooFar && crossed && k.close < k.open ? 'short' : null
}

/** The stop before price-step rounding: the extreme of the last `swingLookback` candles, plus the ATR buffer beyond it. */
export function rawStop(s: Series, i: number, side: Side, cfg: Pick<Cfg, 'swingLookback' | 'slAtrBuffer'>) {
  const from = Math.max(0, i - cfg.swingLookback + 1)
  let extreme = side === 'long' ? Infinity : -Infinity
  for (let n = from; n <= i; n++) {
    extreme = side === 'long' ? Math.min(extreme, s.candles[n].low) : Math.max(extreme, s.candles[n].high)
  }
  const buffer = cfg.slAtrBuffer * s.atr[i]
  return side === 'long' ? extreme - buffer : extreme + buffer
}
