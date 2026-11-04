import type { Freshness } from './types'

// How old a feed may be before it stops counting. Each limit is a few polling intervals of that source: a REST
// series that is polled every 30 s is fresh for three of them and delayed for a dozen. Anything beyond is stale, and
// stale or missing data is never used: the engine that needs it reports itself unavailable and the page says so.

export type SourceId =
  'candles' | 'ticker' | 'book' | 'taker' | 'openInterest' | 'longShort' | 'premium' | 'funding' | 'liquidations'

export const SOURCES: Record<SourceId, { label: string; fresh: number; delayed: number }> = {
  candles: { label: 'Candles', fresh: 30_000, delayed: 120_000 },
  ticker: { label: 'Live price', fresh: 15_000, delayed: 60_000 },
  // the book is judged by its own state (`bookState`), not by age
  book: { label: 'Order book', fresh: 0, delayed: 0 },
  taker: { label: 'Taker volume', fresh: 45_000, delayed: 180_000 },
  openInterest: { label: 'Open interest', fresh: 90_000, delayed: 360_000 },
  longShort: { label: 'Long/short ratio', fresh: 180_000, delayed: 600_000 },
  premium: { label: 'Basis', fresh: 90_000, delayed: 360_000 },
  funding: { label: 'Funding', fresh: 600_000, delayed: 1_800_000 },
  liquidations: { label: 'Liquidations', fresh: 600_000, delayed: 1_800_000 },
}

export function freshnessOf(at: number | null, now: number, id: SourceId): Freshness {
  if (at === null) return 'unavailable'
  const age = now - at
  const s = SOURCES[id]
  return age <= s.fresh ? 'fresh' : age <= s.delayed ? 'delayed' : 'stale'
}

/** A source counts only while it is fresh or delayed. */
export const usable = (f: Freshness) => f === 'fresh' || f === 'delayed'

const RANK: Record<Freshness, number> = { fresh: 0, delayed: 1, stale: 2, unavailable: 3 }
export const worst = (fs: Freshness[]): Freshness => fs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'fresh')
