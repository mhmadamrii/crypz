import { BAR_MS } from '@crypz/exchanges'
import type { Candle } from '@crypz/exchanges'
import type { Instrument } from '@/lib/book'
import { tagFor, type AnalysisInput } from './analyze'
import { HORIZON_CONFIG } from './horizons'
import type { Horizon } from './types'

// Test inputs: a fresh, complete, matching set of feeds for one instrument and horizon, to override piece by piece.

export const SYMBOL = 'BTC-USDT-SWAP'
export const NOW = 1_800_000_000_000
export const spec: Instrument = { id: SYMBOL, tickSz: 0.01, unit: 1, inverse: false }

export const series = (n: number, bar: number, f: (i: number) => number): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const c = f(i)
    return { time: NOW - (n - i) * bar, open: c, high: c + 0.8, low: c - 0.8, close: c, volume: 100 }
  })
export const uptrend = (bar = BAR_MS['15m']) => series(200, bar, (i) => 100 + i * 0.5 + 4 * Math.sin(i / 4))
export const sideways = (bar = BAR_MS['15m']) => series(200, bar, (i) => 100 + 4 * Math.sin(i / 5))

export function input(over: Partial<AnalysisInput> = {}, horizon: Horizon = '1H'): AnalysisInput {
  const bar = BAR_MS[HORIZON_CONFIG[horizon].bar]
  const at = NOW - 1000
  const tagC = tagFor.candles(SYMBOL, horizon)
  const tagS = tagFor.stat(SYMBOL, horizon)
  const tagL = tagFor.live(SYMBOL)
  const px = 150
  const level = (side: number, i: number) => String((px + side * (0.05 + i * 0.05)).toFixed(2))
  const bids = new Map(Array.from({ length: 12 }, (_, i) => [level(-1, i), '100'] as [string, string]))
  const asks = new Map(Array.from({ length: 12 }, (_, i) => [level(1, i), '100'] as [string, string]))
  const stat = BAR_MS[HORIZON_CONFIG[horizon].bar]
  return {
    symbol: SYMBOL,
    horizon,
    now: NOW,
    candles: { data: uptrend(bar), at, tag: tagC },
    price: { data: px, at, tag: tagL },
    book: { bids, asks, spec, state: 'live', at, tag: tagL },
    taker: {
      data: Array.from({ length: 20 }, (_, i) => ({ time: NOW - (20 - i) * stat, buy: 100, sell: 100 })),
      at,
      tag: tagS,
    },
    openInterest: {
      data: Array.from({ length: 10 }, (_, i) => ({ time: NOW - (10 - i) * stat, contracts: 1, usd: 1000 })),
      at,
      tag: tagS,
    },
    longShort: { data: [{ time: NOW, ratio: 1 }], at, tag: tagS },
    premium: { data: [{ time: NOW, premium: 0.0001 }], at, tag: tagL },
    funding: { data: 0.0001, at, tag: tagL },
    liquidations: { data: [], at, tag: tagL },
    tape: {
      data: Array.from({ length: 40 }, (_, i) => ({ side: i % 2 ? ('buy' as const) : ('sell' as const), size: 1 })),
      at,
      tag: tagL,
    },
    ...over,
  }
}
