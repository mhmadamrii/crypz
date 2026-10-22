import type { Candle } from '@crypz/exchanges'

/** One oldest-first series from overlapping pages: a candle seen twice keeps its latest copy. */
export function mergeCandles(pages: Candle[][]): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const page of pages) for (const k of page) byTime.set(k.time, k)
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

/** Index of the last candle opening at or before `t` (ms), or 0 when `t` precedes them all. Candles are oldest-first. */
export function candleIndexAt(candles: Candle[], t: number) {
  let lo = 0
  let hi = candles.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (candles[mid].time <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}
