import type { Candle } from '@crypz/exchanges'

export type Prepared = {
  candles: Candle[]
  duplicates: number
  unsorted: boolean
  /** Bars absent between two neighbours; the series is left with the hole, never patched. */
  missing: number
  /** Why the series cannot be used, empty when it can. */
  errors: string[]
}

/**
 * Sorts oldest first, drops duplicate timestamps (the last one wins) and checks every candle. Bad prices or volumes
 * make the run refuse: a backtest that quietly repairs its input proves nothing.
 */
export function prepareCandles(raw: Candle[], barMs: number, label: string): Prepared {
  const errors: string[] = []
  if (!raw.length) return { candles: [], duplicates: 0, unsorted: false, missing: 0, errors: [`No ${label} candles.`] }
  const unsorted = raw.some((k, i) => i > 0 && k.time < raw[i - 1].time)
  const byTime = new Map<number, Candle>()
  for (const k of raw) byTime.set(k.time, k)
  const candles = [...byTime.values()].sort((a, b) => a.time - b.time)
  const duplicates = raw.length - candles.length

  let bad = 0
  let noVolume = 0
  for (const k of candles) {
    const nums = [k.time, k.open, k.high, k.low, k.close]
    if (
      nums.some((n) => !Number.isFinite(n)) ||
      k.low <= 0 ||
      k.high < Math.max(k.open, k.close, k.low) ||
      k.low > Math.min(k.open, k.close, k.high)
    )
      bad++
    if (k.volume === undefined || !Number.isFinite(k.volume) || k.volume < 0) noVolume++
  }
  if (bad) errors.push(`${bad} ${label} candle${bad === 1 ? '' : 's'} with invalid prices.`)
  if (noVolume) errors.push(`${noVolume} ${label} candle${noVolume === 1 ? '' : 's'} with missing or negative volume.`)

  let missing = 0
  for (let i = 1; i < candles.length; i++) {
    const gap = Math.round((candles[i].time - candles[i - 1].time) / barMs) - 1
    if (gap > 0) missing += gap
  }
  return { candles, duplicates, unsorted, missing, errors }
}
