import { BAR_MS, type Bar, type Candle } from '@crypz/exchanges'

// Manual bar replay: the session only ever sees candles up to the cursor. Pure state, no chart or fetching here.

export type Side = 'long' | 'short'
export type ExitReason = 'stop' | 'target' | 'manual' | 'liquidated'

export const LEVERAGES = [2, 5, 10, 15, 20, 100] as const
export const DEFAULT_LEVERAGE = 10

export type OpenPosition = {
  side: Side
  entry: number
  /** Close time of the bar the order filled on (ms open time of that bar). */
  entryTime: number
  stop: number | null
  target: number | null
  leverage: number
  /** Price where the margin is gone (isolated margin, fees and maintenance margin ignored). */
  liq: number
}

/** A limit order waiting for price to reach it; fills on the first bar that touches `price`. */
export type PendingOrder = {
  side: Side
  price: number
  stop: number | null
  target: number | null
  leverage: number
}

export type ReplayTrade = OpenPosition & {
  id: number
  exit: number
  exitTime: number
  reason: ExitReason
  /** Return on margin in %: the price move times leverage, never below −100. */
  pct: number
  /** Result in multiples of the initial stop distance; null when no stop was set. */
  r: number | null
}

export type ReplayState = {
  /**
   * The replay clock (ms): every candle that has closed by this moment is visible, nothing later is. A time, not a
   * bar count, so switching interval keeps your place instead of starting over.
   */
  now: number
  /** Where the clock started, for "time elapsed" readouts. */
  start: number
  position: OpenPosition | null
  /** At most one, and never alongside a position. */
  pending: PendingOrder | null
  trades: ReplayTrade[]
}

export type ReplayAction =
  /** Reveal `candle`, which closes at `closesAt`. */
  | { type: 'step'; candle: Candle; closesAt: number }
  | { type: 'open'; side: Side; candle: Candle; stop: number | null; target: number | null; leverage: number }
  /** Place a limit order at `price`; the order's levels are whatever the ticket holds. */
  | { type: 'order'; side: Side; price: number; stop: number | null; target: number | null; leverage: number }
  /** Drag the pending order to a new price. */
  | { type: 'move'; price: number }
  | { type: 'cancel' }
  | { type: 'levels'; stop: number | null; target: number | null }
  | { type: 'close'; candle: Candle }
  /** Drop the open position and every trade; the clock stays where it is. */
  | { type: 'reset' }

export const initialReplay = (now: number): ReplayState => ({
  now,
  start: now,
  position: null,
  pending: null,
  trades: [],
})

const dir = (side: Side) => (side === 'long' ? 1 : -1)

/** Where a position at `entry` with this leverage loses its whole margin. */
export const liqPrice = (side: Side, entry: number, leverage: number) => entry * (1 - dir(side) / leverage)

/** Return on margin in % if the position closed at `price`. */
export const roe = (p: Pick<OpenPosition, 'side' | 'entry' | 'leverage'>, price: number) =>
  Math.max(-100, ((dir(p.side) * (price - p.entry)) / p.entry) * 100 * p.leverage)

function settle(state: ReplayState, exit: number, exitTime: number, reason: ExitReason): ReplayState {
  const p = state.position!
  const move = dir(p.side) * (exit - p.entry)
  const trade: ReplayTrade = {
    ...p,
    id: state.trades.length + 1,
    exit,
    exitTime,
    reason,
    pct: reason === 'liquidated' ? -100 : roe(p, exit),
    r: p.stop !== null ? move / Math.abs(p.entry - p.stop) : null,
  }
  return { ...state, position: null, trades: [...state.trades, trade] }
}

/**
 * Did the new bar take out the stop, the liquidation price or the target? Price travels from entry, so whichever
 * adverse level sits closer to entry (stop or liquidation) goes first. A bar that spans an adverse level and the
 * target is scored as the adverse one: the candle alone cannot say which came first, so assume the worse.
 * A gap through the stop fills at the bar's open; liquidation always costs exactly the margin.
 */
function exitOn(p: OpenPosition, k: Candle): { price: number; reason: ExitReason } | null {
  const d = dir(p.side)
  const stopFirst = p.stop !== null && d * (p.stop - p.liq) > 0
  const adverse = stopFirst ? p.stop! : p.liq
  const reached = (level: number) => (d > 0 ? k.low <= level : k.high >= level)
  if (reached(adverse))
    return stopFirst
      ? { price: d > 0 ? Math.min(adverse, k.open) : Math.max(adverse, k.open), reason: 'stop' }
      : { price: p.liq, reason: 'liquidated' }
  if (p.target !== null && (d > 0 ? k.high >= p.target : k.low <= p.target))
    return { price: d > 0 ? Math.max(p.target, k.open) : Math.min(p.target, k.open), reason: 'target' }
  return null
}

/** Where a bar fills a limit order, or null when it never reached it. A gap through the price fills at the open. */
export function limitFill(o: Pick<PendingOrder, 'side' | 'price'>, k: Candle): number | null {
  if (o.side === 'long') return k.low <= o.price ? Math.min(o.price, k.open) : null
  return k.high >= o.price ? Math.max(o.price, k.open) : null
}

const openAt = (side: Side, entry: number, entryTime: number, o: Omit<PendingOrder, 'side' | 'price'>) => ({
  side,
  entry,
  entryTime,
  stop: o.stop,
  target: o.target,
  leverage: o.leverage,
  liq: liqPrice(side, entry, o.leverage),
})

export function replayReducer(state: ReplayState, a: ReplayAction): ReplayState {
  switch (a.type) {
    case 'step': {
      const next = { ...state, now: Math.max(state.now, a.closesAt) }
      const o = state.pending
      const filled = o && limitFill(o, a.candle)
      // the bar that fills an order is not also checked against its stop and target: a candle cannot say which
      // came first, so the position starts on the next bar
      if (o && filled !== null) return { ...next, pending: null, position: openAt(o.side, filled, a.candle.time, o) }
      const hit = state.position && exitOn(state.position, a.candle)
      return hit ? settle(next, hit.price, a.candle.time, hit.reason) : next
    }
    case 'open':
      if (state.position) return state
      // a market order fills now and takes any limit order's place
      return { ...state, pending: null, position: openAt(a.side, a.candle.close, a.candle.time, a) }
    case 'order':
      if (state.position || state.pending) return state
      return {
        ...state,
        pending: { side: a.side, price: a.price, stop: a.stop, target: a.target, leverage: a.leverage },
      }
    case 'move':
      return state.pending ? { ...state, pending: { ...state.pending, price: a.price } } : state
    case 'cancel':
      return { ...state, pending: null }
    case 'levels':
      if (state.pending) return { ...state, pending: { ...state.pending, stop: a.stop, target: a.target } }
      return state.position ? { ...state, position: { ...state.position, stop: a.stop, target: a.target } } : state
    case 'close':
      return state.position ? settle(state, a.candle.close, a.candle.time, 'manual') : state
    case 'reset':
      return { ...state, position: null, pending: null, trades: [] }
  }
}

/** Why a limit order cannot rest at `price`: a buy waits below the last price, a sell above it. */
export function limitError(side: Side, last: number, price: number, stop: number | null, target: number | null) {
  const d = dir(side)
  if (d * (last - price) <= 0)
    return `A ${side === 'long' ? 'buy' : 'sell'} limit must be ${side === 'long' ? 'below' : 'above'} price.`
  return levelError(side, price, stop, target)
}

/** Why a stop/target cannot be used for this side at this price, or null when it is fine. */
export function levelError(side: Side, price: number, stop: number | null, target: number | null) {
  const d = dir(side)
  if (stop !== null && d * (price - stop) <= 0) return `Stop must be ${side === 'long' ? 'below' : 'above'} price.`
  if (target !== null && d * (target - price) <= 0)
    return `Target must be ${side === 'long' ? 'above' : 'below'} price.`
  return null
}

export function sessionStats(trades: ReplayTrade[]) {
  const wins = trades.filter((t) => t.pct > 0).length
  const withR = trades.filter((t) => t.r !== null)
  return {
    count: trades.length,
    winRate: trades.length ? wins / trades.length : null,
    net: trades.reduce((s, t) => s + t.pct, 0),
    avgR: withR.length ? withR.reduce((s, t) => s + t.r!, 0) / withR.length : null,
  }
}

// ---- the forming candle -------------------------------------------------------------------------------------
// On a higher timeframe the bar the clock sits inside has opened but not closed. It is drawn as it stood at the
// clock, built from finer candles that had all closed by then, so its close is the same last price every timeframe
// shows and nothing past the clock leaks in.

const FINE: Bar[] = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '6H', '12H', '1D']
const MAX_FINE = 300

/**
 * The finest bar that splits [open, now) exactly (both ends on its boundaries, so every one of its candles has
 * closed by `now`) in at most 300 candles. Without an exact fit, the finest within the budget: its last candle may
 * end a little before the clock.
 */
export function fineBar(bar: Bar, open: number, now: number): Bar | null {
  const fits = FINE.filter((f) => BAR_MS[f] < BAR_MS[bar] && (now - open) / BAR_MS[f] <= MAX_FINE)
  return fits.find((f) => open % BAR_MS[f] === 0 && now % BAR_MS[f] === 0) ?? fits.at(-1) ?? null
}

/** OHLC of the finer candles that closed by `now`, as one candle opening at `open`. */
export function formingCandle(fine: Candle[], fineMs: number, open: number, now: number): Candle | null {
  const inside = fine.filter((k) => k.time >= open && k.time + fineMs <= now)
  if (!inside.length) return null
  return {
    time: open,
    open: inside[0].open,
    high: Math.max(...inside.map((k) => k.high)),
    low: Math.min(...inside.map((k) => k.low)),
    close: inside[inside.length - 1].close,
  }
}
