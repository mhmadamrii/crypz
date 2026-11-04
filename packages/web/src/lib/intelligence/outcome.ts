import type { Candle } from '@crypz/exchanges'
import type { ScenarioId } from './types'

// What each scenario MEANS, as one rule over the candles of an outcome window. This is the single label an outcome
// gets: the six are mutually exclusive and cover every case, so a window is exactly one of them. The same function
// will label history when scenarios are backtested, which is why it takes plain candles and nothing else.
//
// At the start of the window we know three things: the reference high and low (the last unbroken swings), and the
// structure before it (`prior`: up, down or range). The window's closes then decide, in this order:
//
//   1. The last close is above the high:  from an up structure it is bullish_continuation, otherwise bullish_reversal
//      (a break out of a range or a down structure turns it up).
//   2. The last close is below the low:   from a down structure it is bearish_continuation, otherwise bearish_reversal.
//   3. Otherwise, some close went beyond either level but the window ended back inside: failed_breakout.
//   4. Otherwise, every close stayed inside: range.
//
// Closes, not wicks: a wick through a level is a sweep, not a break.

export type Prior = 'up' | 'down' | 'range'

export const SCENARIO_ORDER: ScenarioId[] = [
  'bullish_continuation',
  'bearish_continuation',
  'bullish_reversal',
  'bearish_reversal',
  'range',
  'failed_breakout',
]

export function outcomeOf(window: Candle[], refs: { high: number; low: number }, prior: Prior): ScenarioId | null {
  const last = window.at(-1)
  if (!last) return null
  if (last.close > refs.high) return prior === 'up' ? 'bullish_continuation' : 'bullish_reversal'
  if (last.close < refs.low) return prior === 'down' ? 'bearish_continuation' : 'bearish_reversal'
  if (window.some((k) => k.close > refs.high || k.close < refs.low)) return 'failed_breakout'
  return 'range'
}

/** The structure before the window, in the three values `outcomeOf` knows. A transition counts as the way it broke. */
export function priorOf(
  structure: 'bullish' | 'bearish' | 'ranging' | 'transitioning' | 'unclear',
  choch: 'up' | 'down' | null,
): Prior {
  if (structure === 'bullish') return 'up'
  if (structure === 'bearish') return 'down'
  if (structure === 'transitioning' && choch) return choch
  return 'range'
}
