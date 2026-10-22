import type { Candle } from '@crypz/exchanges'

/** Candles after the one opening at `time`. */
export function barsSince(candles: Candle[], time: number) {
  let n = 0
  for (let i = candles.length - 1; i >= 0 && candles[i].time > time; i--) n++
  return n
}

/** The newest item that passes `test` (arrays here are oldest first). */
export function newest<T>(items: T[], test: (x: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return items[i]
  return undefined
}

export const ago = (n: number) => (n === 0 ? 'this bar' : n === 1 ? '1 bar ago' : `${n} bars ago`)
