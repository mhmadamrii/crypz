import type { Candle, LongShort, OpenInterest, Premium, TakerFlow } from '@crypz/exchanges'
import { summarize, type Instrument } from '@/lib/book'
import { fmtPct, fmtPrice, fmtSigned, fmtUsd } from '@/lib/format'
import { SOURCES, usable, worst, type SourceId } from './freshness'
import type { Engine, EvidenceItem, Freshness, SignalState } from './types'

// The five evidence engines. Each reads a group of widgets that describe overlapping things and returns ONE vote,
// so correlated signals are never counted twice: CVD and taker buy/sell are the same trade flow, funding and basis
// are the same cost of leverage. Inside an engine only the items marked `votes` decide the state; the rest explain.
// Every rule is a constant with its meaning beside it. A source that is stale or missing makes its engine
// `unavailable`: nothing is substituted for it.

/** Per-source freshness and last-received time, resolved once by `analyze`. */
export type Feeds = Record<SourceId, { freshness: Freshness; at: number | null }>

export type Signals = {
  /** Aggressive flow against the price move over the same span: buying while price fell, or the reverse. */
  flowDivergence: 'bullish' | 'bearish' | null
  /** The side that is crowded: long or short. */
  crowding: 'long' | 'short' | null
  /** The biggest resting level within 1% of the price on each side, as live (cancellable) liquidity. */
  askWall: { px: number; notional: number } | null
  bidWall: { px: number; notional: number } | null
}

export const NO_SIGNALS: Signals = { flowDivergence: null, crowding: null, askWall: null, bidWall: null }

// -- thresholds
/** Resting depth within 0.5% of the price: bids over asks (or the reverse) by this much of the total is heavy. */
export const BOOK_IMBALANCE = 0.2
export const BOOK_BAND = 0.005
/** Fewer raw levels than this inside the band and the book is thin: no reading. */
export const BOOK_THIN_LEVELS = 10
/** Share of taker volume that is buying, over the last periods: above is bullish, below its mirror is bearish. */
export const FLOW_BUY_SHARE = 0.53
export const FLOW_PERIODS = 12
/** Net price move, in ATRs, below which price is not said to have moved (for divergences and OI interpretation). */
export const PRICE_MOVE_ATR = 1
/** Open interest change over the span that counts as a change. */
export const OI_CHANGE = 0.005
export const OI_PERIODS = 6
/** Account long/short ratio past which a side is crowded. */
export const CROWDED_LONG = 1.3
export const CROWDED_SHORT = 1 / CROWDED_LONG
/** Funding per period and basis past which leverage is expensive on one side. */
export const FUNDING_COST = 0.0003
export const BASIS_COST = 0.0005
/** Forced closes: fewest events, and the share of one side's USD, that make a one-sided squeeze. */
export const LIQ_MIN_EVENTS = 5
export const LIQ_DOMINANCE = 0.65
/** The tape's buy share beyond which it reads as a direction (used only when taker volume is unavailable). */
export const TAPE_SHARE = 0.55

const item = (
  id: string,
  sourceWidget: EvidenceItem['sourceWidget'],
  state: SignalState,
  summary: string,
  src: { freshness: Freshness; at: number | null },
  votes: boolean,
  extra: Pick<EvidenceItem, 'metric' | 'value' | 'unit'> = {},
): EvidenceItem => ({
  id,
  sourceWidget,
  state,
  summary,
  observedAt: src.at,
  freshness: src.freshness,
  votes,
  ...extra,
})

const unavailable = (
  id: Engine['id'],
  title: string,
  widgets: Engine['widgets'],
  why: string,
  items: EvidenceItem[] = [],
): Engine => ({ id, title, state: 'unavailable', reason: why, widgets, freshness: 'unavailable', items })

const why = (id: SourceId, f: Freshness) =>
  `${SOURCES[id].label} data is ${f === 'stale' ? 'stale' : 'unavailable'}, so this is not read.`

/** The close at or before `time`, from candles oldest first. */
const closeAt = (candles: Candle[], time: number) => {
  let found: Candle | undefined
  for (const k of candles) {
    if (k.time > time) break
    found = k
  }
  return found?.close ?? null
}

// ---- 1. market structure -------------------------------------------------------------------------------------

export function structureEngine(o: {
  feeds: Feeds
  structure: 'bullish' | 'bearish' | 'ranging' | 'transitioning' | 'unclear'
  trendText: string
  bar: string
  ema: 'bull' | 'bear' | null
  price: number | null
  area: { val: number; vah: number } | null
}): Engine {
  const src = o.feeds.candles
  const widgets: Engine['widgets'] = ['chart', 'profile']
  if (!usable(src.freshness))
    return unavailable('structure', 'Market structure', widgets, why('candles', src.freshness))
  if (o.structure === 'unclear')
    return unavailable('structure', 'Market structure', widgets, 'Not enough swings yet to read structure.')

  const s =
    (o.structure === 'bullish' ? 2 : o.structure === 'bearish' ? -2 : 0) +
    (o.ema === 'bull' ? 1 : o.ema === 'bear' ? -1 : 0)
  const state: SignalState = s >= 2 ? 'bullish' : s <= -2 ? 'bearish' : o.structure === 'ranging' ? 'neutral' : 'mixed'
  const items: EvidenceItem[] = [
    item(
      'structure',
      'chart',
      o.structure === 'bullish'
        ? 'bullish'
        : o.structure === 'bearish'
          ? 'bearish'
          : o.structure === 'ranging'
            ? 'neutral'
            : 'mixed',
      `Structure on ${o.bar} is ${o.structure}${o.trendText ? ` (${o.trendText})` : ''}.`,
      src,
      true,
    ),
  ]
  if (o.ema)
    items.push(
      item(
        'ema',
        'chart',
        o.ema === 'bull' ? 'bullish' : 'bearish',
        `Price is ${o.ema === 'bull' ? 'above' : 'below'} the 50-bar average on ${o.bar}.`,
        src,
        true,
      ),
    )
  if (o.area && o.price !== null) {
    const pos = o.price > o.area.vah ? 'above' : o.price < o.area.val ? 'below' : 'inside'
    items.push(
      item(
        'value-area',
        'profile',
        'neutral',
        `Price is ${pos} the value area (${fmtPrice(o.area.val)}–${fmtPrice(o.area.vah)}).`,
        src,
        false,
      ),
    )
  }
  const reason =
    state === 'bullish'
      ? `Structure and average point up on ${o.bar}.`
      : state === 'bearish'
        ? `Structure and average point down on ${o.bar}.`
        : o.structure === 'ranging'
          ? `Price is ranging on ${o.bar}.`
          : `Structure is ${o.structure} and the average disagrees.`
  return { id: 'structure', title: 'Market structure', state, reason, widgets, freshness: src.freshness, items }
}

// ---- 2. liquidity (the resting book) -------------------------------------------------------------------------

export function liquidityEngine(o: {
  feeds: Feeds
  book: { bids: Map<string, string>; asks: Map<string, string>; spec: Instrument } | null
  price: number | null
}): {
  engine: Engine
  walls: Pick<Signals, 'askWall' | 'bidWall'>
  condition: 'bid-heavy' | 'ask-heavy' | 'balanced' | 'thin' | 'unclear'
} {
  const src = o.feeds.book
  const widgets: Engine['widgets'] = ['book', 'depth', 'liquidity']
  const none = { askWall: null, bidWall: null }
  if (!usable(src.freshness) || !o.book || o.price === null)
    return {
      engine: unavailable(
        'liquidity',
        'Liquidity',
        widgets,
        why('book', src.freshness === 'unavailable' || !o.book ? 'unavailable' : src.freshness),
      ),
      walls: none,
      condition: 'unclear',
    }
  const { bids, asks, spec } = o.book
  const near = summarize(bids, asks, spec, { ref: o.price, range: BOOK_BAND, metric: 'notional', group: 1, top: 1 })
  const wide = summarize(bids, asks, spec, { ref: o.price, range: 0.01, metric: 'notional', group: 1, top: 1 })
  if (!near || !wide)
    return {
      engine: unavailable('liquidity', 'Liquidity', widgets, 'One side of the book is empty: nothing to measure from.'),
      walls: none,
      condition: 'unclear',
    }
  const walls = {
    askWall: wide.asks[0] ? { px: wide.asks[0].px, notional: wide.asks[0].notional } : null,
    bidWall: wide.bids[0] ? { px: wide.bids[0].px, notional: wide.bids[0].notional } : null,
  }
  const thin = near.bid.levels + near.ask.levels < BOOK_THIN_LEVELS
  const imb = near.imbalance
  const condition = thin
    ? 'thin'
    : imb === null
      ? 'thin'
      : imb >= BOOK_IMBALANCE
        ? 'bid-heavy'
        : imb <= -BOOK_IMBALANCE
          ? 'ask-heavy'
          : 'balanced'
  const state: SignalState = condition === 'bid-heavy' ? 'bullish' : condition === 'ask-heavy' ? 'bearish' : 'neutral'
  const items: EvidenceItem[] = [
    item(
      'book-imbalance',
      'liquidity',
      state,
      thin
        ? `Resting size within ±${BOOK_BAND * 100}% is thin (${near.bid.levels + near.ask.levels} levels): no reading.`
        : `Resting bids ${fmtUsd(near.bid.notional)} against asks ${fmtUsd(near.ask.notional)} within ±${BOOK_BAND * 100}% (${imb === null ? 'none' : fmtSigned(imb * 100, 0) + '%'} imbalance). Resting orders can be cancelled.`,
      src,
      true,
      { metric: 'imbalance', value: imb === null ? 'n/a' : Number(imb.toFixed(2)) },
    ),
  ]
  if (walls.askWall || walls.bidWall)
    items.push(
      item(
        'book-walls',
        'depth',
        'neutral',
        `Biggest resting levels within 1%: ${walls.bidWall ? `bid ${fmtPrice(walls.bidWall.px)} (${fmtUsd(walls.bidWall.notional)})` : 'no bid'}, ${walls.askWall ? `ask ${fmtPrice(walls.askWall.px)} (${fmtUsd(walls.askWall.notional)})` : 'no ask'}.`,
        src,
        false,
      ),
    )
  const reason = thin
    ? 'The book is thin near the price, so it says little.'
    : condition === 'bid-heavy'
      ? 'More size is resting under the price than over it (cancellable, not executed).'
      : condition === 'ask-heavy'
        ? 'More size is resting over the price than under it (cancellable, not executed).'
        : 'Resting size is balanced either side of the price.'
  return {
    engine: { id: 'liquidity', title: 'Liquidity', state, reason, widgets, freshness: src.freshness, items },
    walls,
    condition,
  }
}

// ---- 3. aggressive flow --------------------------------------------------------------------------------------

export function flowEngine(o: {
  feeds: Feeds
  taker: TakerFlow[] | null
  tape: { side: 'buy' | 'sell'; size: number }[] | null
  candles: Candle[]
  atr: number | null
}): { engine: Engine; divergence: Signals['flowDivergence'] } {
  const widgets: Engine['widgets'] = ['trades', 'cvd', 'footprint', 'taker']
  const src = o.feeds.taker
  const tapeSrc = o.feeds.ticker
  const items: EvidenceItem[] = []
  let state: SignalState = 'unavailable'
  let reason = why('taker', src.freshness)
  let divergence: Signals['flowDivergence'] = null
  let fresh: Freshness = 'unavailable'

  // the newest period is still forming, so it is left out
  const closed = o.taker && usable(src.freshness) ? o.taker.slice(0, -1) : []
  if (closed.length >= 6) {
    const tail = closed.slice(-FLOW_PERIODS)
    const buy = tail.reduce((a, p) => a + p.buy, 0)
    const sell = tail.reduce((a, p) => a + p.sell, 0)
    const share = buy + sell > 0 ? buy / (buy + sell) : 0.5
    state = share >= FLOW_BUY_SHARE ? 'bullish' : share <= 1 - FLOW_BUY_SHARE ? 'bearish' : 'neutral'
    const first = closeAt(o.candles, tail[0].time)
    const last = o.candles.at(-1)?.close ?? null
    const move = first !== null && last !== null && o.atr ? (last - first) / o.atr : null
    if (move !== null && Math.abs(move) >= PRICE_MOVE_ATR) {
      if (state === 'bullish' && move < 0) divergence = 'bullish'
      if (state === 'bearish' && move > 0) divergence = 'bearish'
    }
    reason =
      `Takers bought ${fmtPct(share, 0)} of volume over the last ${tail.length} periods` +
      (divergence ? `, against a ${divergence === 'bullish' ? 'falling' : 'rising'} price (a divergence).` : '.')
    fresh = src.freshness
    items.push(
      item('taker-flow', 'cvd', state, reason, src, true, { metric: 'buy share', value: Number(share.toFixed(2)) }),
    )
  }

  const tape = o.tape && usable(tapeSrc.freshness) && o.tape.length >= 30 ? o.tape : null
  if (tape) {
    const buy = tape.reduce((a, t) => a + (t.side === 'buy' ? t.size : 0), 0)
    const all = tape.reduce((a, t) => a + t.size, 0)
    const share = all ? buy / all : 0.5
    const tapeState: SignalState = share >= TAPE_SHARE ? 'bullish' : share <= 1 - TAPE_SHARE ? 'bearish' : 'neutral'
    const standIn = state === 'unavailable'
    items.push(
      item(
        'tape',
        'trades',
        tapeState,
        `The last ${tape.length} prints were ${fmtPct(share, 0)} buys${standIn ? ' (read because taker volume is unavailable)' : ', the same flow seen over a shorter span, not counted again'}.`,
        tapeSrc,
        standIn,
      ),
    )
    if (standIn) {
      state = tapeState
      reason = `Taker volume is unavailable; the live tape was ${fmtPct(share, 0)} buys.`
      fresh = tapeSrc.freshness
    }
  }
  if (state === 'unavailable')
    return { engine: unavailable('flow', 'Aggressive flow', widgets, reason, items), divergence }
  return {
    engine: { id: 'flow', title: 'Aggressive flow', state, reason, widgets, freshness: fresh, items },
    divergence,
  }
}

// ---- 4. positioning ------------------------------------------------------------------------------------------

export function positioningEngine(o: {
  feeds: Feeds
  oi: OpenInterest[] | null
  longShort: LongShort[] | null
  premium: Premium[] | null
  funding: number | null
  candles: Candle[]
  atr: number | null
}): {
  engine: Engine
  crowding: Signals['crowding']
  derivatives: 'long-crowded' | 'short-crowded' | 'balanced' | 'unavailable'
} {
  const widgets: Engine['widgets'] = ['oi', 'longshort', 'basis']
  const oiSrc = o.feeds.openInterest
  const lsSrc = o.feeds.longShort
  const items: EvidenceItem[] = []

  // crowding and the cost of leverage are context: they decide whether a move is trustworthy, not its direction
  let crowding: Signals['crowding'] = null
  let derivatives: 'long-crowded' | 'short-crowded' | 'balanced' | 'unavailable' = 'unavailable'
  const ratio = o.longShort && usable(lsSrc.freshness) ? o.longShort.at(-1)?.ratio : undefined
  if (ratio !== undefined) {
    const side = ratio >= CROWDED_LONG ? 'long' : ratio <= CROWDED_SHORT ? 'short' : null
    derivatives = side ? (side === 'long' ? 'long-crowded' : 'short-crowded') : 'balanced'
    items.push(
      item(
        'long-short',
        'longshort',
        'neutral',
        `Account long/short ratio ${ratio.toFixed(2)}${side ? `: ${side}s are crowded (crowding is not direction)` : ': balanced'}.`,
        lsSrc,
        false,
        { metric: 'ratio', value: Number(ratio.toFixed(2)) },
      ),
    )
    const funding = o.funding !== null && usable(o.feeds.funding.freshness) ? o.funding : null
    const basis = o.premium && usable(o.feeds.premium.freshness) ? (o.premium.at(-1)?.premium ?? null) : null
    const cost = (f: number | null, limit: number) =>
      f === null ? null : f >= limit ? 'long' : f <= -limit ? 'short' : null
    const costSide = cost(funding, FUNDING_COST) ?? cost(basis, BASIS_COST)
    // crowded only counts when the cost of leverage agrees, or cannot be read
    if (side && (costSide === side || (funding === null && basis === null))) crowding = side
    if (funding !== null || basis !== null)
      items.push(
        item(
          'leverage-cost',
          'basis',
          'neutral',
          `Funding ${funding === null ? 'unavailable' : fmtPct(funding, 3)}, basis ${basis === null ? 'unavailable' : fmtPct(basis, 3)}${costSide ? `: leverage is expensive for ${costSide}s` : ''}. One signal, not two.`,
          o.feeds.premium,
          false,
        ),
      )
  }

  if (!o.oi || !usable(oiSrc.freshness) || o.oi.length < 2)
    return {
      engine: unavailable('positioning', 'Positioning', widgets, why('openInterest', oiSrc.freshness), items),
      crowding,
      derivatives,
    }

  const n = Math.min(OI_PERIODS, o.oi.length - 1)
  const from = o.oi[o.oi.length - 1 - n]
  const to = o.oi[o.oi.length - 1]
  const change = from.usd ? to.usd / from.usd - 1 : 0
  const a = closeAt(o.candles, from.time)
  const b = o.candles.at(-1)?.close ?? null
  const move = a !== null && b !== null && o.atr ? (b - a) / o.atr : null
  let state: SignalState = 'neutral'
  let read = 'Open interest and price have not moved enough to read.'
  if (move !== null && Math.abs(move) >= PRICE_MOVE_ATR && Math.abs(change) >= OI_CHANGE) {
    const up = move > 0
    const rising = change > 0
    state = up && rising ? 'bullish' : !up && rising ? 'bearish' : 'mixed'
    read =
      up && rising
        ? 'Price rose while open interest grew: new positions are being added behind the move.'
        : !up && rising
          ? 'Price fell while open interest grew: new shorts are being added.'
          : up
            ? 'Price rose while open interest shrank: shorts closing, a weaker rally.'
            : 'Price fell while open interest shrank: longs closing out.'
  }
  // a move carried by the crowded side is the one that gets squeezed
  if ((state === 'bullish' && crowding === 'long') || (state === 'bearish' && crowding === 'short')) {
    read += ` The ${crowding}s are already crowded, so the move is fragile.`
    state = 'mixed'
  }
  items.unshift(
    item('open-interest', 'oi', state, `${read} (${fmtSigned(change * 100, 1)}% over ${n} periods)`, oiSrc, true, {
      metric: 'OI change',
      value: Number((change * 100).toFixed(2)),
      unit: '%',
    }),
  )
  const fresh = worst([oiSrc.freshness, ...(ratio !== undefined ? [lsSrc.freshness] : [])])
  return {
    engine: { id: 'positioning', title: 'Positioning', state, reason: read, widgets, freshness: fresh, items },
    crowding,
    derivatives,
  }
}

// ---- 5. forced flows -----------------------------------------------------------------------------------------

export function forcedEngine(o: {
  feeds: Feeds
  events: { time: number; side: 'long' | 'short'; usd: number }[] | null
  now: number
  lookbackMs: number
}): Engine {
  const widgets: Engine['widgets'] = ['liquidations']
  const src = o.feeds.liquidations
  if (!o.events || !usable(src.freshness))
    return unavailable('forced', 'Forced flows', widgets, why('liquidations', src.freshness))
  const recent = o.events.filter((e) => e.time >= o.now - o.lookbackMs)
  const longs = recent.filter((e) => e.side === 'long').reduce((a, e) => a + e.usd, 0)
  const shorts = recent.filter((e) => e.side === 'short').reduce((a, e) => a + e.usd, 0)
  const total = longs + shorts
  let state: SignalState = 'neutral'
  let reason = `Quiet: ${recent.length} forced closes in the last ${Math.round(o.lookbackMs / 60_000)} min.`
  if (recent.length >= LIQ_MIN_EVENTS && total > 0) {
    const longShare = longs / total
    if (longShare >= LIQ_DOMINANCE) {
      state = 'bearish'
      reason = `Longs were forced out: ${fmtUsd(longs)} of ${fmtUsd(total)} over ${recent.length} closes (forced selling, often near an exhaustion).`
    } else if (longShare <= 1 - LIQ_DOMINANCE) {
      state = 'bullish'
      reason = `Shorts were forced out: ${fmtUsd(shorts)} of ${fmtUsd(total)} over ${recent.length} closes (forced buying, often near an exhaustion).`
    } else reason = `Forced closes were two-sided: ${fmtUsd(longs)} longs, ${fmtUsd(shorts)} shorts.`
  }
  return {
    id: 'forced',
    title: 'Forced flows',
    state,
    reason,
    widgets,
    freshness: src.freshness,
    items: [
      item('liquidations', 'liquidations', state, reason, src, true, {
        metric: 'forced USD',
        value: Math.round(total),
        unit: 'USD',
      }),
    ],
  }
}
