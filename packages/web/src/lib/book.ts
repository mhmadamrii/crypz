// Order-book maths shared by the OKX liquidity chart indicator and the workspace widget. Everything here is pure:
// the feed (`okx-ws.ts`) owns the book and its freshness, this file turns a book into numbers.
//
// Units. OKX sizes are contracts on a swap and base coin on spot. A linear swap (BTC-USDT-SWAP) holds
// `ctVal × ctMult` base coin per contract, so its notional in the quote currency is size × that × price. An inverse
// swap (BTC-USD-SWAP) holds a fixed amount of quote currency per contract, so size × that is already the notional.
// Spot is one base coin per unit. The instrument's spec comes from OKX, never guessed: without it nothing is sized.

export type Side = 'bid' | 'ask'

export type Instrument = {
  id: string
  /** Smallest price step. */
  tickSz: number
  /** Base coin (linear, spot) or quote currency (inverse) per unit of size. */
  unit: number
  inverse: boolean
}

const positive = (v: unknown, what: string) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`OKX instrument has no valid ${what}`)
  return n
}

/** One entry of the `data` array of `GET /api/v5/public/instruments`, checked. Throws when it is not usable. */
export function parseInstrument(json: unknown): Instrument {
  const body = json as { code?: string; msg?: string; data?: Record<string, string>[] } | null
  if (!body || body.code !== '0') throw new Error(body?.msg || 'OKX did not answer the instrument request')
  const i = body.data?.[0]
  if (!i?.instId) throw new Error('OKX does not list this instrument')
  const tickSz = positive(i.tickSz, 'tick size')
  // spot has no contract value: one unit is one coin
  if (i.instType === 'SPOT') return { id: i.instId, tickSz, unit: 1, inverse: false }
  const unit = positive(i.ctVal, 'contract value') * positive(i.ctMult ?? '1', 'contract multiplier')
  return { id: i.instId, tickSz, unit, inverse: i.ctType === 'inverse' }
}

/** A size as OKX reports it, in base coin and in quote-currency notional at `px`. */
export function sizeOf(sz: number, px: number, inst: Instrument) {
  const notional = inst.inverse ? sz * inst.unit : sz * inst.unit * px
  return { base: inst.inverse ? (px ? notional / px : 0) : sz * inst.unit, notional }
}

export type BookLevel = {
  side: Side
  /** The bucket's outer price: the lowest a bid in it can be, the highest an ask in it can be. */
  px: number
  base: number
  notional: number
}

/** Which of a level's two sizes ranks and sums: the quote-currency notional, or the base coin. */
export type Metric = 'notional' | 'base'
export const valueOf = (l: Pick<BookLevel, 'base' | 'notional'>, m: Metric) => (m === 'notional' ? l.notional : l.base)

/**
 * One side of the book as price buckets `step` wide, nearest to the market first. Bids bucket downwards and asks
 * upwards, so a bucket never reports an order as sitting nearer the market than it does. Buckets are only ever as
 * wide as `step`: levels from unrelated price ranges are never merged.
 */
export function levelsOf(book: Map<string, string>, side: Side, inst: Instrument, step: number): BookLevel[] {
  const out = new Map<number, { base: number; notional: number }>()
  for (const [px, sz] of book) {
    const p = Number(px)
    const size = Number(sz)
    if (!Number.isFinite(p) || !Number.isFinite(size) || size <= 0) continue
    const k = side === 'bid' ? Math.floor(p / step + 1e-9) : Math.ceil(p / step - 1e-9)
    const s = sizeOf(size, p, inst)
    const cur = out.get(k)
    if (cur) {
      cur.base += s.base
      cur.notional += s.notional
    } else out.set(k, s)
  }
  return [...out.entries()]
    .sort(([a], [b]) => (side === 'bid' ? b - a : a - b))
    .map(([k, s]) => ({ side, px: k * step, ...s }))
}

/** Price groupings from a price's magnitude: e.g. 0.1 / 1 / 10 for BTC near 80,000. */
export const stepsFor = (price: number) => {
  const base = 10 ** (Math.floor(Math.log10(price)) - 5)
  return [base, base * 10, base * 100]
}

export const decimalsOf = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9))

/** The grouping at `index` of `stepsFor(price)`, never finer than the instrument's tick. */
export const stepAt = (price: number, index: number, inst: Instrument) => {
  const steps = stepsFor(price)
  return Math.max(steps[index] ?? steps[0], inst.tickSz)
}

export const bestOf = (book: Map<string, string>, side: Side) => {
  let best = side === 'bid' ? 0 : Infinity
  for (const px of book.keys()) {
    const p = Number(px)
    best = side === 'bid' ? Math.max(best, p) : Math.min(best, p)
  }
  return best === Infinity || best === 0 ? null : best
}

/** The middle of the touch, or null while either side is empty. */
export function midOf(bids: Map<string, string>, asks: Map<string, string>) {
  const bid = bestOf(bids, 'bid')
  const ask = bestOf(asks, 'ask')
  return bid !== null && ask !== null ? (bid + ask) / 2 : null
}

export type Depth = { base: number; notional: number; levels: number }

/**
 * Resting size within `pct` (0.01 = 1%) of `ref`: bids from ref down, asks from ref up. Summed over the raw levels,
 * not buckets, so grouping never moves the edge of the band. Both sides use the same band, so they compare.
 */
export function depthWithin(book: Map<string, string>, side: Side, inst: Instrument, ref: number, pct: number): Depth {
  const edge = side === 'bid' ? ref * (1 - pct) : ref * (1 + pct)
  const d: Depth = { base: 0, notional: 0, levels: 0 }
  for (const [px, sz] of book) {
    const p = Number(px)
    const size = Number(sz)
    if (!(size > 0) || (side === 'bid' ? p < edge || p > ref : p > edge || p < ref)) continue
    const s = sizeOf(size, p, inst)
    d.base += s.base
    d.notional += s.notional
    d.levels++
  }
  return d
}

/** (bid − ask) / (bid + ask): +1 is all bids, −1 all asks. Null when neither side has anything in range. */
export const imbalance = (bid: number, ask: number) => (bid + ask > 0 ? (bid - ask) / (bid + ask) : null)

/** The `n` biggest levels, biggest first, ranked by `metric`. */
export const largest = (levels: BookLevel[], metric: Metric, n: number) =>
  [...levels].sort((a, b) => valueOf(b, metric) - valueOf(a, metric)).slice(0, n)

/** How far a price sits from the reference, in price and as a fraction of it (signed: negative is below). */
export const distanceFrom = (px: number, ref: number) => ({ abs: px - ref, pct: ref ? (px - ref) / ref : 0 })

// ---- freshness -----------------------------------------------------------------------------------------------

/** loading: no book yet, or a fresh snapshot is on its way. disconnected: the feed is down. stale: silent too long. */
export type BookState = 'loading' | 'disconnected' | 'stale' | 'live'

/**
 * A live connection with an unbroken sequence is current by construction; OKX also pushes an empty update about once
 * a minute when nothing moves. So a book that has heard nothing for longer than that, on a connection that claims to
 * be up, is no longer trustworthy.
 */
export const STALE_MS = 75_000

export type Connection = { status: 'idle' | 'connecting' | 'live' | 'retrying'; since: number }

/** What a book may be shown as. Only 'live' is ever drawn as current liquidity. */
export function bookState(book: { seq: number; at: number }, conn: Connection, now: number): BookState {
  if (book.seq < 0) return conn.status === 'retrying' ? 'disconnected' : 'loading'
  if (conn.status !== 'live') return 'disconnected'
  // the connection was re-opened after this book was last updated: the old book waits for the new snapshot
  if (book.at < conn.since) return 'loading'
  return now - book.at > STALE_MS ? 'stale' : 'live'
}

// ---- what the chart draws ------------------------------------------------------------------------------------

export type LevelOptions = {
  sides: 'both' | 'bids' | 'asks'
  /** How far from the market to look, as a fraction of price. */
  range: number
  /** Hide levels under this share of the biggest one that is left. */
  minShare: number
  /** At most this many levels per side, the biggest. */
  maxLevels: number
  /** Index into `stepsFor` for the price bucket width. */
  group: number
}

/**
 * The levels worth drawing: bucketed, inside `range` of the market, the biggest `maxLevels` per side, and not dwarfed
 * by the biggest of those. Ranked by notional, so one scale serves bids and asks. Null while a side is empty (there
 * is then no market to measure from). The market is the middle of the touch, which is what the book itself implies.
 */
export function visibleLevels(
  bids: Map<string, string>,
  asks: Map<string, string>,
  inst: Instrument,
  o: LevelOptions,
): { mid: number; step: number; levels: BookLevel[] } | null {
  const mid = midOf(bids, asks)
  if (mid === null) return null
  const step = stepAt(mid, o.group, inst)
  const near = (l: BookLevel) => Math.abs(l.px - mid) <= mid * o.range
  const top = (l: BookLevel[]) => largest(l.filter(near), 'notional', o.maxLevels)
  const picked = [
    ...(o.sides === 'asks' ? [] : top(levelsOf(bids, 'bid', inst, step))),
    ...(o.sides === 'bids' ? [] : top(levelsOf(asks, 'ask', inst, step))),
  ]
  const biggest = Math.max(0, ...picked.map((l) => l.notional))
  return { mid, step, levels: picked.filter((l) => l.notional >= biggest * o.minShare) }
}

// ---- what the widget reports ---------------------------------------------------------------------------------

export type Ranked = BookLevel & { abs: number; pct: number }

export type Summary = {
  /** The price distances are measured from. */
  ref: number
  /** Resting size within the range, each side, over the same band around `ref`. */
  bid: Depth
  ask: Depth
  /** (bid − ask) / (bid + ask) of the chosen metric; null when both are zero. */
  imbalance: number | null
  /** The biggest levels in range, biggest first, each with its distance from `ref`. */
  bids: Ranked[]
  asks: Ranked[]
}

/**
 * The widget's numbers. Depth is summed over the raw levels within `range` of `ref` (bids below, asks above, the
 * same band either way); the biggest levels are bucketed by `group` and ranked by `metric`. `ref` is the market
 * price, the last trade, when the caller has one; otherwise the middle of the touch.
 */
export function summarize(
  bids: Map<string, string>,
  asks: Map<string, string>,
  inst: Instrument,
  o: { ref: number | null; range: number; metric: Metric; group: number; top: number },
): Summary | null {
  const mid = midOf(bids, asks)
  if (mid === null) return null
  const ref = o.ref ?? mid
  const step = stepAt(mid, o.group, inst)
  const rank = (map: Map<string, string>, side: Side): Ranked[] =>
    largest(
      levelsOf(map, side, inst, step).filter((l) => Math.abs(l.px - ref) <= ref * o.range),
      o.metric,
      o.top,
    ).map((l) => ({ ...l, ...distanceFrom(l.px, ref) }))
  const bid = depthWithin(bids, 'bid', inst, ref, o.range)
  const ask = depthWithin(asks, 'ask', inst, ref, o.range)
  return {
    ref,
    bid,
    ask,
    imbalance: imbalance(valueOf(bid, o.metric), valueOf(ask, o.metric)),
    bids: rank(bids, 'bid'),
    asks: rank(asks, 'ask'),
  }
}
