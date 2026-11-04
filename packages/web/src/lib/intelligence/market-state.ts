import type { Candle } from '@crypz/exchanges'
import { atr } from '@/lib/indicators/fvg'
import { marketStructure, type Structure } from '@/lib/indicators/structure'
import type { MarketState } from './types'

// The state of the market on the analysis bar: structure, trend, momentum, volatility. Every label comes from an
// explicit rule over the candles and says `unclear` when there is not enough to apply it. The constants below are
// the thresholds, in one place so a documented rule and the code cannot drift apart.

/** Fewer bars than this and nothing is labelled. */
export const MIN_BARS = 60
/** A structure break this recent (in outcome windows) that changed character means the market is transitioning. */
export const RECENT_CHOCH_WINDOWS = 3
/** No break for this many bars while price sits between the last swing high and low: a range, whatever the trend was. */
export const RANGE_BARS = 80
/** Volatility is the latest ATR over the median of the ATRs before it: under LOW is low, over HIGH is high. */
export const VOL_LOW = 0.75
export const VOL_HIGH = 1.35
/** ATRs of net move over a span below which momentum has no direction. */
export const MOM_MIN = 0.5
/** A move this much bigger (smaller) than the span before it is strengthening (weakening). */
export const MOM_UP = 1.25
export const MOM_DOWN = 0.75

export type StateRefs = {
  /** The last swing high not yet closed above, else the highest high of the last RANGE_BARS bars. */
  high: number
  low: number
  source: 'swing' | 'range'
}

export type StateResult = {
  state: Pick<MarketState, 'structure' | 'trend' | 'momentum' | 'volatility'>
  structure: Structure
  atr: number | null
  refs: StateRefs | null
  /** The last change of character within RECENT_CHOCH_WINDOWS windows, and its direction. */
  choch: 'up' | 'down' | null
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export function marketState(candles: Candle[], o: { window: number; swing: number }): StateResult {
  const structure = marketStructure(candles, o.swing)
  const unclear: StateResult = {
    state: {
      structure: 'unclear',
      trend: 'unclear',
      momentum: { state: 'unclear', direction: null },
      volatility: { state: 'unclear', ratio: null },
    },
    structure,
    atr: null,
    refs: null,
    choch: null,
  }
  if (candles.length < MIN_BARS) return unclear

  const last = candles.length - 1
  const a = atr(candles).filter((x) => !Number.isNaN(x))
  const now = a.at(-1) ?? null

  // -- volatility
  let volatility: StateResult['state']['volatility'] = { state: 'unclear', ratio: null }
  const baseline = a.slice(-105, -5)
  if (now !== null && baseline.length >= 35) {
    const ratio = now / median(baseline)
    volatility = { state: ratio < VOL_LOW ? 'low' : ratio > VOL_HIGH ? 'high' : 'normal', ratio }
  }

  // -- momentum: net move of the last n bars against the n before, in ATRs
  const n = Math.max(5, o.window * 2)
  let momentum: StateResult['state']['momentum'] = { state: 'unclear', direction: null }
  if (now && last - 2 * n >= 0) {
    const net = (candles[last].close - candles[last - n].close) / now
    const prev = (candles[last - n].close - candles[last - 2 * n].close) / now
    const dir = (x: number) => (x > 0 ? ('up' as const) : ('down' as const))
    if (Math.abs(net) < MOM_MIN) {
      momentum =
        Math.abs(prev) >= MOM_MIN ? { state: 'weakening', direction: dir(prev) } : { state: 'neutral', direction: null }
    } else if (Math.sign(net) !== Math.sign(prev) && Math.abs(prev) >= MOM_MIN) {
      momentum = { state: 'strengthening', direction: dir(net) } // the move turned and is now going the other way
    } else {
      const grow = Math.abs(net) / (Math.abs(prev) || Number.EPSILON)
      momentum = {
        state: grow >= MOM_UP ? 'strengthening' : grow <= MOM_DOWN ? 'weakening' : 'neutral',
        direction: dir(net),
      }
    }
  }

  // -- structure
  const price = candles[last].close
  const lastBreak = structure.breaks.at(-1)
  const sinceBreak = lastBreak ? last - lastBreak.index : Infinity
  const choch = lastBreak?.type === 'CHoCH' && sinceBreak <= RECENT_CHOCH_WINDOWS * o.window ? lastBreak.dir : null
  const inside =
    structure.lastHigh && structure.lastLow && price <= structure.lastHigh.price && price >= structure.lastLow.price
  let label: MarketState['structure']
  if (structure.swings.length < 4) label = 'unclear'
  else if (choch) label = 'transitioning'
  else if (!structure.trend || (inside && sinceBreak > RANGE_BARS)) label = 'ranging'
  else label = structure.trend === 'up' ? 'bullish' : 'bearish'

  // -- trend: how the newest swing of each kind compares with the one before it
  const lastOf = (kind: 'high' | 'low') => structure.swings.filter((s) => s.kind === kind && s.label).at(-1)?.label
  const hi = lastOf('high')
  const lo = lastOf('low')
  let trend: MarketState['trend'] = 'unclear'
  if (label !== 'unclear') {
    if (label === 'ranging') trend = 'range'
    else if (label === 'transitioning') trend = 'transition'
    else if (hi === 'HH' && lo === 'HL') trend = 'higher_highs_higher_lows'
    else if (hi === 'LH' && lo === 'LL') trend = 'lower_highs_lower_lows'
    else trend = 'transition'
  }

  // -- reference levels for the outcome definitions
  let refs: StateRefs | null = null
  if (structure.lastHigh && structure.lastLow)
    refs = { high: structure.lastHigh.price, low: structure.lastLow.price, source: 'swing' }
  else {
    const recent = candles.slice(-RANGE_BARS)
    refs = {
      high: Math.max(...recent.map((k) => k.high)),
      low: Math.min(...recent.map((k) => k.low)),
      source: 'range',
    }
  }

  return { state: { structure: label, trend, momentum, volatility }, structure, atr: now, refs, choch }
}
