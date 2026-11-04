import type { Candle } from '@crypz/exchanges'

export const BINS = 64

/**
 * Traded volume by price over `candles`: each candle's volume is spread evenly over its high–low range into 64 bins.
 * The point of control is the busiest bin; the value area grows from it towards whichever neighbour traded more
 * until it holds 70% of the volume. Bin `b` spans `lo + b * size` to `lo + (b + 1) * size`.
 */
export function profileOf(candles: Candle[]) {
  let lo = Infinity
  let hi = -Infinity
  for (const k of candles) {
    lo = Math.min(lo, k.low)
    hi = Math.max(hi, k.high)
  }
  const size = (hi - lo) / BINS || 1
  const vols = new Array<number>(BINS).fill(0)
  const bin = (p: number) => Math.min(BINS - 1, Math.max(0, Math.floor((p - lo) / size)))
  for (const k of candles) {
    const span = k.high - k.low
    if (span <= 0) {
      vols[bin(k.close)] += k.volume ?? 0
      continue
    }
    for (let b = bin(k.low); b <= bin(k.high); b++) {
      const overlap = Math.min(k.high, lo + (b + 1) * size) - Math.max(k.low, lo + b * size)
      if (overlap > 0) vols[b] += ((k.volume ?? 0) * overlap) / span
    }
  }
  const total = vols.reduce((s, v) => s + v, 0)
  const poc = vols.indexOf(Math.max(...vols))
  // the value area grows from the POC towards whichever neighbour traded more, until it holds 70%
  let top = poc
  let bottom = poc
  let held = vols[poc]
  while (held < total * 0.7 && (top < BINS - 1 || bottom > 0)) {
    const up = top < BINS - 1 ? vols[top + 1] : -1
    const down = bottom > 0 ? vols[bottom - 1] : -1
    if (up >= down) held += vols[++top]
    else held += vols[--bottom]
  }
  return { lo, hi, size, vols, total, poc, top, bottom, peak: vols[poc] || 1 }
}
