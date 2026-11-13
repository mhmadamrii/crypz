import type { Candle } from '@crypz/exchanges'
import { atr } from '@/lib/indicators/fvg'
import { emaOf, smaOf } from '@/lib/indicators/oscillators'

export { atr, emaOf, smaOf }

/** Wilder's RSI of `values`; NaN until `period` changes exist. Value i uses values up to i only. */
export function rsi(values: number[], period = 14) {
  const out = new Array<number>(values.length).fill(Number.NaN)
  let gain = 0
  let loss = 0
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    const g = Math.max(d, 0)
    const l = Math.max(-d, 0)
    if (i <= period) {
      gain += g / period
      loss += l / period
    } else {
      gain = (gain * (period - 1) + g) / period
      loss = (loss * (period - 1) + l) / period
    }
    if (i >= period) out[i] = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export const closes = (c: Candle[]) => c.map((k) => k.close)
export const volumes = (c: Candle[]) => c.map((k) => k.volume ?? Number.NaN)
