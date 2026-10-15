import type { Candle } from '@crypz/exchanges'

// Manual bar replay: the session only ever sees candles up to the cursor. Pure state, no chart or fetching here.

export type Side = 'long' | 'short'
export type ExitReason = 'stop' | 'target' | 'manual'

export type OpenPosition = {
  side: Side
  entry: number
  /** Close time of the bar the order filled on (ms open time of that bar). */
  entryTime: number
  stop: number | null
  target: number | null
}

export type ReplayTrade = OpenPosition & {
  id: number
  exit: number
  exitTime: number
  reason: ExitReason
  /** Price move in % of entry, signed by direction. */
  pct: number
  /** Result in multiples of the initial stop distance; null when no stop was set. */
  r: number | null
}

export type ReplayState = {
  /** Bars revealed after the start bar. */
  step: number
  position: OpenPosition | null
  trades: ReplayTrade[]
}

export type ReplayAction =
  | { type: 'step'; candle: Candle }
  | { type: 'open'; side: Side; candle: Candle; stop: number | null; target: number | null }
  | { type: 'levels'; stop: number | null; target: number | null }
  | { type: 'close'; candle: Candle }

export const initialReplay: ReplayState = { step: 0, position: null, trades: [] }

const dir = (side: Side) => (side === 'long' ? 1 : -1)

function settle(state: ReplayState, exit: number, exitTime: number, reason: ExitReason): ReplayState {
  const p = state.position!
  const move = dir(p.side) * (exit - p.entry)
  const trade: ReplayTrade = {
    ...p,
    id: state.trades.length + 1,
    exit,
    exitTime,
    reason,
    pct: (move / p.entry) * 100,
    r: p.stop !== null ? move / Math.abs(p.entry - p.stop) : null,
  }
  return { ...state, position: null, trades: [...state.trades, trade] }
}

/**
 * Did the new bar take out the stop or target? A bar that spans both is scored as the stop: the candle alone
 * cannot say which came first, so assume the worse. A gap through a level fills at the bar's open.
 */
export function exitOn(p: OpenPosition, k: Candle): { price: number; reason: ExitReason } | null {
  if (p.side === 'long') {
    if (p.stop !== null && k.low <= p.stop) return { price: Math.min(p.stop, k.open), reason: 'stop' }
    if (p.target !== null && k.high >= p.target) return { price: Math.max(p.target, k.open), reason: 'target' }
  } else {
    if (p.stop !== null && k.high >= p.stop) return { price: Math.max(p.stop, k.open), reason: 'stop' }
    if (p.target !== null && k.low <= p.target) return { price: Math.min(p.target, k.open), reason: 'target' }
  }
  return null
}

export function replayReducer(state: ReplayState, a: ReplayAction): ReplayState {
  switch (a.type) {
    case 'step': {
      const next = { ...state, step: state.step + 1 }
      const hit = state.position && exitOn(state.position, a.candle)
      return hit ? settle(next, hit.price, a.candle.time, hit.reason) : next
    }
    case 'open':
      if (state.position) return state
      return {
        ...state,
        position: { side: a.side, entry: a.candle.close, entryTime: a.candle.time, stop: a.stop, target: a.target },
      }
    case 'levels':
      return state.position ? { ...state, position: { ...state.position, stop: a.stop, target: a.target } } : state
    case 'close':
      return state.position ? settle(state, a.candle.close, a.candle.time, 'manual') : state
  }
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
